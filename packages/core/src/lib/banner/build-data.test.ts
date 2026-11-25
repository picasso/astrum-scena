import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BannersConfig } from '../../config/banners.ts'
import { buildSiteConfig, contentConfig } from '../../config/fixtures/site-config.ts'
import type { Locale } from '../content/schemas.ts'
import { type Manifest, parseManifest } from '../images/manifest.ts'
import type { BannerSiteConfig } from './build-data.ts'
import type { BannerTarget } from './select.ts'

// collections and the manifest are mocked, so these tests pin the fail-closed branches and that
// resolveBanner never returns a banner past the whole-config check

const RAW_MANIFEST = JSON.parse(
	readFileSync(
		fileURLToPath(new URL('../images/__fixtures__/s9-ladder-manifest.json', import.meta.url)),
		'utf8',
	),
)

const manifest = parseManifest(RAW_MANIFEST)

// a surface has no fallback to another photo when its media is missing
function manifestWithoutPhoto(photoId: string): Manifest {
	const result = structuredClone(manifest)
	delete result.photos[photoId]
	return result
}

const photo = (id: string, status: 'published' | 'draft' = 'published') => ({
	id,
	data: { title: { en: id, ru: id }, status, favorite: false, tags: [] },
})

const document = (
	translationKey: string,
	options: { status?: 'published' | 'draft'; coverId?: string; locale?: 'en' | 'ru' } = {},
) => ({
	id: `${translationKey}.${options.locale ?? 'ru'}`,
	data: {
		translationKey,
		locale: options.locale ?? 'ru',
		slug: translationKey,
		title: translationKey,
		status: options.status ?? 'published',
		...(options.coverId ? { coverId: options.coverId } : {}),
	},
})

const noBanners: BannersConfig = {
	surfaces: { portfolioIndex: 'off', articlesIndex: 'off', contacts: 'off' },
}

type Fixture = {
	banners: BannersConfig
	// disabled unless given
	modules?: BannerSiteConfig['modules']
	photos?: ReturnType<typeof photo>[]
	pages?: ReturnType<typeof document>[]
	articles?: ReturnType<typeof document>[]
	courses?: ReturnType<typeof document>[]
	manifest?: Manifest
}

async function loadModule(fixture: Fixture) {
	const collections: Record<string, unknown[]> = {
		photos: fixture.photos ?? [photo('morning-ridge')],
		articles: fixture.articles ?? [],
		pages: fixture.pages ?? [document('about')],
		courses: fixture.courses ?? [],
	}
	vi.resetModules()
	vi.doMock('astro:content', () => ({
		getCollection: (name: string) => Promise.resolve(collections[name] ?? []),
	}))
	vi.doMock('../images/catalog.ts', () => ({
		loadImageCatalog: () => ({
			manifest: fixture.manifest ?? manifest,
			originBase: 'https://img.example.test',
			copyright: '© Test',
			credit: 'Test',
		}),
	}))
	const config: BannerSiteConfig = {
		banners: fixture.banners,
		modules: fixture.modules ?? {},
		topSection: { accent: { album: 'accent', section: 'alt' } },
		content: contentConfig(['en', 'ru'], 'ru'),
	}
	const module = await import('./build-data.ts')
	return {
		config,
		resolveBanner: (target: BannerTarget, locale: Locale) =>
			module.resolveBanner(target, locale, config),
		assertBannerAssignments: () => module.assertBannerAssignments(config),
		module,
	}
}

const withContactsBanner = (photoId: string): BannersConfig => ({
	...noBanners,
	surfaces: { ...noBanners.surfaces, contacts: photoId },
})

afterEach(() => {
	vi.doUnmock('astro:content')
	vi.doUnmock('../images/catalog.ts')
})

describe('resolveBanner', () => {
	it('builds the model for an assigned surface', async () => {
		const { resolveBanner } = await loadModule({
			banners: withContactsBanner('morning-ridge'),
		})
		const banner = await resolveBanner({ kind: 'surface', surface: 'contacts' }, 'en')
		expect(banner?.media.photoId).toBe('morning-ridge')
		expect(banner?.accent).toBe('alt')
		expect(banner?.alt).toBe('morning-ridge')
	})

	it('builds the model for a document cover from the reference locale', async () => {
		const { resolveBanner } = await loadModule({
			banners: noBanners,
			pages: [document('about', { coverId: 'morning-ridge' })],
		})
		const banner = await resolveBanner(
			{ kind: 'document', collection: 'pages', translationKey: 'about' },
			'en',
		)
		expect(banner?.media.photoId).toBe('morning-ridge')
		expect(banner?.accent).toBe('alt')
	})

	it('returns undefined for a document without a cover', async () => {
		const { resolveBanner } = await loadModule({
			banners: noBanners,
			pages: [document('about')],
		})
		await expect(
			resolveBanner({ kind: 'document', collection: 'pages', translationKey: 'about' }, 'en'),
		).resolves.toBeUndefined()
	})

	it('returns undefined for an unassigned surface', async () => {
		const { resolveBanner } = await loadModule({ banners: noBanners })
		await expect(
			resolveBanner({ kind: 'surface', surface: 'contacts' }, 'en'),
		).resolves.toBeUndefined()
	})

	// all covers are checked before the target is picked, so another page's broken cover fails here
	it('refuses to resolve an unassigned surface while a document cover is broken', async () => {
		const { resolveBanner } = await loadModule({
			banners: noBanners,
			pages: [document('camera-bag', { coverId: 'ghost' })],
		})
		await expect(resolveBanner({ kind: 'surface', surface: 'contacts' }, 'en')).rejects.toThrow(
			/references unknown photo "ghost"/,
		)
	})
})

