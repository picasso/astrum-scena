import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { pageHref, RIGHTS_PATH, STATUS_PATH } from '../packages/core/src/lib/content/routes.ts'
import { documents, draftCourseSlugs, firstDocument } from './content.ts'
import {
	DEMO_ROOT,
	demoConfig,
	endsWith,
	escapeRegExp,
	href,
	isCompactViewport,
	type Lang,
	locales,
	navRoute,
	navRoutes,
	openMenu,
	otherLocale,
	overlayPanel,
	referenceLocale,
	type RouteDef,
	siteTitle,
	switchLanguageVia,
	t,
	textFor,
	usesOverlay,
	viewportWidth,
} from './helpers.ts'

// document.title collapses whitespace runs and trims, so the expected title does too
const titlePattern = (title: string) => new RegExp(escapeRegExp(title.replace(/\s+/g, ' ').trim()))

const primaryNav = (page: Page) => page.getByRole('navigation', { name: 'Primary' })

// clicks through the real menu; `fromHome` matters because home navigates only through the overlay,
// even on desktop
async function navigateVia(
	page: Page,
	lang: Lang,
	route: RouteDef,
	fromHome: boolean,
): Promise<void> {
	const name = textFor(route.labels, lang)
	if (usesOverlay(fromHome)) {
		await openMenu(page)
		await overlayPanel(page).getByRole('link', { name, exact: true }).click()
	} else {
		await primaryNav(page).getByRole('link', { name, exact: true }).click()
	}
}

for (const lang of locales) {
	test.describe(`routes render (${lang})`, () => {
		for (const route of navRoutes) {
			test(`${href(lang, route.segment)} loads without errors`, async ({ page }) => {
				const errors: string[] = []
				page.on('pageerror', (error) => errors.push(error.message))

				await page.goto(href(lang, route.segment))

				await expect(page.locator('html')).toHaveAttribute('lang', lang)
				await expect(page).toHaveTitle(titlePattern(textFor(siteTitle, lang)))
				// the page title lives in the hero slot; exactly one H1 per route
				await expect(page.locator('h1')).toHaveCount(1)
				await expect(page.locator('h1')).toBeVisible()
				expect(errors, `no uncaught JS errors on ${href(lang, route.segment)}`).toEqual([])
			})
		}
	})

	test(`contacts privacy link points to the ${lang} privacy page`, async ({ page }) => {
		await page.goto(href(lang, 'contacts'))
		await expect(page.locator('.contact-form__subheading-copy a')).toHaveAttribute(
			'href',
			pageHref('privacy', lang),
		)
	})
}

// the contact form intro reuses the Note look; its own size and margin must win over the block's
// whichever order the page chunks load in — a full load and a ClientRouter arrival order them
// differently
test.describe('contact form intro keeps its own metrics over the note block', () => {
	async function expectFormIntroMetrics(page: Page): Promise<void> {
		const intro = page.locator('.contact-form__subheading.note')
		await expect(intro).toBeAttached()
		// 0.875em of the form's own font size, no bottom margin (the note block alone would give
		// 0.8em, 8px)
		await expect
			.poll(() =>
				intro.evaluate((element) => {
					const form = element.closest('.contact-form')
					if (!form) throw new Error('contact form intro outside .contact-form')
					const style = getComputedStyle(element)
					const ratio =
						Number.parseFloat(style.fontSize) /
						Number.parseFloat(getComputedStyle(form).fontSize)
					return {
						ratio: Math.round(ratio * 1000) / 1000,
						marginBottom: style.marginBottom,
					}
				}),
			)
			.toEqual({ ratio: 0.875, marginBottom: '0px' })
	}

	test('on a direct load of the contacts page', async ({ page }) => {
		await page.goto(href(referenceLocale, 'contacts'))
		await expectFormIntroMetrics(page)
	})

	test('after arriving through the real menu', async ({ page }) => {
		await page.goto(href(referenceLocale, ''))
		await page.evaluate(() => {
			;(window as unknown as { __sameDocument?: boolean }).__sameDocument = true
		})
		await navigateVia(page, referenceLocale, navRoute('contacts'), true)
		await expect(page).toHaveURL(endsWith(href(referenceLocale, 'contacts')))
		expect(
			await page.evaluate(
				() => (window as unknown as { __sameDocument?: boolean }).__sameDocument,
			),
			'navigation stayed in the ClientRouter document',
		).toBe(true)
		await expectFormIntroMetrics(page)
	})
})

