import { readFileSync } from 'node:fs'
import path from 'node:path'

import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeAll, describe, expect, it } from 'vitest'

import { CORE_ROOT } from '../core-root.ts'
import type { CardModel } from '../lib/cards/select.ts'
import { documentCardSurface, excerptHiddenClass } from '../lib/cards/select.ts'
import { parseManifest } from '../lib/images/manifest.ts'
import { buildPictureModel } from '../lib/images/media.ts'
import { SURFACE_SIZES } from '../lib/portfolio/sizes.ts'
import { resolveSurfaceMedia } from '../lib/portfolio/surface.ts'
import Card from './card.astro'
import CardCollection from './card-collection.astro'
import CardGrid from './card-grid.astro'
import CardList from './card-list.astro'
import CardMasonry from './card-masonry.astro'

const manifest = parseManifest(
	JSON.parse(
		readFileSync(
			path.join(CORE_ROOT, 'src/lib/images/__fixtures__/s9-ladder-manifest.json'),
			'utf8',
		),
	),
)

const ORIGIN = 'https://img.example.test'

const media = buildPictureModel(resolveSurfaceMedia(manifest, 'morning-ridge', 'documentCard'), {
	originBase: ORIGIN,
	alt: 'Alt text',
	sizes: SURFACE_SIZES.documentCard,
})

// the demo article and a synthetic course
const withMedia: CardModel = {
	href: '/en/articles/reading-the-light/',
	title: 'Reading the Light',
	excerpt: 'A short synthetic article about watching light before pressing the shutter.',
	media,
}

const textOnly: CardModel = {
	href: '/en/courses/paper-lanterns/',
	title: 'Paper Lanterns',
}

let container: AstroContainer

beforeAll(async () => {
	container = await AstroContainer.create()
})

describe('Card', () => {
	it('anchors the whole card to the canonical href and renders title, excerpt and media', async () => {
		const html = await container.renderToString(Card, { props: { card: withMedia } })
		expect(html).toContain(`href="${withMedia.href}"`)
		expect(html).toContain(withMedia.title)
		expect(html).toContain(withMedia.excerpt!)
		expect(html).toContain(SURFACE_SIZES.documentCard)
	})

	// the cover is chosen editorially, so a card must exist without a thumbnail
	it('renders without media and without an excerpt', async () => {
		const html = await container.renderToString(Card, { props: { card: textOnly } })
		expect(html).toContain(`href="${textOnly.href}"`)
		expect(html).toContain(textOnly.title)
		expect(html).not.toContain('card__media')
		expect(html).not.toContain('card__excerpt')
	})

	it('renders the shared document placeholder inside the requested ratio frame', async () => {
		const html = await container.renderToString(Card, {
			props: { card: { ...textOnly, mediaPlaceholder: true, ratio: 'pano' } },
		})
		expect(html).toContain('card__media--placeholder')
		expect(html).toContain('<svg')
		expect(html).toContain('card__media-frame--pano')
	})

	it('renders the vista ratio frame', async () => {
		const html = await container.renderToString(Card, {
			props: { card: { ...textOnly, mediaPlaceholder: true, ratio: 'vista' } },
		})
		expect(html).toContain('card__media-frame--vista')
	})

	// the legacy card had no "read more" link; it appears only when the caller passes a label
	it('renders the read-more label only when it is provided', async () => {
		const without = await container.renderToString(Card, { props: { card: withMedia } })
		expect(without).not.toContain('card__more')
		const with_ = await container.renderToString(Card, {
			props: { card: withMedia, more: 'Read more' },
		})
		expect(with_).toContain('card__more')
		expect(with_).toContain('Read more')
	})

	it('uses h2 by default and h3 inside a section that owns its heading', async () => {
		const defaulted = await container.renderToString(Card, { props: { card: withMedia } })
		expect(defaulted).toMatch(/<h2[^>]*class="card__title"/)
		const nested = await container.renderToString(Card, {
			props: { card: withMedia, titleLevel: 3 },
		})
		expect(nested).toMatch(/<h3[^>]*class="card__title"/)
	})
})