describe('assertBannerAssignments', () => {
	it('passes on the all-off map with no document covers', async () => {
		const { assertBannerAssignments } = await loadModule({ banners: noBanners })
		await expect(assertBannerAssignments()).resolves.toBeUndefined()
	})

	it('rejects a photo id that is not in the content collection', async () => {
		const { assertBannerAssignments } = await loadModule({
			banners: withContactsBanner('quiet-light'),
		})
		await expect(assertBannerAssignments()).rejects.toThrow(
			/surface "contacts" references unknown photo "quiet-light"/,
		)
	})

	it('rejects a draft photo', async () => {
		const { assertBannerAssignments } = await loadModule({
			banners: withContactsBanner('morning-ridge'),
			photos: [photo('morning-ridge', 'draft')],
		})
		await expect(assertBannerAssignments()).rejects.toThrow(/references draft photo/)
	})

	it('rejects a photo absent from the manifest', async () => {
		const { assertBannerAssignments } = await loadModule({
			banners: withContactsBanner('morning-ridge'),
			manifest: manifestWithoutPhoto('morning-ridge'),
		})
		await expect(assertBannerAssignments()).rejects.toThrow(/bannerHero.*no photo/s)
	})

	it('rejects a document cover pointing at a draft photo', async () => {
		const { assertBannerAssignments } = await loadModule({
			banners: noBanners,
			pages: [document('about', { coverId: 'morning-ridge' })],
			photos: [photo('morning-ridge', 'draft')],
		})
		await expect(assertBannerAssignments()).rejects.toThrow(
			/document "pages\/about" references draft photo/,
		)
	})

	it('ignores a coverId on the non-reference locale', async () => {
		const { assertBannerAssignments } = await loadModule({
			banners: noBanners,
			pages: [document('about', { coverId: 'ghost', locale: 'en' })],
		})
		await expect(assertBannerAssignments()).resolves.toBeUndefined()
	})

	// every page calls it, and the collections must be read once per build
	it('checks the map once and keeps the verdict', async () => {
		const { assertBannerAssignments } = await loadModule({ banners: noBanners })
		const first = assertBannerAssignments()
		expect(assertBannerAssignments()).toBe(first)
		await first
	})

	it('checks another reference locale on its own for the same banners map', async () => {
		const { config, module } = await loadModule({
			banners: noBanners,
			pages: [document('about', { coverId: 'ghost', locale: 'en' })],
		})
		await module.assertBannerAssignments(config)
		await expect(
			module.assertBannerAssignments({
				...config,
				content: contentConfig(['en', 'ru'], 'en'),
			}),
		).rejects.toThrow(/document "pages\/about" references unknown photo "ghost"/)
	})

	it('checks a different banners map on its own', async () => {
		const { config, module } = await loadModule({ banners: noBanners })
		await module.assertBannerAssignments(config)
		await expect(
			module.assertBannerAssignments({
				...config,
				banners: withContactsBanner('quiet-light'),
			}),
		).rejects.toThrow(/references unknown photo "quiet-light"/)
	})
})

describe('banners of the courses module', () => {
	const courses = buildSiteConfig().modules.courses!

	it('resolves the index surface from modules.courses.banner', async () => {
		const { resolveBanner } = await loadModule({
			banners: noBanners,
			modules: { courses: { ...courses, banner: 'morning-ridge' } },
		})
		const banner = await resolveBanner({ kind: 'surface', surface: 'coursesIndex' }, 'en')
		expect(banner?.media.photoId).toBe('morning-ridge')
	})

	it('checks the module surface with the core ones', async () => {
		const { assertBannerAssignments } = await loadModule({
			banners: noBanners,
			modules: { courses: { ...courses, banner: 'unknown-photo' } },
		})
		await expect(assertBannerAssignments()).rejects.toThrow(
			'banner for surface "coursesIndex" references unknown photo "unknown-photo"',
		)
	})

	it('takes a course cover from the courses collection', async () => {
		const { resolveBanner } = await loadModule({
			banners: noBanners,
			modules: { courses: { ...courses, banner: 'off' } },
			courses: [document('night-sky', { coverId: 'morning-ridge' })],
		})
		const banner = await resolveBanner(
			{ kind: 'document', collection: 'courses', translationKey: 'night-sky' },
			'en',
		)
		expect(banner?.media.photoId).toBe('morning-ridge')
	})

	it('has no module surface and reads no course while the module is disabled', async () => {
		const { resolveBanner } = await loadModule({
			banners: noBanners,
			courses: [document('night-sky', { coverId: 'missing-photo' })],
		})
		await expect(
			resolveBanner({ kind: 'surface', surface: 'coursesIndex' }, 'en'),
		).rejects.toThrow('no banner surface "coursesIndex"')
	})
})
