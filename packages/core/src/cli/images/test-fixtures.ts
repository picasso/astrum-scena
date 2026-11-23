import { createHash } from 'node:crypto'
import { appendFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

import sharp from 'sharp'

import { siteRoot as demoRoot } from '../../config/site-root.ts'
import type { Manifest, PhotoManifestEntry } from '../../lib/images/manifest.ts'
import { writeTags } from './exiftool.ts'
import { JSONL_HEADER } from './jsonl.ts'
import { MASTERS_REGISTRY_PATH } from './masters.ts'
import { PLACE_GPS_BOUNDS_PATH } from './place-gps-bounds.ts'
import { IMMUTABLE_CACHE_CONTROL, type R2Client } from './r2-client.ts'

// a temporary site for the image commands: the demo's files, a synthetic masters root and archive
// outside it, and a master registry that starts empty

export type ImageSite = { site: string; masters: string; archive: string }

export function makeImageSite(scratch: string, name = 'site'): ImageSite {
	const base = path.join(scratch, name)
	const site = path.join(base, 'site')
	cpSync(demoRoot, site, {
		recursive: true,
		filter: (source) => !/(?:^|[\\/])(?:node_modules|dist|\.astro|\.cache)$/.test(source),
	})
	const masters = path.join(base, 'masters')
	const archive = path.join(base, 'archive')
	mkdirSync(masters, { recursive: true })
	mkdirSync(archive, { recursive: true })
	mkdirSync(path.dirname(path.join(site, MASTERS_REGISTRY_PATH)), { recursive: true })
	writeFileSync(path.join(site, MASTERS_REGISTRY_PATH), JSONL_HEADER)
	return { site, masters, archive }
}

export type MasterSpec = {
	// a photo of the demo, whose YAML gains the master identity
	photoId: string
	filename?: string
	width?: number
	height?: number
	year?: string
	gps?: { latitude: number; longitude: number }
}

export const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

// two colored halves, so the master is neither flat nor black-and-white
export async function masterBytes(width: number, height: number): Promise<Buffer> {
	const half = await sharp({
		create: { width: Math.ceil(width / 2), height, channels: 3, background: '#2a6f97' },
	})
		.png()
		.toBuffer()
	return sharp({ create: { width, height, channels: 3, background: '#e9c46a' } })
		.composite([{ input: half, left: 0, top: 0 }])
		.jpeg({ quality: 90 })
		.toBuffer()
}

// writes the master, its archive copy under `<year>/`, its registry row and its photo identity
export async function addMaster(fixture: ImageSite, spec: MasterSpec): Promise<string> {
	const filename = spec.filename ?? `${spec.photoId}.jpg`
	const file = path.join(fixture.masters, filename)
	writeFileSync(file, await masterBytes(spec.width ?? 900, spec.height ?? 600))
	if (spec.gps) {
		const { latitude, longitude } = spec.gps
		await writeTags(file, {
			GPSLatitude: Math.abs(latitude),
			GPSLatitudeRef: latitude < 0 ? 'S' : 'N',
			GPSLongitude: Math.abs(longitude),
			GPSLongitudeRef: longitude < 0 ? 'W' : 'E',
		})
	}
	const bytes = readFileSync(file)
	const digest = sha256(bytes)
	const yearDir = path.join(fixture.archive, spec.year ?? '2024')
	mkdirSync(yearDir, { recursive: true })
	writeFileSync(path.join(yearDir, filename), bytes)
	appendFileSync(
		path.join(fixture.site, MASTERS_REGISTRY_PATH),
		`${JSON.stringify({ id: spec.photoId, masterFilename: filename, masterSha256: digest })}\n`,
	)
	const photo = path.join(fixture.site, 'src/content/photos', `${spec.photoId}.yaml`)
	appendFileSync(photo, `sha256: ${digest}\nmaster: ${filename}\n`)
	return digest
}

export const rootsOptions = (fixture: ImageSite): string[] => [
	'--masters',
	fixture.masters,
	'--archive',
	fixture.archive,
]

// a manifest with one AVIF derivative per photo whose bytes are given, for the bucket tests that
// need no real image
export function syntheticManifest(
	photos: Readonly<Record<string, Buffer>>,
	configDigest = 'a'.repeat(64),
): Manifest {
	const entries = Object.entries(photos).map(([photoId, bytes]) => {
		const digest = sha256(bytes)
		const entry: PhotoManifestEntry = {
			masterSha256: 'b'.repeat(64),
			sourceWidth: 1600,
			sourceHeight: 1067,
			orientation: 1,
			dominantColor: '#161a20',
			rightsId: 'rights-1',
			derivatives: [
				{
					width: 512,
					height: 341,
					format: 'avif',
					objectKey: `${photoId}/512w-${digest}.avif`,
					sha256: digest,
					byteSize: bytes.length,
					rightsEmbedded: false,
					privacyChecked: true,
					watermarkProfile: 'none',
				},
			],
		}
		return [photoId, entry] as const
	})
	return { schemaVersion: 3, configDigest, photos: Object.fromEntries(entries) }
}

type FakeObject = {
	body: Buffer
	contentType?: string
	cacheControl?: string
	// undefined models a missing checksum
	checksumSha256?: string
	// HEAD reports this instead of body.length, modelling a wrong length
	contentLengthOverride?: number
}

export type FakeR2Client = R2Client & {
	objects: Map<string, FakeObject>
	calls: { head: number; put: number; get: number; list: number }
	callCount: () => number
	// an object left by an earlier successful sync
	seed: (key: string, body: Buffer, checksumSha256: string) => void
	// any object, possibly corrupt, for negative verification tests
	seedRaw: (key: string, object: FakeObject) => void
}

// an in-memory bucket that counts every call, so tests can prove zero requests on a local failure;
// with `failPutAfter`, the put after that many successful ones throws, modelling a partial upload
export function createFakeR2Client(options: { failPutAfter?: number } = {}): FakeR2Client {
	const objects = new Map<string, FakeObject>()
	const calls = { head: 0, put: 0, get: 0, list: 0 }
	let puts = 0
	return {
		objects,
		calls,
		callCount: () => calls.head + calls.put + calls.get + calls.list,
		seed: (key, body, checksumSha256) =>
			objects.set(key, {
				body: Buffer.from(body),
				cacheControl: IMMUTABLE_CACHE_CONTROL,
				checksumSha256,
			}),
		seedRaw: (key, object) => objects.set(key, { ...object, body: Buffer.from(object.body) }),
		head: async (key) => {
			calls.head += 1
			const object = objects.get(key)
			if (!object) return null
			return {
				contentLength: object.contentLengthOverride ?? object.body.length,
				checksumSha256: object.checksumSha256,
				contentType: object.contentType,
				cacheControl: object.cacheControl,
			}
		},
		put: async (key, body, putOptions) => {
			calls.put += 1
			if (options.failPutAfter !== undefined && puts >= options.failPutAfter)
				throw new Error(`fake R2: simulated put failure at key "${key}"`)
			puts += 1
			objects.set(key, { body: Buffer.from(body), ...putOptions })
		},
		openReadStream: async (key) => {
			calls.get += 1
			const object = objects.get(key)
			if (!object) throw new Error(`fake R2: no object for key "${key}"`)
			return Readable.from([object.body])
		},
		list: async (prefix = '') => {
			calls.list += 1
			return [...objects.keys()].filter((key) => key.startsWith(prefix)).sort()
		},
	}
}

// the steps of UPGRADING.md for the image data files of a site from the release before

// the zones move next to the places and `version` becomes `schemaVersion`; every other byte stays
export function upgradePlaceGpsBounds(site: string): void {
	const legacy = path.join(site, 'config/place-gps-bounds.yaml')
	const raw = readFileSync(legacy, 'utf8')
	writeFileSync(
		path.join(site, PLACE_GPS_BOUNDS_PATH),
		raw.replace(/^version: 1$/m, 'schemaVersion: 1'),
	)
	rmSync(legacy)
}

// one line before the rows, which stay as they are
export const upgradeJsonl = (raw: string): string => JSONL_HEADER + raw
