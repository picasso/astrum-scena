import { createHash } from 'node:crypto'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import sharp, { type Metadata } from 'sharp'

import { computeConfigDigest, type ImageConfig } from '../../lib/images/build/config.ts'
import { type Manifest, serializeManifest } from '../../lib/images/manifest.ts'
import {
	IMAGE_RELEASES_RELATIVE_PATH,
	loadManifestFile,
	RELEASE_MANIFEST_FILENAME,
	releaseManifestPath,
} from '../../lib/images/release.ts'
import { hasPhotoFile } from './content-photos.ts'
import { validateLadderManifest } from './ladder-policy.ts'
import { inspectRights as defaultInspectRights, type RightsInspector } from './metadata.ts'
import { validateCandidateRelease } from './validate-candidate.ts'

// the offline, bidirectional gate of a release under the cache: its files match its manifest
// exactly, with nothing extra, and their rights and privacy metadata read back as recorded. It never
// touches the bucket; the inspector is injectable so tests can skip exiftool

export type CheckResult = {
	ok: boolean
	errors: string[]
	derivativeCount: number
}

async function sha256File(filePath: string): Promise<string> {
	return createHash('sha256')
		.update(await readFile(filePath))
		.digest('hex')
}

async function pathExists(target: string): Promise<boolean> {
	try {
		await stat(target)
		return true
	} catch {
		return false
	}
}

// POSIX separators, so the paths compare equal to manifest keys
async function listFiles(dir: string, base = dir): Promise<string[]> {
	const out: string[] = []
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) out.push(...(await listFiles(full, base)))
		else out.push(path.relative(base, full).split(path.sep).join('/'))
	}
	return out
}

export async function checkRelease(options: {
	releaseDir: string
	config: ImageConfig
	root: string
	inspectRights?: RightsInspector
}): Promise<CheckResult> {
	const { releaseDir, config, root } = options
	const inspectRights = options.inspectRights ?? defaultInspectRights
	const errors: string[] = []
	const add = (message: string): void => {
		errors.push(message)
	}

	let manifest: Manifest
	let manifestRaw: string
	try {
		;({ manifest, raw: manifestRaw } = loadManifestFile(releaseManifestPath(releaseDir)))
	} catch (error) {
		return {
			ok: false,
			errors: [`manifest invalid or missing — ${(error as Error).message}`],
			derivativeCount: 0,
		}
	}

	try {
		validateCandidateRelease(manifest)
	} catch (error) {
		add((error as Error).message)
	}

	const digest = computeConfigDigest(config)
	if (manifest.configDigest !== digest)
		add(`configDigest mismatch (manifest ${manifest.configDigest}, config ${digest})`)
	for (const error of validateLadderManifest(manifest, config)) add(error)
	if (serializeManifest(manifest) !== manifestRaw)
		add('candidate manifest is not canonically serialized')

	let releaseReal: string
	try {
		releaseReal = await realpath(releaseDir)
	} catch (error) {
		add(`could not resolve release directory — ${(error as Error).message}`)
		releaseReal = path.resolve(releaseDir)
	}
	const expectedKeys = new Set<string>()
	let derivativeCount = 0

	for (const [photoId, entry] of Object.entries(manifest.photos)) {
		if (!hasPhotoFile(root, photoId)) add(`manifest photo "${photoId}" has no content file`)

		for (const derivative of entry.derivatives) {
			derivativeCount += 1
			const key = derivative.objectKey

			if (expectedKeys.has(key)) {
				add(`duplicate objectKey "${key}"`)
				continue
			}
			expectedKeys.add(key)

			// the manifest is untrusted: reject keys that could escape the release before path.join
			const segments = key.split('/')
			if (
				path.isAbsolute(key) ||
				key.includes('\\') ||
				segments.includes('..') ||
				segments.includes('')
			) {
				add(`derivative key "${key}" is not a safe relative path`)
				continue
			}
			if (!key.startsWith(`${photoId}/`)) {
				add(`derivative key "${key}" is not namespaced by ${photoId}/`)
				continue
			}
			const lowerKey = key.toLowerCase()
			if (lowerKey.endsWith('.jpg') || lowerKey.endsWith('.jpeg'))
				add(`derivative key "${key}" is a forbidden master-like .jpg output`)

			const filePath = path.join(releaseDir, key)
			if (!(await pathExists(filePath))) {
				add(`derivative file missing for key "${key}"`)
				continue
			}

			// a file or exiftool failure becomes a recorded error, never a throw out of checkRelease
			try {
				// a symlinked key must not read a file outside the release
				const fileReal = await realpath(filePath)
				if (fileReal !== releaseReal && !fileReal.startsWith(releaseReal + path.sep)) {
					add(`derivative "${key}" resolves outside the release directory`)
					continue
				}

				const size = (await stat(filePath)).size
				if (size !== derivative.byteSize)
					add(`derivative "${key}" byteSize ${derivative.byteSize} != actual ${size}`)
				if ((await sha256File(filePath)) !== derivative.sha256)
					add(`derivative "${key}" sha256 mismatch (content drift)`)

				let meta: Metadata | null = null
				try {
					meta = await sharp(await readFile(filePath)).metadata()
				} catch {
					add(`derivative "${key}" is not a decodable image`)
				}
				if (meta) {
					const expectFormat = derivative.format === 'avif' ? 'heif' : 'webp'
					if (meta.format !== expectFormat)
						add(
							`derivative "${key}" MIME/format is ${meta.format}, expected ${derivative.format}`,
						)
					if (meta.width !== derivative.width || meta.height !== derivative.height)
						add(
							`derivative "${key}" dimensions drift (manifest ${derivative.width}x${derivative.height})`,
						)
				}

				if (derivative.privacyChecked !== true)
					add(`derivative "${key}" is not privacyChecked`)

				// re-inspected with the same toolchain, so the recorded rightsEmbedded stays honest
				const inspection = await inspectRights(filePath, {
					rights: config.rights,
					deniedFields: config.privacy.deniedFields,
				})
				if (inspection.deniedFieldsPresent.length > 0)
					add(
						`derivative "${key}" leaks denied fields: ${inspection.deniedFieldsPresent.join(', ')}`,
					)
				if (inspection.rightsEmbedded !== derivative.rightsEmbedded)
					add(
						`derivative "${key}" rightsEmbedded flag ${derivative.rightsEmbedded} != actual ${inspection.rightsEmbedded}`,
					)
			} catch (error) {
				add(`derivative "${key}" verification failed — ${(error as Error).message}`)
			}
		}
	}

	try {
		for (const relative of await listFiles(releaseDir)) {
			if (relative === RELEASE_MANIFEST_FILENAME) continue
			if (!expectedKeys.has(relative))
				add(`unexpected file in release not referenced by manifest: "${relative}"`)
		}
	} catch (error) {
		add(`could not enumerate release files — ${(error as Error).message}`)
	}

	return { ok: errors.length === 0, errors, derivativeCount }
}

// the cache release whose manifest is byte-identical to the manifest of the release descriptor;
// undefined when none is
export async function findReleaseOfManifest(
	root: string,
	manifest: Manifest,
): Promise<string | undefined> {
	const releasesDir = path.join(root, IMAGE_RELEASES_RELATIVE_PATH)
	let names: string[]
	try {
		names = (await readdir(releasesDir, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
			.map((entry) => entry.name)
			.sort()
	} catch {
		return undefined
	}
	const expected = serializeManifest(manifest)
	for (const name of names) {
		const raw = await readFile(releaseManifestPath(path.join(releasesDir, name)), 'utf8').catch(
			() => undefined,
		)
		if (raw === expected) return name
	}
	return undefined
}
