import { expect, type Page, test } from '@playwright/test'

import {
	closeMenu,
	endsWith,
	href,
	isCompactViewport,
	navRoutes,
	openMenu,
	overlayPanel,
	referenceLocale,
	t,
	textFor,
} from './helpers.ts'

const HOME = href(referenceLocale, '')

const shell = (page: Page) => page.locator('.hero-shell')

// window.__heroSwiper is set by the core's hero slider; narrow casts avoid augmenting the global
// Window in two programs
type SwiperProbe = {
	realIndex: number
	autoplay: { running: boolean; start: () => void; stop: () => void }
}

async function waitForSwiper(page: Page): Promise<void> {
	await page.waitForFunction(() =>
		Boolean((window as unknown as { __heroSwiper?: unknown }).__heroSwiper),
	)
}

function realIndex(page: Page): Promise<number | undefined> {
	return page.evaluate(
		() => (window as unknown as { __heroSwiper?: SwiperProbe }).__heroSwiper?.realIndex,
	)
}

function autoplayRunning(page: Page): Promise<boolean | undefined> {
	return page.evaluate(
		() => (window as unknown as { __heroSwiper?: SwiperProbe }).__heroSwiper?.autoplay.running,
	)
}

// the first inner section of the menu, reached from home through the overlay
const inner = navRoutes.find((route) => route.segment)!

async function visitInnerAndReturn(page: Page): Promise<void> {
	await openMenu(page)
	await overlayPanel(page)
		.getByRole('link', { name: textFor(inner.labels, referenceLocale), exact: true })
		.click()
	await expect(page).toHaveURL(endsWith(href(referenceLocale, inner.segment)))
}

test('renders exactly one <h1>', async ({ page }) => {
	// only the first slide renders its title as an H1, the rest use paragraphs
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto(HOME)
	await waitForSwiper(page)
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
})

test('active slide shows a split accent word', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto(HOME)
	await waitForSwiper(page)
	await expect(page.locator('.swiper-slide-active .altheading')).toHaveText(/\S/)
})

test('navigation arrows and pagination change the active slide', async ({ page }) => {
	// no reduced motion here, the slider must animate; autoplay is stopped to keep the index
	// deterministic
	await page.goto(HOME)
	await waitForSwiper(page)
	await page.evaluate(() =>
		(window as unknown as { __heroSwiper?: SwiperProbe }).__heroSwiper?.autoplay.stop(),
	)

	const start = await realIndex(page)
	await page.locator('.swiper-button-next').click()
	await expect.poll(() => realIndex(page)).not.toBe(start)

	const bullets = page.locator('.swiper-pagination-bullet')
	const last = (await bullets.count()) - 1
	expect(last).toBeGreaterThan(0)
	await bullets.nth(last).click()
	await expect.poll(() => realIndex(page)).toBe(last)
})

// the Swiper stylesheet is a page chunk that loads after the core one, on first load and after a View
// Transition swap; the controls must keep their place by layer order, not by load order
test('keeps the slider controls in place after a View Transition round trip', async ({ page }) => {
	const box = async (selector: string) => {
		const rect = await page.locator(selector).boundingBox()
		if (!rect) throw new Error(`${selector} is not rendered`)
		return rect
	}
	const controls = () =>
		Promise.all(
			['.swiper-button-prev', '.swiper-button-next', '.swiper-pagination'].map(
				async (selector) => Object.values(await box(selector)).map(Math.round),
			),
		)

	// no autoplay: the active slide, and with it the pagination side, stays the same
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto(HOME)
	await waitForSwiper(page)
	const slider = await box('.hero-swiper')
	const arrow = await box('.swiper-button-prev')
	const pagination = await box('.swiper-pagination')
	// the core's arrows end at 80% of the slider height, Swiper's default centers them
	expect(Math.abs(arrow.y + arrow.height - (slider.y + 0.8 * slider.height))).toBeLessThan(3)
	// the core's pagination sits well above the bottom edge, Swiper's default hugs it at 8px
	expect(slider.y + slider.height - (pagination.y + pagination.height)).toBeGreaterThan(50)
	const initial = await controls()

	// a full document load would drop the sentinel and prove nothing about the stylesheet swap
	type Probe = { __heroSwiper?: unknown; __vtSentinel?: boolean }
	const sentinelSurvives = () =>
		page.evaluate(() => (window as unknown as Probe).__vtSentinel === true)
	await page.evaluate(() => {
		;(window as unknown as Probe).__vtSentinel = true
	})

	await visitInnerAndReturn(page)
	expect(await sentinelSurvives()).toBe(true)
	await page.evaluate(() => {
		delete (window as unknown as Probe).__heroSwiper
	})

	await page.goBack()
	await expect(page).toHaveURL(endsWith(HOME))
	await waitForSwiper(page)
	expect(await sentinelSurvives()).toBe(true)
	await expect.poll(controls).toEqual(initial)
})

// the home default icon color and the hover/focus color tie on specificity, so the hover/focus rule
// wins only by source order, which must survive chunk order on first load and after a View Transition
test('social icons change color on hover and keyboard focus, also after a View Transition', async ({
	page,
}) => {
	test.skip(isCompactViewport(), 'the pointer hover state is checked on desktop')
	const icon = page.locator('.fs-social .social-icons .icon').first()
	const colors = () =>
		icon.evaluate((element) => {
			const style = getComputedStyle(element)
			return { color: style.color, border: style.borderColor }
		})
	const noTransitions = () => page.addStyleTag({ content: '* { transition: none !important; }' })
	const states = async () => {
		await noTransitions()
		await page.mouse.move(0, 0)
		const rest = await colors()
		await icon.hover()
		const hover = await colors()
		await page.mouse.move(0, 0)
		await page.keyboard.press('Tab')
		await icon.focus()
		await expect(icon).toBeFocused()
		const focus = await colors()
		await icon.blur()
		expect(hover.color).not.toBe(rest.color)
		expect(hover.border).toBe(hover.color)
		expect(focus).toEqual(hover)
		return { rest, hover }
	}

	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto(HOME)
	await waitForSwiper(page)
	const initial = await states()

	await visitInnerAndReturn(page)
	await page.evaluate(() => {
		delete (window as unknown as { __heroSwiper?: unknown }).__heroSwiper
	})
	await page.goBack()
	await expect(page).toHaveURL(endsWith(HOME))
	await waitForSwiper(page)
	expect(await states()).toEqual(initial)
})

