import { expect, type Locator, type Page, test } from '@playwright/test'

import { type Theme, THEME_STORAGE_KEY } from '../packages/core/src/lib/theme.ts'
import { albums, blocksPage, firstDocument, photoById, viewerCaption } from './content.ts'
import { href, referenceLocale, viewportWidth } from './helpers.ts'
import { caption, viewerShowsImageOf } from './viewer.ts'

// visual baselines of the core surfaces on the demo. Rasterization differs per OS and per installed
// browser build, so they are rendered and compared only in the pinned Playwright image
// (`pnpm test:e2e:docker`, `pnpm test:e2e:docker:update`) and in CI's `e2e` job, which runs in that
// image and only compares; the image is recognized by its browsers path
const IN_PLAYWRIGHT_IMAGE = process.env.PLAYWRIGHT_BROWSERS_PATH === '/ms-playwright'

const VISUAL_WIDTHS = [375, 1440, 1920]
const THEMES: Theme[] = ['dark', 'light']

const [album] = albums
// the core links the privacy page by this slug (site footer, contacts form)
const privacy = firstDocument('page', (document) => document.slug === 'privacy')

// pages whose look is pinned in both themes, full page; every album, since each demo album shows
// another grid layout
const THEMED_PAGES = [
	...albums.map((entry) => ({ name: `album-${entry.id}`, path: entry.href(referenceLocale) })),
	{ name: 'article', path: firstDocument('article').href(referenceLocale) },
	{ name: 'privacy', path: privacy.href(referenceLocale) },
]

test.beforeEach(async ({ page }) => {
	test.skip(
		!IN_PLAYWRIGHT_IMAGE,
		'visual baselines live only in the pinned Playwright image: run pnpm test:e2e:docker (or :update to rewrite them)',
	)
	test.skip(
		!VISUAL_WIDTHS.includes(viewportWidth()),
		`visual baselines are captured only at ${VISUAL_WIDTHS.join(' / ')}`,
	)
	await page.emulateMedia({ reducedMotion: 'reduce' })
})

// stored before the first script runs, so the no-flash script of the shell paints the page in it
async function useTheme(page: Page, theme: Theme): Promise<void> {
	await page.addInitScript(
		([key, value]) => {
			try {
				localStorage.setItem(key, value)
			} catch {
				// no storage: the assertion on data-theme below reports it
			}
		},
		[THEME_STORAGE_KEY, theme] as const,
	)
}

// fonts loaded and every image (lazy ones included) decoded, so the capture never catches a fallback
// face or an image mid-load
async function settle(page: Page): Promise<void> {
	await page.waitForLoadState('networkidle')
	await page.evaluate(async () => {
		await document.fonts.ready
		const images = Array.from(document.images)
		for (const image of images) image.loading = 'eager'
		await Promise.all(images.map((image) => image.decode().catch(() => null)))
	})
	await page.waitForLoadState('networkidle')
}

// the copyright year is the build year, so it is masked to keep the baselines from going stale
const copyright = (page: Page): Locator[] => [
	page.locator('.fs-copyright'),
	page.locator('.site-footer__copyright'),
]

// the home page is always dark (fullscreen.astro passes forceDark), so it has no light baseline
test('home (dark)', async ({ page }) => {
	await page.goto(href(referenceLocale, ''))
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
	await page.locator('.swiper-slide-active').waitFor()
	await settle(page)
	await expect(page).toHaveScreenshot('home-dark.png', { mask: copyright(page) })
})

for (const surface of THEMED_PAGES) {
	for (const theme of THEMES) {
		test(`${surface.name} (${theme})`, async ({ page }) => {
			await useTheme(page, theme)
			await page.goto(surface.path)
			await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
			await settle(page)
			await expect(page).toHaveScreenshot(`${surface.name}-${theme}.png`, {
				fullPage: true,
				mask: copyright(page),
			})
		})
	}
}

// the viewer paints its own fixed surface over the page, so the site's default theme is enough
test('open viewer', async ({ page }) => {
	await page.goto(album!.href(referenceLocale))
	await settle(page)
	const trigger = page.locator('a.album-photo').first()
	const firstHref = await trigger.getAttribute('href')
	const photo = album!.photos.find((entry) => entry.href(referenceLocale) === firstHref)
	if (!photo) throw new Error(`${firstHref} is not a photo of the album ${album!.id}`)
	await trigger.click()

	await expect(page.locator('.pswp')).toHaveClass(/pswp--ui-visible/)
	await expect(caption(page)).toHaveText(viewerCaption(photoById(photo.id), referenceLocale))
	await expect.poll(() => viewerShowsImageOf(page, photo.id)).toBe(true)
	await settle(page)
	await expect(page).toHaveScreenshot('viewer.png')
})

// the static Gallery layouts of the blocks page in the site's default theme; the dynamic Gallery is
// left out on purpose: its selection changes between loads by contract, so gallery.spec.ts covers it.
// The band spans the viewport width, since the `outside` Gallery breaks out of the section's prose
// box, and is cut from the full page, where the sticky header stays at the top and covers nothing
test('blocks galleries', async ({ page }) => {
	await page.goto(blocksPage.href(referenceLocale))
	await settle(page)
	const band = await page.getByTestId('gallery-static').evaluate((node) => {
		const box = node.getBoundingClientRect()
		return { y: box.top + window.scrollY, height: box.height }
	})
	await expect(page).toHaveScreenshot('blocks-galleries.png', {
		fullPage: true,
		clip: { x: 0, y: band.y, width: page.viewportSize()!.width, height: band.height },
	})
})
