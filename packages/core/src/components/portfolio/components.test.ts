import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSiteConfig } from '../../config/fixtures/site-config.ts'
import type { SiteConfig } from '../../config/site-schema.ts'
import type { AlbumData, PhotoData } from '../../lib/content/schemas.ts'
import type { ImageCatalog } from '../../lib/images/catalog.ts'
import { parseManifest } from '../../lib/images/manifest.ts'
import { buildPictureModel } from '../../lib/images/media.ts'
import type { AlbumEntry, PhotoEntry } from '../../lib/portfolio/publication.ts'
import { SURFACE_SIZES } from '../../lib/portfolio/sizes.ts'
import { resolveSurfaceMedia } from '../../lib/portfolio/surface.ts'
import AlbumCards from './album-cards.astro'
import AlbumGrid from './album-grid.astro'
import PhotoItem from './photo-item.astro'
import ResponsivePicture from './responsive-picture.astro'

// the components read the site singleton; they render under a test-built config whose grid and album
// defaults differ from the usual ones, so a test cannot pass on a hardcoded or real site.yaml value.
// The config is rebuilt before every case, so a case may switch `portfolio.layout`
const config = vi.hoisted(() => ({ site: undefined as unknown as SiteConfig }))
vi.mock('../../config/site.ts', async () => ({
	...(await import('../../config/site-schema.ts')),
	get site() {
		return config.site
	},
}))
beforeEach(() => {
	const base = buildSiteConfig()
	config.site = buildSiteConfig({
		portfolio: { ...base.portfolio, grid: { columns: 4, gap: 20, ratio: 'landscape' } },
		album: { ...base.album, layout: 'rect' },
	})
})

const manifest = parseManifest(
	JSON.parse(
		readFileSync(
			fileURLToPath(
				new URL('../../lib/images/__fixtures__/s9-ladder-manifest.json', import.meta.url),
			),
			'utf8',
		),
	),
)

const ORIGIN = 'https://img.example.test'

const catalog: ImageCatalog = {
	manifest,
	originBase: ORIGIN,
	copyright: '© Test',
	credit: 'Test Credit',
}

// real ids from the fixture manifest
const PHOTO_IDS = ['morning-ridge', 'square-moon', 'snow-and-stones', 'prairie-sunrise'] as const

function photoEntry(id: string): PhotoEntry {
	const data: PhotoData = {
		title: { en: `Title ${id}`, ru: `Заголовок ${id}` },
		status: 'published',
		favorite: false,
		tags: [],
	} as PhotoData
	return { id, data }
}

const photosById = new Map<string, PhotoEntry>(PHOTO_IDS.map((id) => [id, photoEntry(id)]))

const album: AlbumEntry = {
	id: 'sunrises',
	data: {
		category: 'series',
		title: { en: 'Early Light', ru: 'Ранний свет' },
		description: { en: 'desc', ru: 'опис' },
		status: 'published',
		coverId: 'morning-ridge',
		photoIds: [...PHOTO_IDS],
	} as AlbumData,
}

const albumTwo: AlbumEntry = {
	id: 'second-album',
	data: {
		category: 'series',
		title: { en: 'Second', ru: 'Второй' },
		description: { en: 'desc', ru: 'опис' },
		status: 'published',
		coverId: 'square-moon',
		photoIds: ['square-moon'],
	} as AlbumData,
}

let container: AstroContainer

beforeAll(async () => {
	container = await AstroContainer.create()
})

const hrefs = (html: string): string[] => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!)

