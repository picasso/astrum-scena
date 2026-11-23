import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { IMAGES_PUBLIC_RELATIVE_PATH } from '../../../lib/images/public-config.ts'
import { releaseDirPath, releaseManifestPath } from '../../../lib/images/release.ts'
import { runAstrumScena } from '../../test-fixtures.ts'
import { detectColorMode } from '../colormode.ts'
import { endExifTool } from '../exiftool.ts'
import { addMaster, type ImageSite, makeImageSite, rootsOptions } from '../test-fixtures.ts'

// colormode, ladder-report and the public config on a temporary site with synthetic masters

const scratch = mkdtempSync(path.join(tmpdir(), 'astrum-scena-images-commands-'))
afterAll(async () => {
	await endExifTool()
	rmSync(scratch, { recursive: true, force: true })
})

const PHOTO = 'amber-dunes'
const RELEASE = 'report-01'

let fixture: ImageSite

beforeAll(async () => {
	fixture = makeImageSite(scratch)
	await addMaster(fixture, { photoId: PHOTO })
	const built = await runAstrumScena(fixture.site, [
		'images',
		'build',
		...rootsOptions(fixture),
		'--release',
		RELEASE,
		'--photos',
		PHOTO,
	])
	expect(built.status, built.stderr).toBe(0)
}, 120_000)

describe('images ladder-report', () => {
	it('reports the ladder and replays every derivative from its master', async () => {
		const result = await runAstrumScena(
			fixture.site,
			['images', 'ladder-report', '--release', RELEASE, '--pixels'],
			{ env: { IMAGES_MASTERS_ROOT: fixture.masters, IMAGES_ARCHIVE_ROOT: fixture.archive } },
		)
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain(`images ladder-report ${RELEASE}`)
		expect(result.stdout).toContain('photos: 1; files: 8;')
		expect(result.stdout).toContain('no watermarked file: (none)')
		expect(result.stdout).toContain('pixel replay: 8 files, diff 0')
	}, 60_000)

	it('compares with a release cut before the width ladder', async () => {
		const old = releaseDirPath(fixture.site, 'old-roles')
		mkdirSync(old, { recursive: true })
		writeFileSync(
			releaseManifestPath(old),
			JSON.stringify({
				schemaVersion: 2,
				photos: { a: { roles: { thumb: { derivatives: [{ byteSize: 10 }] } } } },
			}),
		)
		const result = await runAstrumScena(fixture.site, [
			'images',
			'ladder-report',
			'--release',
			RELEASE,
			'--compare',
			'old-roles',
		])
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('compare old-roles: 1 files, 10 bytes')
	})

	it('needs a release, and the masters for --pixels', async () => {
		const missing = await runAstrumScena(fixture.site, ['images', 'ladder-report'])
		expect(missing.status).toBe(1)
		expect(missing.stderr).toContain('--release <id> names the release to report')
		const noRoots = await runAstrumScena(fixture.site, [
			'images',
			'ladder-report',
			'--release',
			RELEASE,
			'--pixels',
		])
		expect(noRoots.status).toBe(1)
		expect(noRoots.stderr).toContain('IMAGES_MASTERS_ROOT')
		// --masters belongs to build and colormode, not to the report
		const foreign = await runAstrumScena(fixture.site, [
			'images',
			'ladder-report',
			'--release',
			RELEASE,
			...rootsOptions(fixture),
		])
		expect(foreign.status).toBe(2)
		expect(foreign.stderr).toContain('unknown option: --masters')
	})
})

describe('images colormode', () => {
	it('writes the detected colorMode into a photo without one and keeps an authored one', async () => {
		const site = makeImageSite(scratch, 'colormode')
		const photos = [
			'amber-dunes',
			'graphite-lines',
			'long-horizon',
			'quiet-tower',
			'still-square',
			'wide-tide',
		]
		// distinct sizes, so no two masters share a sha256
		for (const [index, photoId] of photos.entries())
			await addMaster(site, { photoId, width: 400 + index })
		const file = (photoId: string) =>
			path.join(site.site, 'src/content/photos', `${photoId}.yaml`)
		const authored = readFileSync(file('graphite-lines'), 'utf8')
		writeFileSync(
			file('amber-dunes'),
			readFileSync(file('amber-dunes'), 'utf8').replace('colorMode: color\n', ''),
		)
		const result = await runAstrumScena(site.site, [
			'images',
			'colormode',
			...rootsOptions(site),
		])
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('added:     amber-dunes (color)')
		expect(readFileSync(file('amber-dunes'), 'utf8')).toContain('colorMode: color\n')
		// graphite-lines is authored black-and-white, while its synthetic master is colored
		expect(readFileSync(file('graphite-lines'), 'utf8')).toBe(authored)
		expect(result.stdout).toContain('graphite-lines: kept black-and-white, detected color')
	}, 60_000)

	it('writes nothing when a later photo fails, leaving the earlier files unchanged', async () => {
		const site = makeImageSite(scratch, 'colormode-invalid')
		const photos = ['amber-dunes', 'wide-tide']
		for (const [index, photoId] of photos.entries())
			await addMaster(site, { photoId, width: 400 + index })
		const file = (photoId: string) =>
			path.join(site.site, 'src/content/photos', `${photoId}.yaml`)
		const earlier = readFileSync(file('amber-dunes'), 'utf8').replace('colorMode: color\n', '')
		writeFileSync(file('amber-dunes'), earlier)
		writeFileSync(
			file('wide-tide'),
			readFileSync(file('wide-tide'), 'utf8').replace('colorMode: color', 'colorMode: sepia'),
		)
		for (const photoId of ['graphite-lines', 'long-horizon', 'quiet-tower', 'still-square'])
			rmSync(file(photoId))
		const result = await runAstrumScena(site.site, [
			'images',
			'colormode',
			...rootsOptions(site),
		])
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('invalid colorMode "sepia"')
		expect(readFileSync(file('amber-dunes'), 'utf8')).toBe(earlier)
	}, 60_000)

	it('detects black-and-white from a gray master', async () => {
		const gray = await sharp({
			create: { width: 64, height: 64, channels: 3, background: '#808080' },
		})
			.png()
			.toBuffer()
		expect(await detectColorMode(gray)).toBe('black-and-white')
	})
})

describe('images public-init and check images-public-config', () => {
	it('rewrites the same bytes, and the gate fails on a stale or hand-edited file', async () => {
		const { site } = makeImageSite(scratch, 'public')
		const file = path.join(site, IMAGES_PUBLIC_RELATIVE_PATH)
		const original = readFileSync(file, 'utf8')
		const init = await runAstrumScena(site, ['images', 'public-init'])
		expect(init.status, init.stderr).toBe(0)
		expect(readFileSync(file, 'utf8')).toBe(original)

		writeFileSync(file, original.replace('"credit": "', '"credit": "x'))
		const stale = await runAstrumScena(site, ['check', 'images-public-config'])
		expect(stale.status).toBe(1)
		expect(stale.stderr).toContain('public config is stale')
		expect(stale.stderr).toContain('Regenerate: astrum-scena images public-init')

		writeFileSync(file, JSON.stringify(JSON.parse(original)))
		const handEdited = await runAstrumScena(site, ['check', 'images-public-config'])
		expect(handEdited.status).toBe(1)
		expect(handEdited.stderr).toContain('not canonical')
	})
})