// hovering the screen reveals both arrows at 0.55; the hovered arrow must outrank that and reach 1
test('raises the hovered slider arrow above the revealed ones', async ({ page }) => {
	test.skip(isCompactViewport(), 'the arrows reveal on hover with a fine pointer at >=lg only')
	await page.goto(HOME)
	await waitForSwiper(page)
	const opacity = (selector: string) =>
		page.locator(selector).evaluate((element) => getComputedStyle(element).opacity)
	const viewport = page.viewportSize()!
	await page.mouse.move(viewport.width / 2, viewport.height / 3)
	await expect.poll(() => opacity('.swiper-button-prev')).toBe('0.55')
	await expect.poll(() => opacity('.swiper-button-next')).toBe('0.55')

	const arrow = (await page.locator('.swiper-button-next').boundingBox())!
	await page.mouse.move(arrow.x + arrow.width / 2, arrow.y + arrow.height / 2)
	await expect.poll(() => opacity('.swiper-button-next')).toBe('1')
	await expect.poll(() => opacity('.swiper-button-prev')).toBe('0.55')
})

test('exposes localized navigation button labels', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto(HOME)
	await waitForSwiper(page)

	// the Swiper A11y module labels the buttons from the localized prev/next messages
	const labels = t(referenceLocale)
	await expect(page.locator('.swiper-button-next')).toHaveAttribute(
		'aria-label',
		labels('hero.slide.next'),
	)
	await expect(page.locator('.swiper-button-prev')).toHaveAttribute(
		'aria-label',
		labels('hero.slide.prev'),
	)
})

test('pauses autoplay while the menu is open and resumes on close', async ({ page }) => {
	await page.goto(HOME)
	await expect(shell(page)).toHaveAttribute('data-autoplay-running', 'true')

	await openMenu(page)
	await expect(shell(page)).toHaveAttribute('data-autoplay-running', 'false')
	expect(await autoplayRunning(page)).toBe(false)

	await closeMenu(page)
	await expect(shell(page)).toHaveAttribute('data-autoplay-running', 'true')
	expect(await autoplayRunning(page)).toBe(true)
})

test('does not start autoplay on menu close under reduced motion', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto(HOME)
	// reduced motion is a terminal pause: autoplay never starts
	await expect(shell(page)).toHaveAttribute('data-autoplay-running', 'false')

	await openMenu(page)
	await closeMenu(page)
	await expect(shell(page)).toHaveAttribute('data-autoplay-running', 'false')
	expect(await autoplayRunning(page)).toBe(false)
})

test('keeps a user-paused slider paused across menu open/close', async ({ page }) => {
	await page.goto(HOME)
	await expect(shell(page)).toHaveAttribute('data-autoplay-running', 'true')

	// the explicit user pause required by WCAG 2.2.2
	await page.locator('.hero-autoplay-toggle').click()
	await expect(shell(page)).toHaveAttribute('data-autoplay-running', 'false')

	await openMenu(page)
	await closeMenu(page)
	await expect(shell(page)).toHaveAttribute('data-autoplay-running', 'false')
	expect(await autoplayRunning(page)).toBe(false)
})

test('every hero CTA points at a live route', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto(HOME)
	await waitForSwiper(page)

	// CTAs target the albums, articles and pages chosen in the featured content, not menu items, so
	// each href is checked to be a live route
	const ctas = page.locator('a.hero-cta')
	const count = await ctas.count()
	expect(count).toBeGreaterThan(0)

	for (let i = 0; i < count; i++) {
		const link = await ctas.nth(i).getAttribute('href')
		expect(link, `CTA #${i} has an href`).toBeTruthy()
		const response = await page.request.get(link!)
		expect(response.status(), `CTA #${i} href ${link} resolves to a live route`).toBeLessThan(
			400,
		)
	}
})

test('has no horizontal overflow', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto(HOME)
	await waitForSwiper(page)

	const noOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
	)
	expect(noOverflow).toBe(true)
})

test('persists the theme choice on an inner page across reload', async ({ page }) => {
	await page.goto(href(referenceLocale, inner.segment))
	const initial = await page.evaluate(() => document.documentElement.dataset.theme)
	const toggled = initial === 'dark' ? 'light' : 'dark'

	// the visible theme control: the overlay button below lg, the inline toggle at lg and up
	if (isCompactViewport()) {
		await openMenu(page)
		await page.locator('.menu-overlay-theme').click()
		await page.keyboard.press('Escape')
	} else {
		await page.locator('[data-theme-toggle]').click()
	}

	await expect(page.locator('html')).toHaveAttribute('data-theme', toggled)
	expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(toggled)

	await page.reload()
	await expect(page.locator('html')).toHaveAttribute('data-theme', toggled)
})

test('forces dark theme on home regardless of a stored light preference', async ({ page }) => {
	await page.addInitScript(() => {
		try {
			localStorage.setItem('theme', 'light')
		} catch {
			// storage unavailable: nothing to override, the dark assertion still applies
		}
	})
	await page.goto(HOME)
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
