import { expect, type Locator, type Page, test } from '@playwright/test'

import { LOCALE_CATALOG } from '../packages/core/src/config/locale-schema.ts'
import { articlesIndexHref } from '../packages/core/src/lib/content/routes.ts'
import { coursesIndexHref } from '../packages/core/src/modules/courses/routes.ts'
import { documents, draftCourseSlugs, firstDocument } from './content.ts'
import {
	demoConfig,
	endsWith,
	horizontalOverflow,
	href,
	locales,
	navRoutes,
	otherLocale,
	referenceLocale,
	switchLanguageVia,
	t,
	textFor,
	viewportWidth,
} from './helpers.ts'

const ARTICLE = firstDocument('article')
const ARCHIVED_COURSE = firstDocument('course', (course) => course.courseStatus === 'archive')
const CURRENT_COURSE = firstDocument('course', (course) => course.courseStatus === 'current')
const SECOND_LOCALE = otherLocale(referenceLocale)

const CYRILLIC = /\p{Script=Cyrillic}/u

// draft courses get no route, so their slugs must not appear in any link
const draftLinks = (page: Page) =>
	page.locator(draftCourseSlugs.map((slug) => `a[href$="/${slug}/"]`).join(', '))

test('the demo has a draft course to keep out of the routes', () => {
	expect(draftCourseSlugs.length).toBeGreaterThan(0)
})

test.describe('articles index and detail', () => {
	test('index links the published article and omits the draft course', async ({ page }) => {
		for (const lang of locales) {
			await page.goto(articlesIndexHref(lang))
			await expect(page.locator(`a[href$="${ARTICLE.href(lang)}"]`).first()).toBeVisible()
			await expect(draftLinks(page)).toHaveCount(0)
		}
	})

	test('a published article detail renders in every locale with one H1', async ({ page }) => {
		for (const lang of locales) {
			await page.goto(ARTICLE.href(lang))
			await expect(page.locator('html')).toHaveAttribute('lang', lang)
			await expect(page.locator('h1')).toHaveCount(1)
			await expect(page.locator('h1')).toBeVisible()
		}
	})

	test('language switch keeps the article slug', async ({ page }) => {
		test.skip(!SECOND_LOCALE, 'a one-locale site has no language switcher')
		await page.goto(ARTICLE.href(referenceLocale))
		await switchLanguageVia(page, referenceLocale, SECOND_LOCALE!)
		await expect(page).toHaveURL(endsWith(ARTICLE.href(SECOND_LOCALE!)))
		await expect(page.locator('html')).toHaveAttribute('lang', SECOND_LOCALE!)
	})
})

test.describe('courses section', () => {
	test('index links the archived and the current course and omits the draft', async ({
		page,
	}) => {
		for (const lang of locales) {
			await page.goto(coursesIndexHref(lang))
			await expect(page.locator('h1')).toHaveCount(1)
			for (const course of [ARCHIVED_COURSE, CURRENT_COURSE])
				await expect(page.locator(`a[href$="${course.href(lang)}"]`).first()).toBeVisible()
			await expect(draftLinks(page)).toHaveCount(0)
		}
	})

	test('course detail pages show the status badge of the course', async ({ page }) => {
		for (const course of [ARCHIVED_COURSE, CURRENT_COURSE]) {
			for (const lang of locales) {
				await page.goto(course.href(lang))
				await expect(page.locator('h1')).toHaveCount(1)
				await expect(page.locator('main .course-badge--page')).toHaveText(
					t(lang)(`courses.status.${course.courseStatus!}`),
				)
			}
		}
	})

	test('language switch keeps the course slug', async ({ page }) => {
		test.skip(!SECOND_LOCALE, 'a one-locale site has no language switcher')
		await page.goto(ARCHIVED_COURSE.href(referenceLocale))
		await switchLanguageVia(page, referenceLocale, SECOND_LOCALE!)
		await expect(page).toHaveURL(endsWith(ARCHIVED_COURSE.href(SECOND_LOCALE!)))
	})
})

// any Cyrillic on a page of a latin-script locale means a fallback to another locale or an
// untranslated body
test.describe('no untranslated public entry', () => {
	const latinLocales = locales.filter((lang) => LOCALE_CATALOG[lang].script === 'latin')
	for (const lang of latinLocales) {
		for (const document of documents) {
			test(`${document.href(lang)} has no Cyrillic in its main content`, async ({ page }) => {
				await page.goto(document.href(lang))
				expect(await page.locator('main').innerText()).not.toMatch(CYRILLIC)
			})
		}
	}
})