describe('ResponsivePicture', () => {
	it('renders avif-before-webp sources with the explicit sizes on <source> and <img>', async () => {
		const media = resolveSurfaceMedia(manifest, 'morning-ridge', 'albumGrid')
		const model = buildPictureModel(media, {
			originBase: ORIGIN,
			alt: 'Alt text',
			sizes: SURFACE_SIZES.albumGrid,
		})
		const html = await container.renderToString(ResponsivePicture, { props: { model } })

		expect(html.indexOf('image/avif')).toBeGreaterThan(-1)
		expect(html.indexOf('image/avif')).toBeLessThan(html.indexOf('image/webp'))
		// the component owns `sizes`, so it lands on every source and on the img
		expect(html.split(SURFACE_SIZES.albumGrid).length - 1).toBeGreaterThanOrEqual(2)
		expect(html).toContain('alt="Alt text"')
		expect(html).toContain('aspect-ratio:')
		expect(html).toContain('decoding="async"')
	})

	it('gives a priority image no async decoding hint', async () => {
		const media = resolveSurfaceMedia(manifest, 'morning-ridge', 'albumGrid')
		const model = buildPictureModel(media, { originBase: ORIGIN, alt: 'a', sizes: 'x' })
		const html = await container.renderToString(ResponsivePicture, {
			props: { model, loading: 'eager', fetchpriority: 'high' },
		})
		expect(html).toContain('fetchpriority="high"')
		expect(html).not.toContain('decoding=')
	})

	it('surfaces data-rights-fallback matching the model', async () => {
		const media = resolveSurfaceMedia(manifest, 'morning-ridge', 'albumGrid')
		const model = buildPictureModel(media, { originBase: ORIGIN, alt: 'a', sizes: 'x' })
		const html = await container.renderToString(ResponsivePicture, { props: { model } })
		expect(html.includes('data-rights-fallback="true"')).toBe(model.rightsFallbackNeeded)
	})
})

describe('PhotoItem', () => {
	it('anchors to the contextual photo route with sanitized viewer data-pswp-* and grid sizes', async () => {
		const html = await container.renderToString(PhotoItem, {
			props: {
				catalog,
				albumId: 'sunrises',
				photo: photoEntry('morning-ridge'),
				locale: 'en',
				layout: 'justified',
				sizes: SURFACE_SIZES.albumGrid,
			},
		})
		// without JS the anchor still leads to the contextual photo page
		expect(html).toContain('href="/en/portfolio/sunrises/morning-ridge/"')
		expect(html).toContain('data-pswp-width="')
		expect(html).toContain('data-pswp-height="')
		expect(html).toContain('data-pswp-src="' + ORIGIN + '/')
		expect(html).toContain('data-pswp-srcset="')
		expect(html).toContain(SURFACE_SIZES.albumGrid)
		expect(html).toContain('fetchpriority="low"')
		expect(html).toMatch(/flex-grow:/)
	})

	it('uses the locale in the contextual href', async () => {
		const html = await container.renderToString(PhotoItem, {
			props: {
				catalog,
				albumId: 'sunrises',
				photo: photoEntry('morning-ridge'),
				locale: 'ru',
				layout: 'justified',
				sizes: SURFACE_SIZES.albumGrid,
			},
		})
		expect(html).toContain('href="/ru/portfolio/sunrises/morning-ridge/"')
	})
})

