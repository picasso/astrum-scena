import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { parseManifest, serializeManifest } from '../../../lib/images/manifest.ts'
import {
	buildReleaseDescriptor,
	loadReleaseDescriptor,
	releaseDescriptorPath,
	releaseDirPath,
	releaseManifestPath,
	serializeReleaseDescriptor,
} from '../../../lib/images/release.ts'
import { runAstrumScena } from '../../test-fixtures.ts'
import { endExifTool, readNamespacedTags, writeTags } from '../exiftool.ts'
import { PLACE_GPS_BOUNDS_PATH } from '../place-gps-bounds.ts'
import { addMaster, type ImageSite, makeImageSite, rootsOptions, sha256 } from '../test-fixtures.ts'
import { timestampReleaseId } from './images-build.ts'

// the pipeline on a synthetic master in a temporary site: build, check, activate, then the gates
// that read the tracked descriptor

const scratch = mkdtempSync(path.join(tmpdir(), 'astrum-scena-images-build-'))
afterAll(async () => {
	await endExifTool()
	rmSync(scratch, { recursive: true, force: true })
})

const RELEASE = 'synthetic-01'
const PHOTO = 'amber-dunes'

let fixture: ImageSite
let digest: string
let build: Awaited<ReturnType<typeof runAstrumScena>>

beforeAll(async () => {
	fixture = makeImageSite(scratch)
	digest = await addMaster(fixture, { photoId: PHOTO })
	build = await runAstrumScena(fixture.site, [
		'images',
		'build',
		...rootsOptions(fixture),
		'--release',
		RELEASE,
		'--photos',
		PHOTO,
	])
}, 120_000)

