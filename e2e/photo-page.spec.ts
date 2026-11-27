import { expect, type Locator, type Page, test } from '@playwright/test'

import { albums, dimensionChips, tagLabels } from './content.ts'
import { locales } from './helpers.ts'

// the photo page shows the values of the site's dimensions as chips after the tags: the chip text is
// the value's label, its title the dimension's label, its color the theme's --color-dimension-<id>,
// and a dimension's Lucide icon is the chip's first node

const photos = albums.flatMap((album) =>
	album.photos.map((photo) => ({ ...photo, album: album.id })),
)
const withChips = photos.filter((photo) => dimensionChips(photo.data).length > 0)
const withoutChips = photos.filter((photo) => dimensionChips(photo.data).length === 0)
// the meta block of these renders from the chips alone
const chipsOnly = withChips.filter(
	({ data }) => data.tags.length === 0 && !data.placeId && !data.capturedAt,
)

// the computed color a declaration of `value` gets on the page
const colorOf = (page: Page, value: string): Promise<string> =>
	page.evaluate((color) => {
		const probe = document.createElement('span')
		probe.style.color = color
		document.body.append(probe)
		const computed = getComputedStyle(probe).color
		probe.remove()
		return computed
	}, value)

const computedColor = (locator: Locator): Promise<string> =>
	locator.evaluate((element) => getComputedStyle(element).color)

test('the demo covers the chip cases', () => {
	const chips = withChips.flatMap((photo) => dimensionChips(photo.data))
	expect(withoutChips.length).toBeGreaterThan(0)
	expect(chipsOnly.length).toBeGreaterThan(0)
	expect(withChips.some((photo) => dimensionChips(photo.data).length > 1)).toBe(true)
	expect(chips.some((chip) => chip.icon !== undefined)).toBe(true)
	expect(chips.some((chip) => chip.icon === undefined)).toBe(true)
})

test.describe('dimension chips on the photo page', () => {
	for (const photo of withChips) {
		test(`${photo.album}/${photo.id} shows its dimension values after the tags`, async ({
			page,
		}) => {
			const expected = dimensionChips(photo.data)
			for (const lang of locales) {
				await page.goto(photo.href(lang))
				// every tag first, then the chips in the config's order of dimensions
				await expect(page.locator('ul.photo__tags > li')).toHaveText([
					...tagLabels(photo.data, lang),
					...expected.map((chip) => chip.label(lang)),
				])
				const chips = page.locator('ul.photo__tags > li.photo__tag--dimension')
				await expect(chips).toHaveCount(expected.length)
				const tags = page.locator('ul.photo__tags > li:not(.photo__tag--dimension)')
				const tagColor =
					photo.data.tags.length > 0 ? await computedColor(tags.first()) : undefined
				for (const [index, chip] of expected.entries()) {
					const element = chips.nth(index)
					await expect(element).toHaveAttribute('data-dimension', chip.dimension)
					await expect(element).toHaveAttribute('title', chip.title(lang))
					const color = await computedColor(element)
					expect(color).toBe(
						await colorOf(page, `var(--color-dimension-${chip.dimension})`),
					)
					if (tagColor !== undefined) expect(color).not.toBe(tagColor)
					const icon = element.locator('.photo__tag-icon')
					if (chip.icon === undefined) {
						await expect(icon).toHaveCount(0)
						continue
					}
					expect(
						await element.evaluate((node) => {
							// whitespace-only text between the tag and the icon does not render in a flex chip
							const first = [...node.childNodes].find(
								(child) => !(child instanceof Text && child.data.trim() === ''),
							)
							return (
								first instanceof Element &&
								first.classList.contains('photo__tag-icon')
							)
						}),
					).toBe(true)
					const svg = icon.locator('svg')
					await expect(svg).toHaveClass(new RegExp(`\\blucide-${chip.icon}\\b`))
					expect(await computedColor(svg)).toBe(color)
				}
			}
		})
	}

	for (const photo of chipsOnly) {
		test(`${photo.album}/${photo.id} shows its metadata from the chips alone`, async ({
			page,
		}) => {
			for (const lang of locales) {
				await page.goto(photo.href(lang))
				const meta = page.locator('.photo__meta')
				await expect(meta).toBeVisible()
				await expect(meta.locator('.photo__place, .photo__captured')).toHaveCount(0)
				await expect(meta.locator('ul.photo__tags > li')).toHaveText(
					dimensionChips(photo.data).map((chip) => chip.label(lang)),
				)
			}
		})
	}

	test('a photo without dimension values has no dimension chip', async ({ page }) => {
		const [photo] = withoutChips
		for (const lang of locales) {
			await page.goto(photo!.href(lang))
			await expect(page.locator('.photo__tag--dimension')).toHaveCount(0)
		}
	})
})
