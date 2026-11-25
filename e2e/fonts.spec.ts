import { expect, type Page, test } from '@playwright/test'

import {
	type LocaleScript,
	SERVICE_COPY_LOCALE,
} from '../packages/core/src/config/locale-schema.ts'
import { RIGHTS_PATH } from '../packages/core/src/lib/content/routes.ts'
import { fontPreloads, localeScript } from '../packages/core/src/theme/fonts.ts'
import { demoConfig, escapeRegExp, href, type Lang, locales, openMenu } from './helpers.ts'

const { catalog } = demoConfig.content

// the files of a script's family share the prefix of its preloads (`<prefix>-<face>.woff2`), so the
// core's own preload list names both families without a copy of the file names here
function familyFile(script: LocaleScript): RegExp {
	const prefix = fontPreloads(script)[0]!.replace(/-[^-/]+\.woff2$/, '-')
	return new RegExp(`${escapeRegExp(prefix)}[^/]+\\.woff2$`)
}
const LATIN_SUBSET = familyFile('latin')
const FULL_FILE = familyFile('cyrillic')
// the font-family names theme.css gives the two families
const FAMILY: Record<LocaleScript, string> = { latin: 'Ubuntu', cyrillic: 'Ubuntu Full' }

type FontTraffic = { urls: string[]; failures: string[] }

// every /fonts/ request the page makes from now on, and every one that did not answer OK: a 404
// would otherwise pass, since the preload alone produces the request
function collectFontRequests(page: Page): FontTraffic {
	const traffic: FontTraffic = { urls: [], failures: [] }
	const isFont = (url: string) => url.includes('/fonts/')
	page.on('request', (request) => {
		if (isFont(request.url())) traffic.urls.push(request.url())
	})
	page.on('response', (response) => {
		if (isFont(response.url()) && !response.ok()) {
			traffic.failures.push(`${response.status()} ${response.url()}`)
		}
	})
	page.on('requestfailed', (request) => {
		if (isFont(request.url())) traffic.failures.push(`failed ${request.url()}`)
	})
	return traffic
}

// the first family of an element's computed font stack
function firstFamily(page: Page, selector: string): Promise<string> {
	return page
		.locator(selector)
		.evaluate((element) =>
			getComputedStyle(element).fontFamily.split(',')[0]!.trim().replace(/["']/g, ''),
		)
}

async function settleFonts(page: Page): Promise<void> {
	await page.evaluate(() => document.fonts.ready)
	await page.waitForLoadState('networkidle')
}

// a face counts only once the browser has actually loaded it for text on the page
function hasLoadedFace(page: Page, family: string): Promise<boolean> {
	return page.evaluate(
		(name) =>
			[...document.fonts].some(
				(face) => face.family.replace(/["']/g, '') === name && face.status === 'loaded',
			),
		family,
	)
}

// the closed menu panel takes part in layout, and opening it reveals the language links, so the
// requests are counted after the menu has been open as well
async function loadHomeWithMenu(page: Page, lang: Lang): Promise<FontTraffic> {
	const traffic = collectFontRequests(page)
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto(href(lang, ''), { waitUntil: 'load' })
	await settleFonts(page)
	await openMenu(page)
	await settleFonts(page)
	return traffic
}

for (const lang of locales) {
	if (localeScript(catalog, lang) === 'latin') {
		test(`a ${lang} page requests only the latin subset`, async ({ page }) => {
			const { urls, failures } = await loadHomeWithMenu(page, lang)
			expect(failures).toEqual([])
			await expect(page.locator('html')).toHaveAttribute('data-script', 'latin')
			expect(urls.length).toBeGreaterThan(0)
			expect(urls.filter((url) => !LATIN_SUBSET.test(url))).toEqual([])
			expect(await hasLoadedFace(page, FAMILY.latin)).toBe(true)
		})
	} else {
		test(`a ${lang} page renders with the full files and never requests the latin subset`, async ({
			page,
		}) => {
			const { urls, failures } = await loadHomeWithMenu(page, lang)
			expect(failures).toEqual([])
			await expect(page.locator('html')).toHaveAttribute(
				'data-script',
				localeScript(catalog, lang),
			)
			expect(urls.some((url) => FULL_FILE.test(url))).toBe(true)
			expect(urls.filter((url) => LATIN_SUBSET.test(url))).toEqual([])
			expect(await hasLoadedFace(page, FAMILY.cyrillic)).toBe(true)
		})
	}
}

// the rights page is in the service locale and has a section per active locale: a section in a
// cyrillic-script locale switches to the full family, so its punctuation comes from the same file
// as its letters
test('a cyrillic-script section on the rights page renders with the full file', async ({
	page,
}) => {
	const cyrillic = locales.find((lang) => localeScript(catalog, lang) === 'cyrillic')
	const latin = locales.find((lang) => localeScript(catalog, lang) === 'latin')
	test.skip(!cyrillic || !latin, 'needs a latin-script and a cyrillic-script locale')
	const { urls, failures } = collectFontRequests(page)
	await page.goto(RIGHTS_PATH, { waitUntil: 'load' })
	await settleFonts(page)
	await expect(page.locator('html')).toHaveAttribute(
		'data-script',
		localeScript(catalog, SERVICE_COPY_LOCALE),
	)
	await expect(page.locator(`section[lang="${cyrillic}"]`)).toBeVisible()
	expect(await firstFamily(page, `section[lang="${cyrillic}"]`)).toBe(FAMILY.cyrillic)
	expect(await firstFamily(page, `section[lang="${latin}"]`)).toBe(FAMILY.latin)
	expect(failures).toEqual([])
	expect(urls.some((url) => FULL_FILE.test(url))).toBe(true)
	expect(await hasLoadedFace(page, FAMILY.cyrillic)).toBe(true)
})

// the eager, high-priority image is the first slide (Swiper loop may reorder slides in the DOM)
test('the hero LCP image has no decoding hint, the other slides decode async', async ({ page }) => {
	await page.goto(href(locales[0], ''))
	const images = page.locator('.hero-media img')
	const lcp = images.and(page.locator('[fetchpriority="high"]'))
	await expect(lcp).toHaveCount(1)
	await expect(lcp).toHaveAttribute('loading', 'eager')
	expect(await lcp.getAttribute('decoding')).toBeNull()

	const rest = images.and(page.locator(':not([fetchpriority="high"])'))
	const count = await rest.count()
	expect(count).toBeGreaterThan(0)
	for (let index = 0; index < count; index += 1) {
		await expect(rest.nth(index)).toHaveAttribute('decoding', 'async')
	}
})
