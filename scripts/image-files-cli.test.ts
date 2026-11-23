import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { runAstrumScena } from '../packages/core/src/cli/test-fixtures.ts'
import { writeSiteConfig } from '../packages/core/src/config/fixtures/site-files.ts'
import { SITE_LOCK_PATH } from '../packages/core/src/config/lock.ts'
import { buildDemoImages, type DemoMaster, writeDemoImages } from './lib/demo-images.ts'

const DEMO = fileURLToPath(new URL('../demo', import.meta.url))
const WATERMARK = 'src/assets/images/watermarks/astrum-scena-mark.png'

// two small masters keep the ladder short: 200, 400, 800 and a watermarked native width
const MASTERS: DemoMaster[] = [
	{
		id: 'small-sky',
		width: 1000,
		height: 600,
		pattern: 'gradient',
		palette: [
			[150, 186, 224],
			[236, 212, 196],
			[88, 110, 132],
			[36, 48, 62],
		],
	},
	{
		id: 'small-shapes',
		width: 300,
		height: 300,
		pattern: 'geometry',
		palette: [
			[238, 230, 214],
			[196, 74, 58],
			[62, 118, 96],
			[40, 36, 44],
		],
	},
]

// encoding the ladder is the slow part, so it runs once and every test starts from a copy
const ENCODE_TIMEOUT = 30_000

let generatedRoot: string
let generated: Awaited<ReturnType<typeof writeDemoImages>>
let root: string
let site: string
const media = (...parts: string[]) => path.join(site, 'public', 'media', ...parts)

const generate = async () => writeDemoImages(site, await buildDemoImages(site, MASTERS))
const useGenerated = () => cpSync(path.join(generatedRoot, 'demo'), site, { recursive: true })

const createSite = (dir: string) => {
	// the lock is what the gate reads; the bin only needs a site config to take the root for a site
	writeSiteConfig(dir, 'schemaVersion: 3\n')
	for (const file of [SITE_LOCK_PATH, WATERMARK]) {
		mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
		cpSync(path.join(DEMO, file), path.join(dir, file))
	}
}

// `astrum-scena check image-files`, run in the site directory
const run = (...args: string[]) => runAstrumScena(site, ['check', 'image-files', ...args])

const objectKeys = (): string[] => {
	const release = JSON.parse(
		readFileSync(path.join(site, 'src/generated/images-release.json'), 'utf8'),
	) as { manifest: { photos: Record<string, { derivatives: { objectKey: string }[] }> } }
	return Object.values(release.manifest.photos).flatMap((photo) =>
		photo.derivatives.map((derivative) => derivative.objectKey),
	)
}

beforeAll(async () => {
	generatedRoot = mkdtempSync(path.join(tmpdir(), 'image-files-generated-'))
	const generatedSite = path.join(generatedRoot, 'demo')
	createSite(generatedSite)
	generated = await writeDemoImages(generatedSite, await buildDemoImages(generatedSite, MASTERS))
}, ENCODE_TIMEOUT)

afterAll(() => {
	rmSync(generatedRoot, { recursive: true, force: true })
})

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), 'image-files-'))
	site = path.join(root, 'demo')
	createSite(site)
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('astrum-scena check image-files', () => {
	it(
		'passes on the generated files, and a rerun writes nothing',
		async () => {
			expect(generated.written).toBeGreaterThan(0)
			useGenerated()
			const checked = await run()
			expect(checked.status, checked.stderr).toBe(0)
			expect(checked.stdout).toContain('path:  public/media')
			expect(checked.stdout).toContain(`files: ${objectKeys().length}`)
			expect((await generate()).written).toBe(0)
		},
		ENCODE_TIMEOUT,
	)

	it('lists a changed and a missing derivative by object key', async () => {
		useGenerated()
		const [changed, missing] = objectKeys()
		writeFileSync(
			media(changed!),
			Buffer.concat([readFileSync(media(changed!)), Buffer.from([0])]),
		)
		unlinkSync(media(missing!))
		const result = await run()
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`changed (size or sha256): ${changed}`)
		expect(result.stderr).toContain(`missing: ${missing}`)
		expect(result.stderr).toContain('(the demo: pnpm demo:images)')
	})

	it('lists a derivative whose bytes changed at the same size', async () => {
		useGenerated()
		const [changed] = objectKeys()
		const bytes = readFileSync(media(changed!))
		const last = bytes.length - 1
		bytes[last] = bytes[last]! ^ 0xff
		writeFileSync(media(changed!), bytes)
		const result = await run()
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`changed (size or sha256): ${changed}`)
	})

	it('fails on a release cut with another images section of the site config', async () => {
		useGenerated()
		const config = path.join(site, SITE_LOCK_PATH)
		writeFileSync(config, readFileSync(config, 'utf8').replace('inset: 24', 'inset: 25'))
		const result = await run()
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('stale release')
		expect(result.stderr).toContain('(the demo: pnpm demo:images)')
	})

	it(
		'lists a file the release does not name, which the generator then removes',
		async () => {
			useGenerated()
			mkdirSync(media('stale'), { recursive: true })
			writeFileSync(media('stale', '200w-old.webp'), 'x')
			const result = await run()
			expect(result.status).toBe(1)
			expect(result.stderr).toContain('not in the release: stale/200w-old.webp')
			expect((await generate()).removed).toEqual(['stale/200w-old.webp'])
			expect((await run()).status).toBe(0)
		},
		ENCODE_TIMEOUT,
	)

	it('has nothing to check for a site on an external origin', async () => {
		mkdirSync(path.join(site, 'src/generated'), { recursive: true })
		writeFileSync(
			path.join(site, 'src/generated/images-public.json'),
			JSON.stringify({
				schemaVersion: 1,
				copyright: 'c',
				credit: 'c',
				ladder: { formats: ['avif'], widths: [200] },
				publicOrigin: 'https://media.example.com',
			}),
		)
		const result = await run()
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('images served from https://media.example.com')
	})

	it('checks the site given by --root', async () => {
		useGenerated()
		cpSync(site, path.join(root, 'other'), { recursive: true })
		rmSync(path.join(site, 'public'), { recursive: true })
		const result = await run('--root', '../other')
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('path:  ../other/public/media')
	})
})