test('draft and unknown documents have no route (404 in the built site)', async ({ request }) => {
	for (const lang of locales) {
		for (const slug of draftCourseSlugs)
			expect((await request.get(href(lang, `courses/${slug}`))).status()).toBe(404)
		// no silent fallback for unknown slugs
		expect((await request.get(href(lang, 'articles/no-such-article'))).status()).toBe(404)
		expect((await request.get(href(lang, 'courses/no-such-course'))).status()).toBe(404)
	}
})

// the 1024–1280px range has no Playwright project of its own, so this test resizes the viewport
// itself and runs once, on desktop-1440, instead of following the project width
test.describe('desktop top-menu legacy density', () => {
	const roundPx = (value: string): number => Math.round(Number.parseFloat(value))

	const fontPx = (loc: Locator) =>
		loc.evaluate((el) => getComputedStyle(el).fontSize).then(roundPx)

	const padX = (loc: Locator) =>
		loc.evaluate((el) => {
			const style = getComputedStyle(el)
			return { left: style.paddingLeft, right: style.paddingRight }
		})

	test('applies 14px/5px at 1100px and 17px/10px at 1440px without overflow', async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'desktop-1440',
			'range test drives its own viewport; run it once on desktop-1440',
		)
		test.skip(navRoutes.length < 3, 'the edge trim needs at least three menu items')
		await page.goto(href(referenceLocale, 'portfolio'))
		const nav = page.getByRole('navigation', { name: 'Primary' })
		// items come from navRoutes so a menu edit does not break the density contract; the trim
		// applies only to the edge items
		const link = (index: number) =>
			nav.getByRole('link', {
				name: textFor(navRoutes[index]!.labels, referenceLocale),
				exact: true,
			})
		const first = link(0)
		const middle = link(1)
		const last = link(navRoutes.length - 1)

		await page.setViewportSize({ width: 1100, height: 900 })
		await expect(middle).toBeVisible()
		expect(await fontPx(middle)).toBe(14)
		expect(await padX(middle)).toEqual({ left: '5px', right: '5px' })
		expect((await padX(first)).left).toBe('0px')
		expect((await padX(last)).right).toBe('0px')
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)

		await page.setViewportSize({ width: 1440, height: 900 })
		expect(await fontPx(middle)).toBe(17)
		expect(await padX(middle)).toEqual({ left: '10px', right: '10px' })
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
	})
})

// the production CSS minifier once merged `animation-timeline` into the `animation` shorthand, where
// it is reset-only, so Chrome dropped the whole declaration; dev has no minification and hid it. The
// article has a banner, so its top section can parallax
test.describe('scroll-driven animations survive the production build', () => {
	const LOGO = '.scroll-fade-logo'
	const PARALLAX_BG = '.top-section--parallax .top-section__bg'
	const { parallax } = demoConfig.topSection

	const animation = (page: Page, selector: string) =>
		page
			.locator(selector)
			.first()
			.evaluate((el) => {
				const style = getComputedStyle(el)
				return { name: style.animationName, timeline: style.animationTimeline }
			})

	test('logo fades at every width, the top section parallaxes from 768px', async ({ page }) => {
		await page.goto(ARTICLE.href(referenceLocale))
		expect(await animation(page, LOGO)).toEqual({
			name: 'scroll-fade-out',
			timeline: 'scroll(root)',
		})
		if (!parallax) return
		const bg = await animation(page, PARALLAX_BG)
		if (viewportWidth() >= 768) {
			expect(bg).toEqual({ name: 'top-section-parallax', timeline: '--top-section-view' })
		} else {
			expect(bg.name).toBe('none')
		}
	})

	test('reduced motion disables both', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' })
		await page.goto(ARTICLE.href(referenceLocale))
		expect((await animation(page, LOGO)).name).toBe('none')
		if (parallax) expect((await animation(page, PARALLAX_BG)).name).toBe('none')
	})
})

test.describe('inner pages have no horizontal overflow', () => {
	for (const { segment } of navRoutes.filter((route) => route.segment)) {
		// the width is read inside the test: test.info() exists only while a test runs
		test(segment, async ({ page }) => {
			await page.goto(href(referenceLocale, segment))
			await expect(page.locator('h1').first()).toBeVisible()
			expect(
				await horizontalOverflow(page),
				`no horizontal overflow on /${segment}/ at ${viewportWidth()}px`,
			).toBeLessThanOrEqual(1)
		})
	}
})
