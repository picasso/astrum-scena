import { expect, test } from '@playwright/test'

import {
	endsWith,
	href,
	isCompactViewport,
	menuToggle,
	navRoute,
	openMenu,
	overlayPanel,
	referenceLocale,
	t,
	textFor,
} from './helpers.ts'

const PORTFOLIO = href(referenceLocale, 'portfolio')
const ARTICLES = href(referenceLocale, 'articles')
const articlesLabel = textFor(navRoute('articles').labels, referenceLocale)
const labels = t(referenceLocale)

// an inner page on purpose: the fullscreen home is overflow-hidden and has no <main>, so it would
// not show the background scroll lock or inert
test.beforeEach(async ({ page }) => {
	test.skip(
		!isCompactViewport(),
		'overlay hamburger is shown only below the lg breakpoint on inner pages',
	)
	await page.goto(PORTFOLIO)
})

test('opens and closes via the toggle button', async ({ page }) => {
	const toggle = menuToggle(page)
	await expect(toggle).toHaveAttribute('aria-expanded', 'false')
	await expect(overlayPanel(page)).not.toHaveAttribute('data-open')

	await openMenu(page)

	await toggle.click()
	await expect(toggle).toHaveAttribute('aria-expanded', 'false')
	await expect(overlayPanel(page)).not.toHaveAttribute('data-open')
})

test('closes on Escape and returns focus to the toggle', async ({ page }) => {
	await openMenu(page)
	await page.keyboard.press('Escape')

	await expect(overlayPanel(page)).not.toHaveAttribute('data-open')
	await expect(menuToggle(page)).toBeFocused()
})

test('moves focus into the panel on open', async ({ page }) => {
	await openMenu(page)
	const firstLink = overlayPanel(page).getByRole('link').first()
	await expect(firstLink).toBeFocused()
})

test('traps focus within the panel', async ({ page }) => {
	await openMenu(page)

	const focusables = overlayPanel(page).locator(
		'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
	)
	const count = await focusables.count()
	const first = focusables.first()
	const last = focusables.nth(count - 1)

	await expect(first).toBeFocused()
	await page.keyboard.press('Shift+Tab')
	await expect(last).toBeFocused()

	await page.keyboard.press('Tab')
	await expect(first).toBeFocused()
})

test('locks background scroll and restores position on close', async ({ page }) => {
	await page.evaluate(() => {
		document.body.style.minHeight = '3000px'
	})
	await page.evaluate(() => window.scrollTo(0, 300))
	expect(await page.evaluate(() => window.scrollY)).toBe(300)

	// a programmatic click skips the scroll into view that locator.click does, so the lock captures
	// position 300; toPass retries until the menu script binds, and the aria-expanded guard prevents
	// a double toggle
	await expect(async () => {
		await page.evaluate(() => {
			const btn = document.querySelector<HTMLButtonElement>(
				'button[aria-controls="site-menu-overlay"]',
			)
			if (btn?.getAttribute('aria-expanded') !== 'true') btn?.click()
		})
		await expect(overlayPanel(page)).toHaveAttribute('data-open', 'true', { timeout: 500 })
	}).toPass({ timeout: 5000 })

	expect(await page.evaluate(() => document.body.style.position)).toBe('fixed')
	expect(await page.evaluate(() => document.body.style.width)).toBe('100%')
	expect(await page.evaluate(() => document.body.style.top)).toBe('-300px')

	await page.keyboard.press('Escape')
	await expect(overlayPanel(page)).not.toHaveAttribute('data-open')
	// focus returns to the toggle with preventScroll, so it does not undo the restored position
	expect(await page.evaluate(() => document.body.style.position)).toBe('')
	expect(await page.evaluate(() => document.body.style.top)).toBe('')
	expect(await page.evaluate(() => window.scrollY)).toBe(300)
})

test('marks background regions inert while open', async ({ page }) => {
	const main = page.locator('main[data-menu-inert]')
	await expect(main).toHaveJSProperty('inert', false)

	await openMenu(page)
	await expect(main).toHaveJSProperty('inert', true)

	await page.keyboard.press('Escape')
	await expect(main).toHaveJSProperty('inert', false)
})

test('navigating a link closes the overlay', async ({ page }) => {
	await openMenu(page)
	await overlayPanel(page).getByRole('link', { name: articlesLabel, exact: true }).click()

	await expect(page).toHaveURL(endsWith(ARTICLES))
	await expect(overlayPanel(page)).not.toHaveAttribute('data-open')
})

// ClientRouter swaps the page under an open menu on browser Back; the old page's keydown trap must
// go with it, or Tab keeps refocusing the detached panel
test('releases the open overlay when Back leaves the page', async ({ page }) => {
	await openMenu(page)
	await overlayPanel(page).getByRole('link', { name: articlesLabel, exact: true }).click()
	await expect(page).toHaveURL(endsWith(ARTICLES))

	await openMenu(page)
	await page.goBack()
	await expect(page).toHaveURL(endsWith(PORTFOLIO))

	await expect(overlayPanel(page)).not.toHaveAttribute('data-open')
	await expect(menuToggle(page)).toHaveAttribute('aria-expanded', 'false')
	await expect(page.locator('html')).toHaveAttribute('data-menu-open', 'false')
	await expect(page.locator('main[data-menu-inert]')).toHaveJSProperty('inert', false)
	expect(await page.evaluate(() => document.body.style.position)).toBe('')

	await page.keyboard.press('Tab')
	expect(
		await page.evaluate(
			() => document.activeElement !== document.body && document.activeElement?.isConnected,
		),
	).toBe(true)

	// the menu of the page Back returned to is bound, not just rendered closed
	await openMenu(page)
	await expect(overlayPanel(page).getByRole('link').first()).toBeFocused()
	await page.keyboard.press('Escape')
	await expect(overlayPanel(page)).not.toHaveAttribute('data-open')
})

test('closes and releases the open overlay when the viewport crosses to desktop', async ({
	page,
}) => {
	await openMenu(page)
	const { height } = page.viewportSize()!
	await page.setViewportSize({ width: 1280, height })

	await expect(overlayPanel(page)).not.toHaveAttribute('data-open')
	await expect(menuToggle(page)).toHaveAttribute('aria-expanded', 'false')
	expect(
		await page.evaluate(() =>
			Array.from(document.querySelectorAll<HTMLElement>('[data-menu-inert]')).some(
				(el) => el.inert,
			),
		),
	).toBe(false)
	expect(await page.evaluate(() => document.body.style.position)).toBe('')
})

test('syncs the theme button to a stored light theme and to its own toggle', async ({ page }) => {
	await page.evaluate(() => localStorage.setItem('theme', 'light'))
	await page.reload()
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

	await openMenu(page)
	const themeButton = overlayPanel(page).locator('.menu-overlay-theme')
	await expect(themeButton).toHaveText(labels('theme.toggle.toDark'))
	await expect(themeButton).toHaveAttribute('aria-pressed', 'false')

	await themeButton.click()
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
	await expect(themeButton).toHaveText(labels('theme.toggle.toLight'))
	await expect(themeButton).toHaveAttribute('aria-pressed', 'true')
})

// the overlay CSS ships in the page head, so the closed overlay is styled with no script at all
test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false })

	for (const [name, path] of [
		['home', href(referenceLocale, '')],
		['inner page', PORTFOLIO],
	] as const) {
		test(`styles the closed overlay without JavaScript on the ${name}`, async ({ page }) => {
			await page.goto(path)
			await expect(overlayPanel(page)).toBeHidden()
			await expect(menuToggle(page)).toHaveCSS('position', 'fixed')
		})
	}
})