// without the `presentation` prop a card stays `details`, so existing callers are unaffected
describe('Card presentation', () => {
	const render = (presentation?: 'details' | 'title-strip' | 'title-slide') =>
		container.renderToString(Card, {
			props: {
				card: withMedia,
				more: 'Read more',
				...(presentation ? { presentation } : {}),
			},
		})
	const count = (html: string, needle: string) => html.split(needle).length - 1

	it('keeps details byte-identical to a card without the prop', async () => {
		expect(await render('details')).toBe(await render())
		const html = await render()
		expect(html).toContain('card__excerpt')
		expect(html).toContain('card__more')
		expect(html).not.toContain('card--title-')
		expect(html).not.toContain('card__overlay')
	})

	it('marks a details body that holds only the title so no gap stays under it', async () => {
		const bare = await container.renderToString(Card, {
			props: { card: { ...withMedia, excerpt: undefined } },
		})
		expect(bare).toContain('card__body card__body--title-only')
		expect(await render()).not.toContain('card__body--title-only')
		const withMore = await container.renderToString(Card, {
			props: { card: { ...withMedia, excerpt: undefined }, more: 'Read more' },
		})
		expect(withMore).not.toContain('card__body--title-only')
	})

	it('title-strip renders the preview and one heading, without excerpt, more or overlay', async () => {
		const html = await render('title-strip')
		expect(html).toContain('card card--title-strip')
		expect(html).toContain('card__img')
		expect(count(html, '<h2')).toBe(1)
		expect(html).toContain('card__body')
		expect(html).not.toContain('card__excerpt')
		expect(html).not.toContain('card__more')
		expect(html).not.toContain(withMedia.excerpt!)
		expect(html).not.toContain('card__overlay')
	})

	it('title-slide puts the only heading into an overlay inside the media frame', async () => {
		const html = await render('title-slide')
		expect(html).toContain('card card--title-slide')
		expect(count(html, '<h2')).toBe(1)
		expect(html).toMatch(/card__media-frame[\s\S]*card__overlay[\s\S]*<h2 class="card__title"/)
		expect(html).not.toContain('card__body')
		expect(html).not.toContain(withMedia.excerpt!)
		expect(html).toMatch(/^<a href="\/en\/articles\/reading-the-light\/"/)
	})

	it('title-slide without a media frame falls back to the title strip', async () => {
		const html = await container.renderToString(Card, {
			props: { card: textOnly, presentation: 'title-slide' },
		})
		expect(html).toContain('card--title-strip')
		expect(html).not.toContain('card__overlay')
	})

	it('Card applies the preview focal point to a fixed-ratio frame', async () => {
		const html = await container.renderToString(Card, {
			props: { card: { ...withMedia, ratio: 'landscape', focal: { x: 30, y: 60 } } },
		})
		expect(html).toContain('--card-focal:30% 60%;')
		expect(await render()).not.toContain('--card-focal')
	})

	it('CardGrid and CardMasonry take the gap from the caller', async () => {
		const grid = await container.renderToString(CardGrid, {
			props: { cards: [withMedia], columns: 2, gap: 24 },
		})
		expect(grid).toContain('--card-grid-gap:24px;')
		const plain = await container.renderToString(CardGrid, {
			props: { cards: [withMedia], columns: 2 },
		})
		expect(plain).not.toContain('--card-grid-gap')
		const masonry = await container.renderToString(CardMasonry, {
			props: { cards: [withMedia], gap: 8 },
		})
		expect(masonry).toContain('--portfolio-gap:8px;')
	})

	it('CardCollection forwards the presentation to grid and masonry cards', async () => {
		for (const kind of ['grid', 'masonry'] as const) {
			const html = await container.renderToString(CardCollection, {
				props: { kind, cards: [withMedia], columns: 2, presentation: 'title-strip' },
			})
			expect(html).toContain('card--title-strip')
		}
		const grid = await container.renderToString(CardCollection, {
			props: { kind: 'grid', cards: [withMedia], columns: 2 },
		})
		expect(grid).not.toContain('card--title-')
	})

	it('CardMasonry forwards the presentation to every card and defaults to details', async () => {
		const compact = await container.renderToString(CardMasonry, {
			props: { cards: [withMedia, withMedia], presentation: 'title-slide' },
		})
		expect(count(compact, 'card--title-slide')).toBe(2)
		const plain = await container.renderToString(CardMasonry, {
			props: { cards: [withMedia] },
		})
		expect(plain).not.toContain('card--title-')
	})
})