describe('AlbumCards', () => {
	// the layout comes from `portfolio.layout` only
	const render = (layout: 'masonry' | 'grid', byId = photosById) => {
		config.site = { ...config.site, portfolio: { ...config.site.portfolio, layout } }
		return container.renderToString(AlbumCards, {
			props: {
				catalog,
				albums: [album, albumTwo],
				photosById: byId,
				locale: 'en',
				presentation: 'details',
			},
		})
	}

	it('renders one card per published album in input order in both layouts', async () => {
		for (const layout of ['masonry', 'grid'] as const) {
			const html = await render(layout)
			expect(hrefs(html)).toEqual(['/en/portfolio/sunrises/', '/en/portfolio/second-album/'])
		}
		expect(await render('masonry')).toContain('--portfolio-max-columns:')
	})

	it('grid uses the configured columns, gap and preview ratio with per-range sizes', async () => {
		const html = await render('grid')
		expect(html).toContain('--card-grid-columns:4;')
		expect(html).toContain('--card-grid-gap:20px;')
		expect(html).toContain('card__media-frame--landscape')
		expect(html).toMatch(/sizes="\(max-width: \d+px\) calc\(/)
		expect(await render('masonry')).not.toContain('card__media-frame--')
	})

	it('shows the album excerpt in details only when portfolio.excerpt is on', async () => {
		const renderWith = (excerpt: 'on' | 'off') =>
			container.renderToString(AlbumCards, {
				props: {
					catalog,
					albums: [album],
					photosById,
					locale: 'en',
					presentation: 'details',
					excerpt,
				},
			})
		expect(await renderWith('on')).toContain('card__excerpt')
		const without = await renderWith('off')
		expect(without).not.toContain('card__excerpt')
		expect(without).toContain('card__body--title-only')
	})

	it('shows an authored album excerpt in details rather than one from the description', async () => {
		const excerptOf = async (entry: AlbumEntry) =>
			/<p class="card__excerpt"[^>]*>([^<]*)<\/p>/.exec(
				await container.renderToString(AlbumCards, {
					props: {
						catalog,
						albums: [entry],
						photosById,
						locale: 'en',
						presentation: 'details',
						excerpt: 'on',
					},
				}),
			)?.[1]
		expect(await excerptOf(album)).toBe('desc')
		const authored = { ...album.data, excerpt: { en: 'Authored EN.', ru: 'Автор RU.' } }
		expect(await excerptOf({ ...album, data: authored })).toBe('Authored EN.')
	})

	it('crops the grid preview at the cover focalPoint, centre when absent', async () => {
		const focused = new Map(photosById)
		const cover = photoEntry('morning-ridge')
		focused.set('morning-ridge', {
			...cover,
			data: { ...cover.data, focalPoint: { x: 20, y: 70 } },
		})
		expect(await render('grid', focused)).toContain('--card-focal:20% 70%;')
		expect(await render('grid')).not.toContain('--card-focal')
	})
})

// the mode is set on the album, so the shipped site.yaml value is never pinned
describe('AlbumGrid', () => {
	const withLayout = (layout?: 'justified' | 'masonry' | 'square' | 'rect'): AlbumEntry => ({
		...album,
		data: { ...album.data, ...(layout ? { layout } : {}) },
	})
	const render = (layout: 'justified' | 'masonry' | 'square' | 'rect') =>
		container.renderToString(AlbumGrid, {
			props: { catalog, album: withLayout(layout), photosById, locale: 'en' },
		})
	it('renders every mode in album.photoIds order inside one .album-grid container', async () => {
		for (const layout of ['justified', 'masonry', 'square', 'rect'] as const) {
			const html = await render(layout)
			expect(hrefs(html)).toEqual(PHOTO_IDS.map((id) => `/en/portfolio/sunrises/${id}/`))
			expect(html).toContain(`class="album-grid album-${layout}"`)
			expect(html).toContain('data-copyright="© Test"')
			expect(html).toContain('data-pswp-options=')
			expect(html.split(`album-${layout}__item`).length - 1).toBe(PHOTO_IDS.length)
		}
	})

	it('justified keeps the row-height variable and flex-grow cells', async () => {
		const html = await render('justified')
		expect(html).toContain('--justified-row-height:')
		expect(html).toMatch(/flex-grow:/)
		expect(html).toContain(SURFACE_SIZES.albumGrid)
	})

	it('masonry uses CSS column variables, natural cells and per-range sizes', async () => {
		const html = await render('masonry')
		expect(html).toContain('--album-col-width:')
		expect(html).toContain('--album-max-columns:')
		expect(html).not.toMatch(/flex-grow:/)
		expect(html).toMatch(/sizes="\(max-width: \d+px\) calc\(/)
	})

	it('crop modes expose the column bounds, crop at the focal point and open the viewer with fade', async () => {
		for (const layout of ['square', 'rect'] as const) {
			const html = await render(layout)
			expect(html).toContain('--album-columns:')
			expect(html).toContain('--album-min-columns:')
			expect(html).toContain('--album-focal:50% 50%')
			expect(html).toMatch(/&quot;showHideAnimationType&quot;:&quot;fade&quot;/)
		}
	})

	// the site default is read from the config, not pinned
	it('lets the album layout win over the site default', async () => {
		const classOf = async (entry: AlbumEntry) =>
			(
				await container.renderToString(AlbumGrid, {
					props: { catalog, album: entry, photosById, locale: 'en' },
				})
			).match(/class="album-grid album-([a-z]+)"/)?.[1]

		expect(await classOf(withLayout())).toBe(config.site.album.layout)
		for (const layout of ['justified', 'masonry', 'square', 'rect'] as const) {
			expect(await classOf(withLayout(layout))).toBe(layout)
		}
	})
})
