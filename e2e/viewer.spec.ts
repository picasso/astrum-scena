import { expect, type Page, test } from '@playwright/test'

import { albums, imagePublicConfig, photoById, viewerCaption } from './content.ts'
import { demoConfig, type Lang, locales } from './helpers.ts'
import { caption, viewerShowsImageOf } from './viewer.ts'

// the PhotoSwipe viewer of the demo albums in the production build of the packed core: it opens from
// the album grid, pages through the album in grid order, closes, and shows images served from the
// site's image base

const { viewer } = demoConfig

test.beforeEach(async ({ page }) => {
	// reduced motion makes PhotoSwipe open and close instantly, which keeps viewer interactions
	// deterministic (PhotoSwipe ignores close() during the open animation)
	await page.emulateMedia({ reducedMotion: 'reduce' })
})

// the grid's photo ids in DOM order, which is the viewer's slide order
async function gridPhotoIds(page: Page, album: (typeof albums)[number], lang: Lang) {
	const hrefs = await page
		.locator('a.album-photo')
		.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))
	return hrefs.map((link) => {
		const photo = album.photos.find((entry) => entry.href(lang) === link)
		if (!photo) throw new Error(`${link} is not a photo of the album ${album.id}`)
		return photo.id
	})
}

for (const album of albums) {
	for (const lang of locales) {
		test(`opens, pages and closes on ${album.href(lang)}`, async ({ page }) => {
			await page.goto(album.href(lang))
			const ids = await gridPhotoIds(page, album, lang)
			expect(new Set(ids)).toEqual(new Set(album.photos.map((photo) => photo.id)))
			expect(ids).toHaveLength(album.photos.length)
			expect(ids.length).toBeGreaterThan(1)
			const trigger = page.locator('a.album-photo').first()
			await trigger.click()

			const pswp = page.locator('.pswp')
			await expect(pswp).toHaveClass(/pswp--ui-visible/)
			// the PhotoSwipe chunk loads before the core's on album pages, so only layer order keeps
			// the theme background
			const [background, surface] = await pswp.locator('.pswp__bg').evaluate((bg) => {
				const probe = document.createElement('div')
				probe.style.backgroundColor = 'var(--color-surface-fixed)'
				document.body.append(probe)
				const colors = [
					getComputedStyle(bg).backgroundColor,
					getComputedStyle(probe).backgroundColor,
				]
				probe.remove()
				return colors
			})
			expect(background).toBe(surface)

			const [first, second] = ids
			await expect(caption(page)).toHaveText(viewerCaption(photoById(first!), lang))
			await expect.poll(() => viewerShowsImageOf(page, first!)).toBe(true)
			if (viewer.copyright === 'on')
				await expect(pswp.locator('.pswp__caption .copyright')).toContainText(
					imagePublicConfig.copyright,
				)
			const moreInfo = pswp.locator('a.pswp__image-link')
			if (viewer.moreInfo === 'on')
				await expect(moreInfo).toHaveAttribute(
					'href',
					(await trigger.getAttribute('href'))!,
				)

			await page.locator('.pswp__button--arrow--next').click()
			await expect(caption(page)).toHaveText(viewerCaption(photoById(second!), lang))
			await expect.poll(() => viewerShowsImageOf(page, second!)).toBe(true)
			if (viewer.moreInfo === 'on')
				await expect(moreInfo).toHaveAttribute(
					'href',
					album.photos.find((photo) => photo.id === second)!.href(lang),
				)

			await page.keyboard.press('Escape')
			await expect(page.locator('.pswp')).toHaveCount(0)
			await expect(trigger).toBeFocused()
		})
	}
}
