import { expect, test } from '@playwright/test'

import type { MoreDocsKind, MoreDocumentsConfig } from '../packages/core/src/config/site-schema.ts'
import {
	blocksPage,
	courseData,
	type DemoDocument,
	documentByKind,
	documents,
	firstDocument,
	pageData,
} from './content.ts'
import { coreCss, coreFile, demoConfig, documentOverflow, referenceLocale, t } from './helpers.ts'

// MoreDocuments on the demo's documents in the production build of the packed core: the course list
// (`modules.courses.moreDocs`), the article grid (`moreDocs.article`) and the title-slide grid the `blocks`
// page lists by its own `moreDocs.docs` (`moreDocs.page`). Every mode, count and ratio comes from the
// demo's site.yaml and content; the geometry values come from the core's stylesheets

const lang = referenceLocale
const { moreDocs, layout } = demoConfig
// a course's block is the courses module's, the others are the core's
const moreDocsOf: Record<MoreDocsKind, MoreDocumentsConfig> = {
	article: moreDocs.article,
	course: demoConfig.modules.courses!.moreDocs,
	page: moreDocs.page,
}

// the automatic list of a document: the other listable documents of its kind
function siblings(document: DemoDocument): DemoDocument[] {
	const config = moreDocsOf[document.kind]
	const rest = documents.filter(
		(entry) => entry.kind === document.kind && !entry.unlisted && entry.slug !== document.slug,
	)
	return typeof config.limit === 'number' ? rest.slice(0, config.limit) : rest
}

const course = firstDocument('course', (document) => !document.unlisted)
const article = firstDocument('article', (document) => !document.unlisted)

test('renders the medium course list with its thumbnail geometry and placeholder', async ({
	page,
}) => {
	const config = moreDocsOf.course
	expect(config).toMatchObject({ source: 'siblings', layout: 'list', heading: 'on', media: 'on' })
	const expected = siblings(course)
	// a course without a cover gets the standard placeholder, which the list must show
	expect(expected.some((document) => courseData(document.slug, lang).coverId === undefined)).toBe(
		true,
	)
	await page.goto(course.href(lang))

	const block = page.locator('nav.more-documents')
	const heading = block.getByRole('heading', {
		level: 2,
		name: t(lang)('courses.moreDocuments.heading'),
	})
	await expect(heading).toHaveCSS(
		'font-size',
		coreCss('components/content/more-documents.css', '.more-documents__heading', 'font-size'),
	)
	const cards = block.locator('.card--row')
	await expect(cards).toHaveCount(expected.length)
	const thumbnail = cards.first().locator('.card__media-frame')
	await expect(thumbnail).toHaveClass(new RegExp(`card__media-frame--${config.ratio}`))
	await expect(thumbnail).toHaveCSS(
		'aspect-ratio',
		coreCss('components/card.css', `.card__media-frame--${config.ratio}`, 'aspect-ratio'),
	)
	await expect(thumbnail).toHaveCSS(
		'border-top-left-radius',
		coreCss('components/card-list.css', '.card--row .card__media-frame', 'border-radius'),
	)

	const placeholder = block.locator('.card__media--placeholder').first()
	const viewBox = /viewBox="([^"]+)"/.exec(coreFile('assets/icons/document-placeholder.svg'))![1]!
	await expect(placeholder.locator('svg')).toHaveAttribute('viewBox', viewBox)
	const placeholderLook = await placeholder.evaluate((node) => {
		const probe = document.createElement('div')
		probe.style.color = 'var(--color-accent)'
		document.body.append(probe)
		const accent = getComputedStyle(probe).color
		probe.remove()
		const frame = node.getBoundingClientRect()
		const icon = node.querySelector('svg')!.getBoundingClientRect()
		return {
			accent,
			fill: getComputedStyle(node.querySelector('svg path')!).fill,
			verticalInset: icon.top - frame.top,
			padding: Number.parseFloat(getComputedStyle(node).paddingTop),
		}
	})
	expect(placeholderLook.fill).toBe(placeholderLook.accent)
	expect(placeholderLook.padding).toBeGreaterThan(0)
	expect(placeholderLook.verticalInset).toBeGreaterThanOrEqual(placeholderLook.padding - 1)
	expect(await documentOverflow(page)).toBeLessThanOrEqual(1)
})

test('keeps the medium heading and rows inside the medium container, not the prose column', async ({
	page,
}) => {
	expect(moreDocsOf.course.width).toBe('medium')
	await page.goto(course.href(lang))
	const width = page.viewportSize()!.width
	const geometry = await page.locator('nav.more-documents').evaluate((node) => {
		const prose = document.querySelector<HTMLElement>('article.prose')!
		const heading = node.querySelector<HTMLElement>('.more-documents__heading')!
		const rows = node.querySelector<HTMLElement>('.card-list')!
		return {
			pad: Number.parseFloat(getComputedStyle(node).paddingLeft),
			proseLeft: prose.getBoundingClientRect().left,
			proseRight: prose.getBoundingClientRect().right,
			headingLeft: heading.getBoundingClientRect().left,
			rowsLeft: rows.getBoundingClientRect().left,
			rowsRight: rows.getBoundingClientRect().right,
			rowsWidth: rows.getBoundingClientRect().width,
			headingWidth: heading.getBoundingClientRect().width,
			underlineWidth: Number.parseFloat(getComputedStyle(heading, '::after').width),
		}
	})

	expect(geometry.headingLeft).toBeCloseTo(geometry.rowsLeft, 1)
	expect(geometry.rowsWidth).toBeLessThanOrEqual(layout.medium + 0.5)
	if (width - 2 * geometry.pad <= layout.prose) {
		expect(geometry.rowsLeft).toBeCloseTo(geometry.proseLeft, 1)
		expect(geometry.rowsRight).toBeCloseTo(geometry.proseRight, 1)
	} else {
		expect(geometry.underlineWidth).toBeGreaterThan(geometry.headingWidth)
		expect(geometry.rowsLeft).toBeLessThan(geometry.proseLeft)
		expect(geometry.rowsRight).toBeGreaterThan(geometry.proseRight)
		if (width - 2 * geometry.pad >= layout.medium)
			expect(geometry.rowsWidth).toBeCloseTo(layout.medium, 1)
	}
})

