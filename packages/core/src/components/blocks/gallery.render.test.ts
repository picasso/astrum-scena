import { getContainerRenderer } from '@astrojs/mdx/container-renderer'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { loadRenderers } from 'astro:container'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { siteRoot } from '../../config/site-root.ts'
import { GALLERY_MIN_TILE_PX } from '../../lib/blocks/gallery/geometry.ts'
import { loadImageCatalog } from '../../lib/images/catalog.ts'

// renders against the demo's active image release, but `astro:content` is empty in the vitest
// container, so getCollection is mocked with published photos whose ids are in that release; an
// explicit `images` source avoids album and set dependencies
const PHOTO_IDS = Object.keys(loadImageCatalog(siteRoot).manifest.photos).sort().slice(0, 3)

const { photos } = vi.hoisted(() => ({ photos: [] as string[] }))
photos.push(...PHOTO_IDS)

const photo = (id: string) => ({
	id,
	data: {
		title: { en: `Title ${id}`, ru: `Заголовок ${id}` },
		status: 'published',
		favorite: false,
		tags: [],
	},
})

vi.mock('astro:content', () => ({
	getCollection: vi.fn(async (name: string) => (name === 'photos' ? photos.map(photo) : [])),
}))

let container: AstroContainer

beforeAll(async () => {
	container = await AstroContainer.create({
		renderers: await loadRenderers([getContainerRenderer()]),
	})
})

const imageIds = (html: string): string[] =>
	[...html.matchAll(/data-image-id="([^"]+)"/g)].map((match) => match[1]!)

const section = (html: string, tag: string): string =>
	html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? ''

async function render(props: Record<string, unknown>): Promise<string> {
	const { default: Gallery } = await import('./gallery.astro')
	// without routing the container has no Astro.currentLocale, so the component falls back to the
	// default locale; both locales of a served page are covered by e2e
	return container.renderToString(Gallery, { props })
}

describe('Gallery.astro render', () => {
	it('takes three photos from the demo release', () => {
		expect(PHOTO_IDS).toHaveLength(3)
	})

	it('renders a static gallery with lightbox anchors and no inert template', async () => {
		const html = await render({ images: PHOTO_IDS.slice(0, 2), outside: 20 })
		expect(html).toContain('data-gallery')
		expect(html).toContain('gallery--rect')
		expect(html).toContain('gallery--outside')
		expect(html).toContain('data-gallery-outside="20"')
		expect(html).toContain(`--gallery-min-tile:${GALLERY_MIN_TILE_PX}px`)
		expect(html).toContain('class="album-photo')
		expect(html).toContain('data-pswp-src')
		expect(html).toContain('data-block-gallery')
		expect(html).not.toContain('data-gallery-candidates')
		expect(imageIds(html)).toEqual(PHOTO_IDS.slice(0, 2))
		// intrinsic dimensions (no CLS)
		expect(html).toMatch(/width="\d+"/)
		expect(html).toMatch(/height="\d+"/)
	})

	it('renders a dynamic gallery with an inert template, a noscript fallback and a live container', async () => {
		const html = await render({
			images: PHOTO_IDS,
			randomCount: 2,
			layout: 'square',
		})
		expect(html).toContain('data-gallery-dynamic')
		expect(html).toContain('data-gallery-candidates')
		expect(html).toContain('<noscript>')
		expect(html).toContain('data-gallery-live')
		expect(html).toContain('data-gallery-random-count="2"')
		expect(html).toContain('gallery--square')
		expect(imageIds(section(html, 'template')).sort()).toEqual([...PHOTO_IDS].sort())
		expect(section(html, 'noscript').match(/<img\b/g)).toHaveLength(2)
	})

	it('drops the lightbox surface when action=none', async () => {
		const html = await render({ images: PHOTO_IDS.slice(0, 1), action: 'none' })
		expect(html).not.toContain('data-block-gallery')
		expect(html).not.toContain('class="album-photo')
		expect(imageIds(html)).toEqual(PHOTO_IDS.slice(0, 1))
		expect(html.match(/<img\b/g)).toHaveLength(1)
	})
})