describe('images build', () => {
	it('cuts a release with XMP rights in every derivative', async () => {
		expect(build.status, build.stderr).toBe(0)
		expect(build.stdout).toContain(`release:     ${RELEASE}`)
		const releaseDir = releaseDirPath(fixture.site, RELEASE)
		const manifest = parseManifest(
			JSON.parse(readFileSync(releaseManifestPath(releaseDir), 'utf8')),
		)
		const photo = manifest.photos[PHOTO]!
		expect(Object.keys(manifest.photos)).toEqual([PHOTO])
		expect(photo.masterSha256).toBe(digest)
		expect(photo.derivatives.map((derivative) => derivative.width)).toContain(900)
		for (const derivative of photo.derivatives) {
			expect(derivative.rightsEmbedded, derivative.objectKey).toBe(true)
			const file = path.join(releaseDir, derivative.objectKey)
			expect(existsSync(file), derivative.objectKey).toBe(true)
			const tags = await readNamespacedTags(file)
			expect(tags['XMP-dc:Identifier']).toBe('astrum-scena-demo')
			expect(tags.GPSLatitude).toBeUndefined()
		}
		expect(existsSync(releaseDirPath(fixture.site, `.staging-${RELEASE}`))).toBe(false)
	})

	it('passes check-derivatives, then activates into a descriptor the gates accept', async () => {
		const checked = await runAstrumScena(fixture.site, [
			'images',
			'check-derivatives',
			'--release',
			RELEASE,
		])
		expect(checked.status, checked.stderr).toBe(0)
		expect(checked.stdout).toContain('images check-derivatives OK')

		const activated = await runAstrumScena(fixture.site, [
			'images',
			'activate',
			'--release',
			RELEASE,
		])
		expect(activated.status, activated.stderr).toBe(0)
		const { descriptor } = loadReleaseDescriptor(fixture.site)
		expect(descriptor.active).toBe(true)
		expect(Object.keys(descriptor.manifest.photos)).toEqual([PHOTO])
		expect(descriptor.manifest.photos[PHOTO]!.masterSha256).toBe(digest)

		const policy = await runAstrumScena(fixture.site, ['check', 'images-policy'])
		expect(policy.status, policy.stderr).toBe(0)
		expect(policy.stdout).toContain('photos: 1')

		// without --release it finds the cache release the active descriptor came from
		const tracked = await runAstrumScena(fixture.site, ['images', 'check-derivatives'])
		expect(tracked.status, tracked.stderr).toBe(0)
		expect(tracked.stdout).toContain(`release:     ${RELEASE}`)
	}, 60_000)

	it('fails check-derivatives on a changed derivative', async () => {
		const copy = makeImageSite(scratch, 'drift')
		await addMaster(copy, { photoId: PHOTO })
		const built = await runAstrumScena(copy.site, [
			'images',
			'build',
			...rootsOptions(copy),
			'--release',
			RELEASE,
			'--photos',
			PHOTO,
		])
		expect(built.status, built.stderr).toBe(0)
		const releaseDir = releaseDirPath(copy.site, RELEASE)
		const manifest = parseManifest(
			JSON.parse(readFileSync(releaseManifestPath(releaseDir), 'utf8')),
		)
		const [first] = manifest.photos[PHOTO]!.derivatives
		writeFileSync(path.join(releaseDir, first!.objectKey), 'not an image')
		writeFileSync(path.join(releaseDir, PHOTO, 'extra.webp'), 'x')
		const checked = await runAstrumScena(copy.site, [
			'images',
			'check-derivatives',
			'--release',
			RELEASE,
		])
		expect(checked.status).toBe(1)
		expect(checked.stderr).toContain(`derivative "${first!.objectKey}" sha256 mismatch`)
		expect(checked.stderr).toContain(`unexpected file in release not referenced by manifest`)
		const activated = await runAstrumScena(copy.site, [
			'images',
			'activate',
			'--release',
			RELEASE,
		])
		expect(activated.status).toBe(1)
		expect(activated.stderr).toContain('cache release failed integrity check')
	}, 60_000)

	it('names the options and variables when the roots are missing', async () => {
		const result = await runAstrumScena(fixture.site, ['images', 'build'])
		expect(result.status).not.toBe(0)
		expect(result.stderr).toContain('--masters or IMAGES_MASTERS_ROOT')
		expect(result.stderr).toContain('--archive or IMAGES_ARCHIVE_ROOT')
	})

	it('reads the roots from the environment and the .env of the site root, not of the cwd', async () => {
		const site = makeImageSite(scratch, 'env')
		await addMaster(site, { photoId: PHOTO })
		const elsewhere = path.dirname(site.site)
		const argv = ['images', 'build', '--root', 'site', '--photos', PHOTO]
		const roots = `IMAGES_MASTERS_ROOT=${site.masters}\nIMAGES_ARCHIVE_ROOT=${site.archive}\n`

		writeFileSync(path.join(elsewhere, '.env'), roots)
		const fromCwd = await runAstrumScena(elsewhere, argv)
		expect(fromCwd.status).toBe(1)
		expect(fromCwd.stderr).toContain('--masters or IMAGES_MASTERS_ROOT')

		// the process variable wins over the file, and a blank one does not hide it
		writeFileSync(
			path.join(site.site, '.env'),
			`IMAGES_MASTERS_ROOT=/nowhere\nIMAGES_ARCHIVE_ROOT=${site.archive}\n`,
		)
		const fromSite = await runAstrumScena(elsewhere, [...argv, '--release', 'from-env'], {
			env: { IMAGES_MASTERS_ROOT: site.masters, IMAGES_ARCHIVE_ROOT: '' },
		})
		expect(fromSite.status, fromSite.stderr).toBe(0)
		expect(existsSync(releaseDirPath(site.site, 'from-env'))).toBe(true)
	}, 60_000)

	it('fails on an unknown option with code 2, listing the options of the command', async () => {
		for (const argv of [
			['images', 'build', '--foo'],
			['images', 'build', '--foo', 'bar'],
			['images', 'build', '--compare', 'x'],
		]) {
			const result = await runAstrumScena(fixture.site, argv)
			expect(result.status, argv.join(' ')).toBe(2)
			expect(result.stderr).toContain(`unknown option: ${argv[2]}`)
			expect(result.stderr).toContain(
				'options of images build: --root <dir>, --masters <dir>, --archive <dir>, --release <id>, --photos <ids>',
			)
		}
	})

	it('rejects a release id that is not kebab-case and an unknown photo', async () => {
		const badId = await runAstrumScena(fixture.site, [
			'images',
			'build',
			...rootsOptions(fixture),
			'--release',
			'Bad_Id',
		])
		expect(badId.status).toBe(1)
		expect(badId.stderr).toContain('--release "Bad_Id" must be a kebab-case id')
		const unknown = await runAstrumScena(fixture.site, [
			'images',
			'build',
			...rootsOptions(fixture),
			'--photos',
			'no-such-photo',
		])
		expect(unknown.status).toBe(1)
		expect(unknown.stderr).toContain('content photo "no-such-photo" not found')
		// a demo photo without a master identity
		const unresolved = await runAstrumScena(fixture.site, [
			'images',
			'build',
			...rootsOptions(fixture),
			'--photos',
			'quiet-tower',
		])
		expect(unresolved.status).toBe(1)
		expect(unresolved.stderr).toContain('[not-resolvable]')
	})

	it('warns when the GPS of a master proposes another place than the photo has', async () => {
		const site = makeImageSite(scratch, 'gps')
		// amber-dunes has placeId amber-bay; the point lies in the zone of another place
		await addMaster(site, { photoId: PHOTO, gps: { latitude: 10.5, longitude: 20.5 } })
		writeFileSync(
			path.join(site.site, PLACE_GPS_BOUNDS_PATH),
			[
				'schemaVersion: 1',
				'bounds:',
				'    - placeId: coastland',
				'      box: { south: 0, west: 0, north: 40, east: 40 }',
				'    - placeId: amber-bay',
				'      box: { south: 30, west: 30, north: 35, east: 35 }',
				'',
			].join('\n'),
		)
		const result = await runAstrumScena(site.site, [
			'images',
			'build',
			...rootsOptions(site),
			'--release',
			'gps',
			'--photos',
			PHOTO,
		])
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain(
			`${PHOTO}: gps-place: gps proposal "coastland" conflicts with approved placeId "amber-bay"`,
		)
		// the exact point never reaches the output
		expect(result.stdout).not.toContain('10.5')
	}, 60_000)

	it('fails check-derivatives and activate on a derivative that carries a denied field', async () => {
		const copy = makeImageSite(scratch, 'denied')
		await addMaster(copy, { photoId: PHOTO })
		const built = await runAstrumScena(copy.site, [
			'images',
			'build',
			...rootsOptions(copy),
			'--release',
			RELEASE,
			'--photos',
			PHOTO,
		])
		expect(built.status, built.stderr).toBe(0)
		const releaseDir = releaseDirPath(copy.site, RELEASE)
		const manifest = parseManifest(
			JSON.parse(readFileSync(releaseManifestPath(releaseDir), 'utf8')),
		)
		const derivative = manifest.photos[PHOTO]!.derivatives.find(
			(item) => item.format === 'webp',
		)!
		const oldFile = path.join(releaseDir, derivative.objectKey)
		await writeTags(oldFile, { GPSLatitude: 10.5, GPSLatitudeRef: 'N' })
		// the manifest follows the new bytes, so only the privacy check can fail
		const bytes = readFileSync(oldFile)
		derivative.sha256 = sha256(bytes)
		derivative.byteSize = bytes.length
		derivative.objectKey = `${PHOTO}/${derivative.width}w-${derivative.sha256}.webp`
		renameSync(oldFile, path.join(releaseDir, derivative.objectKey))
		writeFileSync(releaseManifestPath(releaseDir), serializeManifest(manifest))

		const checked = await runAstrumScena(copy.site, [
			'images',
			'check-derivatives',
			'--release',
			RELEASE,
		])
		expect(checked.status).toBe(1)
		expect(checked.stderr).toContain(
			`derivative "${derivative.objectKey}" leaks denied fields: GPSLatitude`,
		)
		expect(checked.stderr).not.toContain('sha256 mismatch')
		const activated = await runAstrumScena(copy.site, [
			'images',
			'activate',
			'--release',
			RELEASE,
		])
		expect(activated.status).toBe(1)
		expect(activated.stderr).toContain('cache release failed integrity check')
		expect(activated.stderr).toContain('leaks denied fields')
	}, 60_000)

	it('rejects a canonical, current descriptor whose ladder is invalid', async () => {
		const file = releaseDescriptorPath(fixture.site)
		const original = readFileSync(file, 'utf8')
		try {
			const { descriptor } = loadReleaseDescriptor(fixture.site)
			const photo = descriptor.manifest.photos[PHOTO]!
			const widest = Math.max(...photo.derivatives.map((item) => item.width))
			photo.derivatives = photo.derivatives.filter((item) => item.width !== widest)
			writeFileSync(
				file,
				serializeReleaseDescriptor(
					buildReleaseDescriptor({ active: true, manifest: descriptor.manifest }),
				),
			)
			const policy = await runAstrumScena(fixture.site, ['check', 'images-policy'])
			expect(policy.status).toBe(1)
			expect(policy.stderr).toContain('ladder policy invalid')
			expect(policy.stderr).not.toContain('not canonical')
			expect(policy.stderr).not.toContain('configDigest')
		} finally {
			writeFileSync(file, original)
		}
	})

	it('stays silent about places without a bounds file', () => {
		expect(build.stdout).not.toContain('gps-place')
	})
})

describe('timestampReleaseId', () => {
	it('is a sortable kebab-case id of the UTC time', () => {
		expect(timestampReleaseId(new Date('2026-11-15T14:26:07.123Z'))).toBe('20261115-142607')
	})
})
