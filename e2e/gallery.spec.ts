import { expect, type Locator, type Page, test } from '@playwright/test'

import { GALLERY_MOBILE_MAX_PX } from '../packages/core/src/lib/blocks/gallery/geometry.ts'
import {
	type GalleryProps,
	parseGalleryProps,
} from '../packages/core/src/lib/blocks/gallery/schema.ts'
import {
	blocksPage,
	galleryPool,
	pageBlocks,
	photoById,
	photoIdOfImage,
	viewerCaption,
} from './content.ts'
import { coreCss, documentOverflow, referenceLocale } from './helpers.ts'
import { caption, viewerShowsImageOf } from './viewer.ts'

// the Gallery and Wrap Around blocks on the demo's `blocks` page, in the production build of the
// packed core: real CSS, the gallery coordinator and PhotoSwipe. Every expected count, frame and
// layout comes from the props the page authors, read with the core's own schema

const blocks = pageBlocks(blocksPage.slug, referenceLocale)

function galleryProps(testId: string): GalleryProps {
	const block = blocks.get(testId)
	if (block?.component !== 'Gallery')
		throw new Error(`no Gallery under ${testId} on the blocks page`)
	return parseGalleryProps(block.props)
}

const rect = galleryProps('gallery-rect')
const square = galleryProps('gallery-square')
const justified = galleryProps('gallery-justified')
const dynamic = galleryProps('gallery-dynamic')

const cellRatio = (layout: GalleryProps['layout']) =>
	coreCss('components/blocks/gallery.astro', `.gallery--${layout} .gallery__item`, 'aspect-ratio')

const FRAMES: GalleryProps['frame'][] = ['none', 'thin', 'medium', 'thick']

// the frame width the core resolved for the gallery's `frame`, which every cell's border must take
const frameWidth = async (gallery: Locator) =>
	Number(await gallery.locator('[data-gallery]').getAttribute('data-gallery-frame'))

// the CSS of the breakout keys on the width of the prose column, not of the viewport
const proseWidth = (page: Page) =>
	page.locator('article.prose').evaluate((node) => node.getBoundingClientRect().width)

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto(blocksPage.href(referenceLocale))
})

test('renders crop and natural layouts with their visual contracts', async ({ page }) => {
	const rectGallery = page.getByTestId('gallery-rect')
	const squareGallery = page.getByTestId('gallery-square')
	const justifiedGallery = page.getByTestId('gallery-justified')

	await expect(rectGallery.locator('.gallery__item')).toHaveCount(galleryPool(rect).length)
	await expect(rectGallery.locator('[data-gallery]')).toHaveAttribute(
		'data-gallery-outside',
		String(rect.outside),
	)
	const rectCell = rectGallery.locator('.gallery__item').first()
	const rectFrame = await frameWidth(rectGallery)
	await expect(rectCell).toHaveCSS('border-top-width', `${rectFrame}px`)
	await expect(rectCell).toHaveCSS('aspect-ratio', cellRatio(rect.layout))

	await expect(squareGallery.locator('.gallery__item')).toHaveCount(galleryPool(square).length)
	const squareCell = squareGallery.locator('.gallery__item').first()
	const squareFrame = await frameWidth(squareGallery)
	await expect(squareCell).toHaveCSS('border-top-width', `${squareFrame}px`)
	// the frame names order the widths: none < thin < medium < thick
	expect(FRAMES.indexOf(rect.frame)).toBeGreaterThan(FRAMES.indexOf(square.frame))
	expect(rectFrame).toBeGreaterThan(squareFrame)
	expect(squareFrame).toBeGreaterThan(0)
	await expect(squareCell).toHaveCSS('aspect-ratio', cellRatio(square.layout))
	expect(square.action).toBe('none')
	await expect(squareGallery.locator('a')).toHaveCount(0)

	await expect(justifiedGallery.locator('.gallery__item')).toHaveCount(
		galleryPool(justified).length,
	)
	expect(justified.lightboxCaption).toBe(false)
	await expect(justifiedGallery.locator('a.album-photo').first()).toBeAttached()
	await expect(justifiedGallery.locator('a[data-pswp-caption]')).toHaveCount(0)

	expect(await documentOverflow(page)).toBeLessThanOrEqual(1)
})

test('expands outside prose symmetrically while preserving viewport padding', async ({ page }) => {
	expect(rect.outside).toBeGreaterThan(0)
	const gallery = page.getByTestId('gallery-rect').locator('[data-gallery]')
	const width = page.viewportSize()!.width
	const geometry = await gallery.evaluate((node) => {
		const prose = node.closest<HTMLElement>('.prose')!
		const probe = document.createElement('div')
		probe.style.width = 'var(--container-pad)'
		document.body.append(probe)
		const pad = probe.getBoundingClientRect().width
		probe.remove()
		const galleryRect = node.getBoundingClientRect()
		const proseRect = prose.getBoundingClientRect()
		return {
			pad,
			galleryLeft: galleryRect.left,
			galleryRight: galleryRect.right,
			proseLeft: proseRect.left,
			proseRight: proseRect.right,
		}
	})

	if ((await proseWidth(page)) <= GALLERY_MOBILE_MAX_PX) {
		expect(geometry.galleryLeft).toBeCloseTo(geometry.proseLeft, 1)
		expect(geometry.galleryRight).toBeCloseTo(geometry.proseRight, 1)
	} else {
		expect(geometry.galleryLeft).toBeLessThan(geometry.proseLeft)
		expect(geometry.galleryRight).toBeGreaterThan(geometry.proseRight)
		expect(geometry.galleryLeft - geometry.pad).toBeGreaterThanOrEqual(-0.5)
		expect(width - geometry.pad - geometry.galleryRight).toBeGreaterThanOrEqual(-0.5)
		expect(geometry.proseLeft - geometry.galleryLeft).toBeCloseTo(
			geometry.galleryRight - geometry.proseRight,
			1,
		)
	}
})

