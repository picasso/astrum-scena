import { expect, type Locator, type Page, test } from '@playwright/test'

import { firstDocument } from './content.ts'
import { isCompactViewport, referenceLocale } from './helpers.ts'

// with `menu.sectionIcon`, a logo and `sticky: on`, the pinned header swaps the section icon for the
// logo by sliding and fading them. Under reduced motion the swap is instant and in place: neither
// element has a transition or an offset, at the top and once the bar is pinned

// a long demo page: it scrolls past the banner and pins the bar at every desktop width
const ARTICLE = firstDocument('article')

test.beforeEach(() => {
	test.skip(isCompactViewport(), 'the header pins, and so swaps, only at 1024px and up')
})

async function motion(element: Locator) {
	return element.evaluate((node) => {
		const style = getComputedStyle(node)
		return { duration: style.transitionDuration, left: style.left, opacity: style.opacity }
	})
}

async function openArticle(page: Page) {
	await page.goto(ARTICLE.href(referenceLocale))
	const header = page.locator('header.site-header')
	const slot = header.locator('.site-header__logo--swap')
	const icon = slot.locator('> .site-header__icon')
	const logo = slot.locator('> .site-header__brand')
	// the swap is on: the section icon and the logo are both rendered in the slot
	await expect(icon.locator('svg')).toHaveCount(1)
	await expect(logo.locator('svg')).not.toHaveCount(0)
	await expect(header).not.toHaveAttribute('data-stuck')
	return { header, icon, logo }
}

// the bar pins once the sentinel right above it leaves the viewport, and then sits at its top
async function pin(page: Page, header: Locator) {
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
	expect(
		await page
			.locator('.site-header__sentinel')
			.evaluate((node) => node.getBoundingClientRect().bottom),
		'the page is long enough to scroll the sentinel out',
	).toBeLessThanOrEqual(0)
	await expect(header).toHaveAttribute('data-stuck')
	await expect(header).toBeVisible()
	expect(await header.evaluate((node) => node.getBoundingClientRect().top)).toBe(0)
}

test('the icon and logo swap without motion under reduced motion', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' })
	const { header, icon, logo } = await openArticle(page)
	const atTop = async () => {
		expect(await motion(icon)).toEqual({ duration: '0s', left: '0px', opacity: '1' })
		expect(await motion(logo)).toEqual({ duration: '0s', left: '0px', opacity: '0' })
	}
	await atTop()

	await pin(page, header)
	// no delay either: the pinned state is in place at once
	expect(await motion(icon)).toEqual({ duration: '0s', left: '0px', opacity: '0' })
	expect(await motion(logo)).toEqual({ duration: '0s', left: '0px', opacity: '1' })

	await page.evaluate(() => window.scrollTo(0, 0))
	await expect(header).not.toHaveAttribute('data-stuck')
	await atTop()
})

// with motion the swap is animated (delays up to 2.6s plus 1s transitions), and it must end with
// the logo in place and the icon gone
test('the pinned bar settles on the logo with motion', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' })
	const { header, icon, logo } = await openArticle(page)
	await pin(page, header)
	await expect
		.poll(async () => ({ icon: (await motion(icon)).opacity, logo: await motion(logo) }), {
			timeout: 10_000,
		})
		.toEqual({
			icon: '0',
			logo: { duration: expect.any(String), left: '0px', opacity: '1' },
		})
})