test('navigates every section through the real menu', async ({ page }) => {
	await page.goto(href(referenceLocale, ''))

	let fromHome = true
	for (const route of navRoutes) {
		await navigateVia(page, referenceLocale, route, fromHome)
		await expect(page).toHaveURL(endsWith(href(referenceLocale, route.segment)))
		await expect(page.locator('h1')).toHaveCount(1)
		await expect(page.locator('h1')).toBeVisible()

		const destIsHome = route.segment === ''
		// aria-current exists only in the inline navbar of inner pages at lg and up
		if (!usesOverlay(destIsHome)) {
			await expect(
				primaryNav(page).getByRole('link', {
					name: textFor(route.labels, referenceLocale),
					exact: true,
				}),
			).toHaveAttribute('aria-current', 'page')
		}

		fromHome = destIsHome
	}
})

// overlay variants are covered in menu-overlay.spec.ts
test.describe('desktop top-menu current section', () => {
	test.beforeEach(() => {
		test.skip(isCompactViewport(), 'inline top-menu exists only on inner pages at >=lg')
	})

	const sectionLink = (page: Page, segment: string) =>
		primaryNav(page).getByRole('link', {
			name: textFor(navRoute(segment).labels, referenceLocale),
			exact: true,
		})

	// a detail route highlights its section visually, while aria-current="page" stays on the exact
	// URL
	test('marks the ancestor section on a detail route, aria-current stays exact-only', async ({
		page,
	}) => {
		await page.goto(firstDocument('article').href(referenceLocale))
		const articles = sectionLink(page, 'articles')
		await expect(articles).toHaveAttribute('data-current-section')
		await expect(articles).not.toHaveAttribute('aria-current', 'page')
	})

	// the reduced-motion reset must beat every effect's hover/focus rule, whichever effect is
	// configured; the page is a third section, so neither link is the current one
	test('keeps hovered and focused labels still under reduced motion', async ({ page }) => {
		const [hoveredRoute, focusedRoute, pageRoute] = navRoutes.filter((route) => route.segment)
		test.skip(!pageRoute, 'needs three inner sections in the menu')
		await page.emulateMedia({ reducedMotion: 'reduce' })
		await page.goto(href(referenceLocale, pageRoute!.segment))
		const hovered = sectionLink(page, hoveredRoute!.segment)
		const focused = sectionLink(page, focusedRoute!.segment)
		const motion = (link: typeof hovered) =>
			link.locator('.top-menu-label').evaluate((label) => {
				const style = getComputedStyle(label)
				return {
					transform: style.transform,
					durations: style.transitionDuration.split(',').map((value) => value.trim()),
				}
			})
		const still = { transform: 'none', durations: ['0s'] }

		await hovered.hover()
		expect(await motion(hovered)).toEqual(still)
		await page.mouse.move(0, 0)
		await focused.focus()
		await expect(focused).toBeFocused()
		expect(await motion(focused)).toEqual(still)
	})

	// the hover effect duplicates the label in a data-hover copy, which must not change the
	// accessible name
	test('exposes one exact accessible name per link and is keyboard focusable', async ({
		page,
	}) => {
		await page.goto(href(referenceLocale, 'portfolio'))
		const link = sectionLink(page, 'portfolio')
		await expect(link).toHaveCount(1)
		await link.focus()
		await expect(link).toBeFocused()
	})
})

// the portfolio H1 is the dictionary's nav.portfolio, not the menu label
test('switches language while keeping the current section', async ({ page }) => {
	const second = otherLocale(referenceLocale)
	test.skip(!second, 'a one-locale site has no language switcher')
	await page.goto(href(referenceLocale, 'portfolio'))

	for (const [from, to] of [
		[referenceLocale, second!],
		[second!, referenceLocale],
	] as const) {
		await switchLanguageVia(page, from, to)
		await expect(page).toHaveURL(endsWith(href(to, 'portfolio')))
		await expect(page.locator('html')).toHaveAttribute('lang', to)
		await expect(
			page.getByRole('heading', { level: 1, name: t(to)('nav.portfolio') }),
		).toBeVisible()
	}
})