test('keeps dynamic mobile-first candidates inert until desktop space is available', async ({
	page,
}) => {
	expect(dynamic.mobileFirstOnly).toBe(true)
	const randomCount = dynamic.randomCount!
	expect(galleryPool(dynamic).length).toBeGreaterThan(randomCount)
	const gallery = page.getByTestId('gallery-dynamic').locator('[data-gallery]')
	const live = gallery.locator('[data-gallery-live] .gallery__item')
	const deferred = gallery.locator('template[data-gallery-deferred]')

	if ((await proseWidth(page)) <= GALLERY_MOBILE_MAX_PX) {
		await expect(live).toHaveCount(1)
		await expect(deferred).toHaveCount(1)
		await page.setViewportSize({ width: 768, height: 1024 })
		expect(await proseWidth(page)).toBeGreaterThan(GALLERY_MOBILE_MAX_PX)
		await expect(live).toHaveCount(randomCount)
		await expect(deferred).toHaveCount(0)
	} else {
		await expect(live).toHaveCount(randomCount)
		await expect(deferred).toHaveCount(0)
	}
})

test('opens a cropped Gallery preview in the shared PhotoSwipe viewer', async ({ page }) => {
	// a static album gallery keeps the album order, so its first cell is the album's first photo
	const [photoId] = galleryPool(rect)
	const trigger = page.getByTestId('gallery-rect').locator('a.album-photo').first()
	const source = new URL((await trigger.getAttribute('data-pswp-src'))!, page.url()).href
	expect(photoIdOfImage(source)).toBe(photoId)
	await trigger.click()

	const pswp = page.locator('.pswp')
	await expect(pswp).toHaveClass(/pswp--ui-visible/)
	expect(rect.lightboxCaption).toBe(true)
	await expect(caption(page)).toHaveText(viewerCaption(photoById(photoId!), referenceLocale))
	await expect.poll(() => viewerShowsImageOf(page, photoId!)).toBe(true)
	await page.keyboard.press('Escape')
	await expect(pswp).toHaveCount(0)
	await expect(trigger).toBeFocused()
})

// every gap token is set to one value, so each block's spacing must follow the theme after a resize
test('uses theme gaps for ordinary blocks, grids and justified geometry after resize', async ({
	page,
}) => {
	await page.evaluate(() => {
		for (const gap of ['none', 'tiny', 'small', 'medium', 'large'])
			document.documentElement.style.setProperty(`--content-gap-${gap}`, '1.75rem')
	})
	for (const width of [1440, 980, 768]) {
		await page.setViewportSize({ width, height: 1024 })
		await expect
			.poll(async () =>
				page.evaluate(() => {
					const expectedGap =
						Number.parseFloat(getComputedStyle(document.documentElement).fontSize) *
						1.75
					const ordinary = document.querySelector<HTMLElement>(
						'[data-testid="wrap-around"] .wrap-around',
					)!
					const figures = [
						...ordinary.querySelectorAll<HTMLElement>('.wrap-around__figure'),
					]
					const ordinaryGap =
						figures[1]!.getBoundingClientRect().top -
						figures[0]!.getBoundingClientRect().bottom
					const accurateGrids = [
						'[data-testid="gallery-rect"] .gallery__grid',
						'[data-testid="gallery-square"] .gallery__grid',
						'[data-testid="gallery-dynamic"] [data-gallery-live]',
					].every((selector) => {
						const grid = document.querySelector<HTMLElement>(selector)!
						const cells = [...grid.querySelectorAll<HTMLElement>('.gallery__item')]
						if (cells.length < 2) return false
						const rects = cells.map((cell) => cell.getBoundingClientRect())
						const gap = rects[1]!.left - rects[0]!.right
						return (
							Math.abs(gap - expectedGap) < 0.1 &&
							Math.abs(
								Number.parseFloat(getComputedStyle(grid).columnGap) - expectedGap,
							) < 0.1 &&
							rects.every(
								(rect) => rect.right <= grid.getBoundingClientRect().right + 0.1,
							)
						)
					})
					const justifiedGrid = document.querySelector<HTMLElement>(
						'[data-testid="gallery-justified"] .gallery__grid',
					)!
					const rows = [...justifiedGrid.querySelectorAll<HTMLElement>('.gallery__row')]
					const accurateRows =
						rows.length > 0 &&
						rows.every((row, rowIndex) => {
							const items = [...row.querySelectorAll<HTMLElement>('.gallery__item')]
							const rects = items.map((item) => item.getBoundingClientRect())
							const fillsRow =
								rowIndex === rows.length - 1 ||
								Math.abs(rects.at(-1)!.right - row.getBoundingClientRect().right) <=
									1
							return (
								fillsRow &&
								rects.every(
									(rect, index) =>
										index === 0 ||
										Math.abs(
											rect.left - rects[index - 1]!.right - expectedGap,
										) < 0.1,
								) &&
								rects.every(
									(rect) => rect.right <= row.getBoundingClientRect().right + 0.1,
								) &&
								rects.every(
									(rect) => Math.abs(rect.height - rects[0]!.height) < 0.1,
								)
							)
						})
					return (
						Math.abs(ordinaryGap - expectedGap) < 0.1 &&
						accurateGrids &&
						Math.abs(
							Number.parseFloat(getComputedStyle(justifiedGrid).columnGap) -
								expectedGap,
						) < 0.1 &&
						accurateRows &&
						document.documentElement.scrollWidth <=
							document.documentElement.clientWidth + 1
					)
				}),
			)
			.toBe(true)
	}
})
