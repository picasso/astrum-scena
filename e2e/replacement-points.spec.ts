import { expect, type Locator, type Page, test } from '@playwright/test'

import { firstDocument } from './content.ts'
import {
	endsWith,
	href,
	isCompactViewport,
	referenceLocale,
	siteTitle,
	textFor,
} from './helpers.ts'

// the demo replaces the `logo` point (demo/src/overrides/logo.astro) with a mark and the site title.
// The core keeps the link around it, so the link must still take keyboard focus, lead home through
// ClientRouter, swap with the section icon once the bar is pinned and show in the banner on a phone

const lang = referenceLocale
const title = textFor(siteTitle, lang)
const home = href(lang, '')
// a long demo page with a banner: it pins the bar at every desktop width
const ARTICLE = firstDocument('article')

// the mark of the replacement: the site title as text, no fragment of the SVG logo files
async function expectSiteMark(link: Locator) {
	await expect(link).toHaveAttribute('href', home)
	await expect(link).toHaveAccessibleName(title)
	await expect(link.getByText(title, { exact: true })).toHaveCount(1)
	await expect(link.locator('use')).toHaveCount(0)
}

// a full reload would drop the flag; a ClientRouter swap keeps the window and its globals
async function markWindow(page: Page) {
	await page.evaluate(() => {
		;(window as Window & { replacementMarker?: boolean }).replacementMarker = true
	})
}

async function expectSameWindowAtHome(page: Page) {
	await expect(page).toHaveURL(endsWith(home))
	expect(
		await page.evaluate(
			() => (window as Window & { replacementMarker?: boolean }).replacementMarker,
		),
	).toBe(true)
}

test.describe('the logo replacement in the header', () => {
	test.beforeEach(() => {
		test.skip(isCompactViewport(), 'the header bar shows only at 1024px and up')
	})

	test("is the site's mark inside the core's link", async ({ page }) => {
		await page.goto(ARTICLE.href(lang))
		await expectSiteMark(page.locator('header.site-header a.site-header__logo'))
	})

	test('takes focus from the keyboard and leads home through ClientRouter', async ({ page }) => {
		await page.goto(ARTICLE.href(lang))
		await markWindow(page)
		const link = page.locator('header.site-header a.site-header__logo')
		for (let presses = 0; presses < 20; presses += 1) {
			if (await link.evaluate((node) => node === document.activeElement)) break
			await page.keyboard.press('Tab')
		}
		await expect(link).toBeFocused()
		await page.keyboard.press('Enter')
		await expectSameWindowAtHome(page)
	})

	test('swaps in for the section icon once the bar is pinned', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' })
		await page.goto(ARTICLE.href(lang))
		const header = page.locator('header.site-header')
		const slot = header.locator('a.site-header__logo--swap')
		const brand = slot.locator('> .site-header__brand')
		const icon = slot.locator('> .site-header__icon')
		await expectSiteMark(slot)
		await expect(brand).toHaveCSS('opacity', '0')
		await expect(icon).toHaveCSS('opacity', '1')

		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
		await expect(header).toHaveAttribute('data-stuck')
		await expect(brand).toHaveCSS('opacity', '1')
		await expect(icon).toHaveCSS('opacity', '0')
		await expect(brand.getByText(title, { exact: true })).toBeVisible()
	})
})

test.describe('the logo replacement in the banner', () => {
	test.beforeEach(() => {
		test.skip(!isCompactViewport(), 'the banner shows the logo only below 1024px')
	})

	test("is the site's mark inside the core's link and leads home through ClientRouter", async ({
		page,
	}) => {
		await page.goto(ARTICLE.href(lang))
		const link = page.locator('a.banner-logo')
		await expect(link).toBeVisible()
		await expectSiteMark(link)
		await expect(link.getByText(title, { exact: true })).toBeVisible()
		await markWindow(page)
		await link.click()
		await expectSameWindowAtHome(page)
	})
})