// from the container query width the configured column count wins over how many minimum tracks
// would fit; below it the grid picks its own count so cards are not squeezed
test('renders the article grid with the configured columns and ratio', async ({ page }) => {
	const config = moreDocs.article
	expect(config.layout).toBe('grid')
	const expected = siblings(article)
	expect(expected.length).toBeGreaterThan(0)
	await page.goto(article.href(lang))

	const block = page.locator('nav.more-documents')
	await expect(
		block.getByRole('heading', { level: 2, name: t(lang)('moreDocuments.article.heading') }),
	).toBeVisible()
	const grid = block.locator('.card-grid')
	await expect(grid).toHaveCSS('--card-grid-columns', String(config.columns))
	await expect(grid.locator('.card')).toHaveCount(expected.length)
	const frame = grid.locator('.card__media-frame').first()
	await expect(frame).toHaveClass(new RegExp(`card__media-frame--${config.ratio}`))
	await expect(frame).toHaveCSS(
		'aspect-ratio',
		coreCss('components/card.css', `.card__media-frame--${config.ratio}`, 'aspect-ratio'),
	)

	const breakpoint = Number(
		/@container \(min-width: (\d+)px\)/.exec(coreFile('components/card-grid.css'))![1],
	)
	const { width, tracks } = await grid.evaluate((node) => ({
		width: node.getBoundingClientRect().width,
		tracks: getComputedStyle(node).gridTemplateColumns.split(' ').length,
	}))
	if (width >= breakpoint) expect(tracks).toBe(config.columns)
	else expect(tracks).toBeGreaterThanOrEqual(1)
	expect(await documentOverflow(page)).toBeLessThanOrEqual(1)
})

// the overlay also sits on the placeholder of a document without a cover, and on a fine pointer it
// appears only on hover; the touch spec checks it without hover
test('title-slide cards show a title overlay without an excerpt', async ({ page }) => {
	const config = moreDocs.page
	expect(config).toMatchObject({ layout: 'grid', card: 'title-slide', excerpt: 'off' })
	const targets = pageData(blocksPage.slug, lang).moreDocs
	if (!targets || targets === 'off') throw new Error('the blocks page lists no documents')
	await page.goto(blocksPage.href(lang))

	const block = page.locator('nav.more-documents')
	await expect(block).toHaveClass(new RegExp(`more-documents--${config.width}`))
	if (config.heading === 'on')
		await expect(
			block.getByRole('heading', { level: 2, name: t(lang)('moreDocuments.page.heading') }),
		).toBeVisible()
	const cards = block.locator('a.card')
	await expect(cards).toHaveCount(targets.docs.length)
	for (const card of await cards.all()) {
		await expect(card).toHaveClass(/card--title-slide/)
		await expect(card.locator('.card__overlay h3')).toHaveCount(1)
		await expect(card.locator('.card__excerpt')).toHaveCount(0)
	}
	await expect(block.locator('.card__media--placeholder').first()).toBeAttached()
	// the cards follow the page's own list, in its order
	const expected = targets.docs.map((target) => documentByKind(target.kind, target.slug, lang))
	expect(
		await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))),
	).toEqual(expected.map((target) => target.href))
	await expect(cards.locator('.card__overlay h3')).toHaveText(
		expected.map((target) => target.title),
	)

	// on a fine pointer the overlay rests below the frame (clipped) and slides in only on hover;
	// reduced motion is not emulated here, so each position is polled to its end
	const first = cards.first()
	const overlayPlace = () =>
		first.evaluate((node) => {
			const frame = node.querySelector('.card__media-frame')!.getBoundingClientRect()
			const overlay = node.querySelector('.card__overlay')!.getBoundingClientRect()
			if (overlay.top >= frame.bottom - 1) return 'below'
			return overlay.top < frame.bottom - 1 && overlay.bottom <= frame.bottom + 1
				? 'inside'
				: 'between'
		})
	await first.scrollIntoViewIfNeeded()
	await page.mouse.move(0, 0)
	await expect.poll(overlayPlace).toBe('below')
	await first.hover()
	await expect.poll(overlayPlace).toBe('inside')
	await page.mouse.move(0, 0)
	await expect.poll(overlayPlace).toBe('below')
})

// the heading underline is `min(200%, 100cqw)` from the heading's left edge; it must stop at the
// block's own edge, which `body`'s clip would otherwise hide from documentOverflow
test('keeps the heading underline inside the block on every surface', async ({ page }) => {
	for (const document of [course, article, blocksPage]) {
		await page.goto(document.href(lang))
		const overrun = await page.locator('.more-documents__inner').evaluate((inner) => {
			const heading = inner.querySelector('.more-documents__heading')!
			const line = Number.parseFloat(getComputedStyle(heading, '::after').width)
			return heading.getBoundingClientRect().left + line - inner.getBoundingClientRect().right
		})
		expect(overrun, document.href(lang)).toBeLessThanOrEqual(1)
	}
})
