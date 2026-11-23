import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { siteRoot } from './config/site-root.ts'
import { loadImageCatalog, resolveCatalogEnv } from './lib/images/catalog.ts'
import { serializeManifest } from './lib/images/manifest.ts'
import { releaseManifestPath } from './lib/images/release.ts'

// the test harness route and its build flags are gone: Gallery, MoreDocuments and the touch viewer
// are checked on the demo's own pages, so no core source may bring them back under the old names
const FORBIDDEN = ['e2e-harness', 'PORTFOLIO_E2E', 'MORE_DOCS_E2E', 'IMAGES_E2E_']

const SRC = path.dirname(fileURLToPath(import.meta.url))
const SELF = fileURLToPath(import.meta.url)

describe('core sources', () => {
	it('carry no test harness route or harness build flags', () => {
		const files = readdirSync(SRC, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => path.join(entry.parentPath, entry.name))
			.filter((file) => file !== SELF)
		expect(files.length).toBeGreaterThan(0)
		const offenders = files.flatMap((file) => {
			const relative = path.relative(SRC, file)
			const text = readFileSync(file, 'utf8')
			return FORBIDDEN.filter((name) => relative.includes(name) || text.includes(name)).map(
				(name) => `${relative}: ${name}`,
			)
		})
		expect(offenders).toEqual([])
	})
})

// the retired flags select nothing any more: complete or partial, alone or next to a valid local
// image env, they leave the resolved env and the catalog exactly as without them
describe('retired harness image flags', () => {
	const RETIRED: NodeJS.ProcessEnv[] = [
		{
			PORTFOLIO_E2E: '1',
			IMAGES_E2E_MANIFEST: '/abs/manifest.json',
			IMAGES_E2E_ORIGIN: 'http://127.0.0.1:4323',
		},
		{ PORTFOLIO_E2E: '1' },
		{ PORTFOLIO_E2E: 'true' },
		{ IMAGES_E2E_MANIFEST: '/abs/manifest.json' },
		{ IMAGES_E2E_ORIGIN: 'http://127.0.0.1:4323' },
	]

	const scratch = mkdtempSync(path.join(tmpdir(), 'retired-flags-'))
	afterAll(() => rmSync(scratch, { recursive: true, force: true }))
	const manifestPath = releaseManifestPath(scratch)
	writeFileSync(manifestPath, serializeManifest(loadImageCatalog(siteRoot, {}).manifest), 'utf8')
	const local = {
		IMAGES_LOCAL_MANIFEST: manifestPath,
		IMAGES_LOCAL_ORIGIN: 'http://127.0.0.1:4324',
	}

	it('leave a production build on the production catalog', () => {
		for (const retired of RETIRED) {
			expect(resolveCatalogEnv(retired, { dev: false })).toEqual(resolveCatalogEnv({}))
			expect(loadImageCatalog(siteRoot, retired, { dev: false })).toEqual(
				loadImageCatalog(siteRoot, {}, { dev: false }),
			)
		}
	})

	it('leave local images in dev as they are', () => {
		const expected = loadImageCatalog(siteRoot, local, { dev: true })
		expect(expected.originBase).toBe(local.IMAGES_LOCAL_ORIGIN)
		for (const retired of RETIRED) {
			const env = { ...local, ...retired }
			expect(resolveCatalogEnv(env, { dev: true })).toEqual(
				resolveCatalogEnv(local, { dev: true }),
			)
			expect(loadImageCatalog(siteRoot, env, { dev: true })).toEqual(expected)
		}
	})
})
