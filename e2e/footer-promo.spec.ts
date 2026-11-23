import { expect, type Page, test } from '@playwright/test'

import { LOCALE_PATH_PREFIX } from '../packages/core/src/config/locale-schema.ts'
import { RIGHTS_PATH } from '../packages/core/src/lib/content/routes.ts'
import { albums, firstDocument, photoIdOfImage } from './content.ts'
import { demoConfig, escapeRegExp, href, locales, otherLocale, referenceLocale } from './helpers.ts'

// the promo shows only what the page has not shown yet; the invariant is checked without knowing the
// algorithm or the corpus: footer photo ids never intersect the ids of every other image on the page.
// With `recentWorks: off` there is no promo and the spec is skipped
test.skip(demoConfig.footer.recentWorks === 'off', 'footer promo is switched off in site.yaml')

const [firstAlbum] = albums
const SECOND_LOCALE = otherLocale(referenceLocale) ?? referenceLocale

// one route per kind of image surface: albums, a photo with related photos, indexes with covers, an
// article with a banner, a course, Contacts and the language-neutral rights page
const ROUTES = [
	...albums.map((album, index) => album.href(locales[index % locales.length]!)),
	firstAlbum!.photos[0]!.href(referenceLocale),
	href(referenceLocale, 'portfolio'),
	href(referenceLocale, 'articles'),
	firstDocument('article').href(referenceLocale),
	href(referenceLocale, 'contacts'),
	href(referenceLocale, 'courses'),
	firstDocument('course').href(SECOND_LOCALE),
	RIGHTS_PATH,
]

async function photoIds(page: Page): Promise<{ footer: string[]; page: string[] }> {
	const images = await page.locator('img').evaluateAll((nodes) =>
		nodes.map((node) => ({
			src: (node as HTMLImageElement).currentSrc || (node as HTMLImageElement).src,
			inFooter: node.closest('.footer-recent') !== null,
		})),
	)
	return {
		footer: images.filter((image) => image.inFooter).map((image) => photoIdOfImage(image.src)),
		page: images.filter((image) => !image.inFooter).map((image) => photoIdOfImage(image.src)),
	}
}

const promoHrefs = (page: Page) =>
	page
		.locator('.footer-recent__link')
		.evaluateAll((links) => links.map((link) => link.getAttribute('href')!))

test.describe('footer promo', () => {
	for (const route of ROUTES) {
		test(`never repeats a photo the page already shows: ${route}`, async ({ page }) => {
			await page.goto(route)
			const ids = await photoIds(page)
			expect(ids.footer.length).toBeGreaterThan(0)
			expect(ids.footer.filter((id) => ids.page.includes(id))).toEqual([])
			expect(new Set(ids.footer).size).toBe(ids.footer.length)
		})
	}

	test('an album page promotes other albums only', async ({ page }) => {
		await page.goto(firstAlbum!.href(referenceLocale))
		const hrefs = await promoHrefs(page)
		expect(hrefs.length).toBeGreaterThan(0)
		const portfolio = escapeRegExp(href(referenceLocale, 'portfolio'))
		for (const link of hrefs) {
			expect(link).toMatch(new RegExp(`^${portfolio}[a-z0-9-]+/[a-z0-9-]+/$`))
			expect(link.startsWith(firstAlbum!.href(referenceLocale))).toBe(false)
		}
	})

	test('every locale of one page shows the same set', async ({ page }) => {
		const setOf = async (route: string) => {
			await page.goto(route)
			return (await promoHrefs(page)).map((link) => link.replace(LOCALE_PATH_PREFIX, ''))
		}
		const sets: string[][] = []
		for (const lang of locales) sets.push(await setOf(firstAlbum!.href(lang)))
		for (const set of sets) expect(set).toEqual(sets[0])
	})

	test('different pages get different sets', async ({ page }) => {
		const sets = new Set<string>()
		for (const route of ROUTES) {
			await page.goto(route)
			// locale prefixes alone would make the sets of routes in different locales differ
			const hrefs = await promoHrefs(page)
			sets.add(
				hrefs
					.map((link) => link.replace(LOCALE_PATH_PREFIX, ''))
					.sort()
					.join(','),
			)
		}
		expect(sets.size).toBeGreaterThan(1)
	})

	test('stays inside the footer and names the section', async ({ page }) => {
		await page.goto(firstDocument('article').href(referenceLocale))
		const section = page.locator('section.footer-recent')
		await expect(section).toHaveAttribute('aria-label', /\S/)
		await section.scrollIntoViewIfNeeded()
		const box = await section.boundingBox()
		const width = page.viewportSize()!.width
		expect(box).not.toBeNull()
		expect(box!.x).toBeGreaterThanOrEqual(0)
		expect(box!.x + box!.width).toBeLessThanOrEqual(width)
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		)
		expect(overflow).toBeLessThanOrEqual(0)
	})
})

test.describe('footer promo without JavaScript', () => {
	test.use({ javaScriptEnabled: false })

	test('renders static links that resolve to photo pages', async ({ page, request }) => {
		await page.goto(href(referenceLocale, 'contacts'))
		const hrefs = await promoHrefs(page)
		expect(hrefs.length).toBeGreaterThan(0)
		for (const link of hrefs) {
			expect((await request.get(link)).status()).toBe(200)
		}
	})
})