// title-slide CSS contract: the plate shows by default (touch/no-hover), hides only inside the
// fine-pointer hover media query, returns on hover and keyboard focus; reduced motion drops the
// transition. A static parse of the stylesheet; E2E checks the hover behavior in a browser.
describe('title-slide CSS contract', () => {
	const css = readFileSync(
		path.join(CORE_ROOT, 'src/components/card-looks/title-slide.css'),
		'utf8',
	)
	// the CSS may hold several fine-pointer media blocks; pick the one for title-slide
	const hoverBlock = [
		...css.matchAll(/@media \(hover: hover\) and \(pointer: fine\) \{([\s\S]*?)\n\t\}/g),
	]
		.map((match) => match[1]!)
		.find((block) => block.includes('.card--title-slide'))

	it('hides the overlay at rest only on fine-pointer hover devices', () => {
		const outside = css.replace(hoverBlock ?? '', '')
		expect(hoverBlock).toContain('.card--title-slide .card__overlay')
		expect(hoverBlock).toContain('translateY(100%)')
		expect(outside).not.toMatch(/card__overlay[^}]*translateY\(100%\)/)
	})

	it('reveals the overlay on hover and on keyboard focus alike', () => {
		expect(hoverBlock).toMatch(
			/\.card--title-slide:hover \.card__overlay,\s*\.card--title-slide:focus-visible \.card__overlay \{\s*transform: none;\s*\}/,
		)
	})

	it('drops the transition for reduced motion', () => {
		expect(css).toMatch(
			/@media \(prefers-reduced-motion: reduce\) \{\s*\.card--title-slide \.card__overlay \{\s*transition: none;/,
		)
	})
})

describe('CardMasonry', () => {
	it('renders one item per card in input order with the column hint', async () => {
		const html = await container.renderToString(CardMasonry, {
			props: { cards: [withMedia, textOnly] },
		})
		expect([...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual([
			withMedia.href,
			textOnly.href,
		])
		expect(html).toContain('--portfolio-max-columns:')
		expect(html).toContain('card-masonry__item')
	})
})

describe('CardList', () => {
	it('renders the legacy row layout for every card', async () => {
		const html = await container.renderToString(CardList, {
			props: { cards: [withMedia, textOnly] },
		})
		expect(html.split('card-list__item').length - 1).toBe(2)
		expect(html).toContain('card--row')
	})
})

describe('CardCollection', () => {
	// `surfaces.*.kind` must change the layout, not be ignored at runtime
	it('renders the layout selected by the configured kind', async () => {
		const masonry = await container.renderToString(CardCollection, {
			props: { kind: 'masonry', cards: [withMedia] },
		})
		expect(masonry).toContain('card-masonry')
		expect(masonry).not.toContain('card-list')

		const list = await container.renderToString(CardCollection, {
			props: { kind: 'list', cards: [withMedia] },
		})
		expect(list).toContain('card-list')
		expect(list).not.toContain('card-masonry')

		const grid = await container.renderToString(CardCollection, {
			props: { kind: 'grid', cards: [withMedia], columns: 2, titleLevel: 3 },
		})
		expect(grid).toContain('card-grid')
		expect(grid).toMatch(/<h3[^>]*class="card__title"/)
	})
})

describe('CardGrid', () => {
	it('keeps input order and exposes the configured column cap', async () => {
		const html = await container.renderToString(CardGrid, {
			props: { cards: [withMedia, textOnly], columns: 4 },
		})
		expect([...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual([
			withMedia.href,
			textOnly.href,
		])
		expect(html).toContain('--card-grid-columns:4')
	})
})

describe('documentCardSurface', () => {
	// thumbnail `sizes` follow the layout: the list puts a constant-width thumbnail on the left
	it('follows the configured layout kind', () => {
		expect(documentCardSurface('masonry')).toBe('documentCard')
		expect(documentCardSurface('list')).toBe('documentListItem')
	})
})

describe('excerptHiddenClass', () => {
	// the threshold is an enum of implemented values: a media query cannot read a custom property, so
	// each value has its own rule in card.css and the config only picks the class.
	it('maps every implemented breakpoint to its own modifier and off to none', () => {
		expect(excerptHiddenClass('off')).toBeUndefined()
		expect(excerptHiddenClass(480)).toBe('cards--excerpt-hidden-480')
		expect(excerptHiddenClass(768)).toBe('cards--excerpt-hidden-768')
		expect(excerptHiddenClass(1024)).toBe('cards--excerpt-hidden-1024')
	})
})
