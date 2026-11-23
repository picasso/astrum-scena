import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { buildSiteConfig } from './config/fixtures/site-config.ts'
import { writeSiteFiles } from './config/fixtures/site-files.ts'
import { SITE_LOCK_ENV } from './config/loader.ts'
import { SITE_LOCK_PATH } from './config/lock.ts'

// the builder reads the enabled modules from the lock, here a fixture lock that SITE_LOCK_PATH points
// the loader at
const scratch: string[] = []
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { force: true, recursive: true })
})
afterEach(() => {
	vi.unstubAllEnvs()
	vi.doUnmock('astro:content')
})

const config = buildSiteConfig()
const lockOf = (site: object): string => {
	const root = mkdtempSync(path.join(tmpdir(), 'core-collections-'))
	scratch.push(root)
	writeSiteFiles(root, site)
	return path.join(root, SITE_LOCK_PATH)
}

async function collectionsFor(site: object): Promise<string[]> {
	vi.stubEnv(SITE_LOCK_ENV, lockOf(site))
	vi.resetModules()
	vi.doMock('astro:content', () => ({ defineCollection: (collection: unknown) => collection }))
	const { defineCoreCollections } = await import('./collections.ts')
	return Object.keys(defineCoreCollections()).sort()
}

const CORE = ['albums', 'articles', 'legal', 'pages', 'photos']

describe('defineCoreCollections', () => {
	it("adds an enabled module's collection to the core's", async () => {
		expect(await collectionsFor(config)).toEqual([...CORE, 'courses'].sort())
	})

	it('defines only the core collections while the lock enables no module', async () => {
		const withoutCourses = {
			...config,
			modules: {},
			menu: {
				...config.menu,
				items: config.menu.items.filter((item) => item.segment !== 'courses'),
			},
		}
		expect(await collectionsFor(withoutCourses)).toEqual(CORE)
	})
})
