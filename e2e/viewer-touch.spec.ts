import { expect, type Page, test } from '@playwright/test'

import { albums, blocksPage, photoById, viewerCaption } from './content.ts'
import { endsWith, type Lang, referenceLocale } from './helpers.ts'
import { caption } from './viewer.ts'

// touch input on the phone and tablet projects only (playwright.config.ts): the album viewer opens
// on a tap, pages on a swipe in grid order and zooms on a double tap; a title-slide card shows its
// title without hover, so one tap follows the link. The desktop viewer is covered by viewer.spec.ts

const lang = referenceLocale
const [album] = albums

// a real touch swipe through CDP: Chromium turns it into pointer events with pointerType 'touch',
// which PhotoSwipe drag reacts to, while Playwright `touchscreen` can only tap
async function touchSwipe(
	page: Page,
	from: { x: number; y: number },
	to: { x: number; y: number },
	steps = 10,
): Promise<void> {
	const client = await page.context().newCDPSession(page)
	await client.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [{ x: from.x, y: from.y }],
	})
	for (let index = 1; index <= steps; index += 1) {
		await client.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [
				{
					x: from.x + ((to.x - from.x) * index) / steps,
					y: from.y + ((to.y - from.y) * index) / steps,
				},
			],
		})
	}
	await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
	await client.detach()
}

// the grid's photo ids in DOM order, which is the viewer's slide order
async function gridPhotoIds(page: Page, language: Lang): Promise<string[]> {
	const hrefs = await page
		.locator('a.album-photo')
		.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))
	return hrefs.map((link) => {
		const photo = album!.photos.find((entry) => entry.href(language) === link)
		if (!photo) throw new Error(`${link} is not a photo of the album ${album!.id}`)
		return photo.id
	})
}

test.beforeEach(async ({ page }) => {
	// reduced motion makes open, close and slide transitions instant and deterministic
	await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('a tap opens the viewer and a swipe advances to the next slide in grid order', async ({
	page,
}) => {
	await page.goto(album!.href(lang))
	const [first, second] = await gridPhotoIds(page, lang)
	expect(second).toBeDefined()
	await page.locator('a.album-photo').first().tap()

	await expect(page.locator('.pswp')).toHaveClass(/pswp--ui-visible/)
	await expect(caption(page)).toHaveText(viewerCaption(photoById(first!), lang))

	const viewport = page.viewportSize()!
	const midY = Math.round(viewport.height / 2)
	// the distance is well above the swipe recognition threshold
	await touchSwipe(
		page,
		{ x: Math.round(viewport.width * 0.85), y: midY },
		{ x: Math.round(viewport.width * 0.15), y: midY },
	)

	await expect(caption(page)).toHaveText(viewerCaption(photoById(second!), lang))
})

test('a double tap zooms the current slide', async ({ page }) => {
	await page.goto(album!.href(lang))
	await page.locator('a.album-photo').first().tap()

	const pswp = page.locator('.pswp')
	await expect(pswp).toHaveClass(/pswp--ui-visible/)
	await expect(pswp).not.toHaveClass(/pswp--zoomed-in/)

	const viewport = page.viewportSize()!
	const cx = Math.round(viewport.width / 2)
	const cy = Math.round(viewport.height / 2)
	await page.touchscreen.tap(cx, cy)
	await page.touchscreen.tap(cx, cy)

	await expect(pswp).toHaveClass(/pswp--zoomed-in/)
})

// without hover the title must already be visible, so the first tap opens the document instead of
// only revealing the overlay
test('a title-slide card shows the title without hover and one tap opens it', async ({ page }) => {
	await page.goto(blocksPage.href(lang))
	const card = page.locator('nav.more-documents a.card--title-slide').first()
	await card.scrollIntoViewIfNeeded()
	const shown = await card.evaluate((node) => {
		const frame = node.querySelector('.card__media-frame')!.getBoundingClientRect()
		const overlay = node.querySelector('.card__overlay')!.getBoundingClientRect()
		return overlay.top < frame.bottom - 1 && overlay.bottom <= frame.bottom + 1
	})
	expect(shown).toBe(true)
	const href = (await card.getAttribute('href'))!
	await card.tap()
	await expect(page).toHaveURL(endsWith(href))
})