// the rights page renders one section per active locale from the site's legal texts
test('rights page has one section per active locale with its text', async ({ page }) => {
	await page.goto(RIGHTS_PATH)
	await expect(page.locator('.prose > section')).toHaveCount(locales.length)
	for (const locale of locales) {
		const source = readFileSync(
			join(DEMO_ROOT, 'src', 'content', 'legal', `rights.${locale}.md`),
			'utf8',
		)
		const firstLine = source.split('---')[2]!.trim().split('\n')[0]!
		await expect(page.locator(`.prose > section[lang="${locale}"]`)).toContainText(firstLine)
	}
})

// status metrics share one row in equal columns, and stack one per row on phones (below 40rem)
test('status metrics share one equal row, stacking below 640px', async ({ page }) => {
	await page.goto(STATUS_PATH)
	const boxes = await page
		.locator('.site-status__metric')
		.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().toJSON()))
	expect(boxes.length).toBeGreaterThan(1)
	if (viewportWidth() < 640) {
		for (let i = 1; i < boxes.length; i++) {
			expect(boxes[i]!.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom - 1)
		}
	} else {
		for (const box of boxes) {
			expect(Math.abs(box.top - boxes[0]!.top)).toBeLessThanOrEqual(1)
			expect(Math.abs(box.width - boxes[0]!.width)).toBeLessThanOrEqual(1)
		}
	}
})

// status tones come from Tailwind's palette through var(); an unresolved reference would compute to
// transparent and ship invisible badges and freshness dots
for (const theme of ['dark', 'light'] as const) {
	test(`status palette tones resolve to visible colors (${theme})`, async ({ page }) => {
		await page.goto(STATUS_PATH)
		await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important}' })
		await page.evaluate((value) => {
			document.documentElement.dataset.theme = value
		}, theme)
		const colors = await page.evaluate(() => {
			const style = (selector: string) => {
				const element = document.querySelector(selector)
				if (!element) throw new Error(`missing ${selector}`)
				return getComputedStyle(element)
			}
			return {
				page: getComputedStyle(document.body).backgroundColor,
				badge: style('.site-status__badge--solid.site-status__tone-articles')
					.backgroundColor,
				freshness: style(".site-status__freshness[data-status='published']").color,
			}
		})
		for (const tone of [colors.badge, colors.freshness]) {
			expect(tone).not.toBe('rgba(0, 0, 0, 0)')
			expect(tone).not.toBe('transparent')
			expect(tone).not.toBe(colors.page)
		}
	})
}

// the built document pages carry their own SEO: a self canonical, one alternate per active locale
// plus x-default (the first locale), and a sitemap entry unless the document is unlisted
test.describe('document SEO', () => {
	const absolute = (path: string) => new URL(path, demoConfig.origin).href

	for (const document of documents) {
		for (const lang of locales) {
			test(`${document.href(lang)} is self-canonical with hreflang alternates`, async ({
				page,
			}) => {
				await page.goto(document.href(lang))
				await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
					'href',
					absolute(document.href(lang)),
				)
				const alternates = await page
					.locator('link[rel="alternate"][hreflang]')
					.evaluateAll((links) =>
						links.map((link) => [
							link.getAttribute('hreflang'),
							link.getAttribute('href'),
						]),
					)
				expect(alternates).toEqual([
					...locales.map((locale) => [locale, absolute(document.href(locale))]),
					['x-default', absolute(document.href(locales[0]))],
				])
			})
		}
	}

	// the sitemap index and its sitemaps name absolute URLs on the configured origin; the preview
	// serves them by path
	async function sitemapUrls(page: Page): Promise<Set<string>> {
		const locs = async (path: string) => {
			const response = await page.request.get(path)
			expect(response.status(), path).toBe(200)
			return [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
				([, loc]) => loc!,
			)
		}
		const sitemaps = await locs('/sitemap-index.xml')
		expect(sitemaps.length).toBeGreaterThan(0)
		const urls = new Set<string>()
		for (const sitemap of sitemaps)
			for (const url of await locs(new URL(sitemap).pathname)) urls.add(url)
		return urls
	}

	test('the sitemap lists every listed document in every locale and no draft', async ({
		page,
	}) => {
		const urls = await sitemapUrls(page)
		for (const document of documents)
			for (const lang of locales)
				expect(urls.has(absolute(document.href(lang))), document.href(lang)).toBe(
					!document.unlisted,
				)
		for (const slug of draftCourseSlugs)
			expect([...urls].filter((url) => url.includes(`/${slug}/`))).toEqual([])
	})
})
