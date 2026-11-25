import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { buildSiteConfig, keepLocales } from './config/fixtures/site-config.ts'
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

async function defineFor(site: object) {
	vi.stubEnv(SITE_LOCK_ENV, lockOf(site))
	vi.resetModules()
	vi.doMock('astro:content', () => ({ defineCollection: (collection: unknown) => collection }))
	const { defineCoreCollections } = await import('./collections.ts')
	return defineCoreCollections()
}

async function collectionsFor(site: object): Promise<string[]> {
	return Object.keys(await defineFor(site)).sort()
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

	it("builds the albums and photos from the lock's content.locales", async () => {
		const oneLocale = {
			...keepLocales(config, ['en']),
			content: { locales: ['en'], referenceLocale: 'en' },
		}
		type Parser = { safeParse(value: unknown): { success: boolean } }
		const { albums, photos } = await defineFor(oneLocale)
		const photo = photos.schema as Parser
		expect(photo.safeParse({ title: { en: 'Title' }, status: 'draft' }).success).toBe(true)
		expect(
			photo.safeParse({ title: { en: 'Title', ru: 'Название' }, status: 'draft' }).success,
		).toBe(false)
		const album = albums.schema as Parser
		const entry = {
			category: 'series',
			description: { en: '' },
			status: 'draft',
			coverId: 'one',
			photoIds: ['one'],
		}
		expect(album.safeParse({ ...entry, title: { en: 'Album' } }).success).toBe(true)
		expect(album.safeParse({ ...entry, title: { en: 'Album', ru: 'Альбом' } }).success).toBe(
			false,
		)
	})
})
