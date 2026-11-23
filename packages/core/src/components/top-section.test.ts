import { readFileSync } from 'node:fs'
import path from 'node:path'

import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeAll, describe, expect, it } from 'vitest'

import type { BannerAccent, TopSectionConfig } from '../config/site.ts'
import { CORE_ROOT } from '../core-root.ts'
import type { BannerModel } from '../lib/banner/select.ts'
import { parseManifest } from '../lib/images/manifest.ts'
import { SURFACE_SIZES } from '../lib/portfolio/sizes.ts'
import { resolveSurfaceMedia } from '../lib/portfolio/surface.ts'
import TopSection from './top-section.astro'

const manifest = parseManifest(
	JSON.parse(
		readFileSync(
			path.join(CORE_ROOT, 'src/lib/images/__fixtures__/s9-ladder-manifest.json'),
			'utf8',
		),
	),
)

const media = resolveSurfaceMedia(manifest, 'morning-ridge', 'bannerHero')

const banner = (accent: BannerAccent = 'accent'): BannerModel => ({
	media,
	originBase: 'https://img.example.test',
	alt: 'Morning light over a ridge',
	accent,
})

const baseConfig: TopSectionConfig = {
	parallax: true,
	shadow: true,
	blur: 'off',
	pattern: 'off',
	shade: { mode: 'mono', monoOpacity: 20, tintOpacity: 45 },
	accent: { album: 'accent', section: 'alt' },
	titleReveal: 'slide',
}

const render = (
	config: Partial<TopSectionConfig>,
	title = 'Morning Ridge',
	accent: BannerAccent = 'accent',
) =>
	container.renderToString(TopSection, {
		props: { banner: banner(accent), title, config: { ...baseConfig, ...config } },
	})

let container: AstroContainer
beforeAll(async () => {
	container = await AstroContainer.create()
})

describe('TopSection', () => {
	it('renders the hero picture with the explicit bannerHero sizes (100vw)', async () => {
		const html = await render({})
		expect(html).toContain(SURFACE_SIZES.bannerHero)
		expect(html).toContain('<picture')
		// the hero is the LCP element
		expect(html).toContain('loading="eager"')
		expect(html).toContain('fetchpriority="high"')
	})

	// the input is a BannerModel with a ready alt, so the component knows nothing about PhotoEntry
	it('uses the alt text from the banner model', async () => {
		expect(await render({})).toContain('alt="Morning light over a ridge"')
	})

	// the backdrop holds the dominant color while the image fades in, against flicker
	it('paints the dominant color on the background wrapper', async () => {
		const html = await render({})
		expect(html).toContain(`background-color:${media.dominantColor}`)
	})

	it('splits the H1 into head + accent span with the per-surface accent class', async () => {
		const album = await render({}, 'Morning Ridge', 'accent')
		expect(album).toContain('top-section__accent--accent')
		expect(album).not.toContain('top-section__accent--alt')
		expect(album).toMatch(
			/<h1>\s*Morning<span class="top-section__accent[^"]*"> Ridge<\/span>\s*<\/h1>/,
		)

		const section = await render({}, 'Morning Ridge', 'alt')
		expect(section).toContain('top-section__accent--alt')
		expect(section).not.toContain('top-section__accent--accent')
	})

	// the CSS rule keys on the wrapper modifier, so a wrong or missing class would reveal the title the
	// wrong way
	it('marks the title wrapper with the configured reveal variant', async () => {
		for (const titleReveal of ['slide', 'fade', 'off'] as const) {
			const html = await render({ titleReveal })
			expect(html, titleReveal).toContain(`top-section__title--${titleReveal}`)
			const others = ['slide', 'fade', 'off'].filter((variant) => variant !== titleReveal)
			for (const other of others) {
				expect(html, titleReveal).not.toContain(`top-section__title--${other}`)
			}
		}
	})

	it('maps parallax/shadow flags to legacy classes', async () => {
		expect(await render({ parallax: true, shadow: true })).toContain('top-section--parallax')
		expect(await render({ parallax: true, shadow: true })).toContain('top-section--shadow')
		const off = await render({ parallax: false, shadow: false })
		expect(off).toContain('top-section--no-parallax')
		expect(off).not.toContain('top-section--shadow')
	})

	it('applies blur variants', async () => {
		expect(await render({ blur: 'on' })).toContain('top-section--blur')
		const small = await render({ blur: 'small' })
		expect(small).toContain('top-section--blur-small')
		expect(await render({ blur: 'off' })).not.toContain('top-section--blur')
	})

	it('emits a pattern class per legacy pattern name', async () => {
		for (const pattern of [
			'plain',
			'radial',
			'diagonal',
			'hatch',
			'carbon',
			'weave',
		] as const) {
			const html = await render({ pattern })
			expect(html, pattern).toContain(`top-section--pattern-${pattern}`)
		}
		expect(await render({ pattern: 'off' })).not.toContain('top-section--pattern')
	})

	it('applies the active mode opacity/color inline; off → no-shade', async () => {
		// mono ignores tintOpacity
		const mono = await render({ shade: { mode: 'mono', monoOpacity: 20, tintOpacity: 45 } })
		expect(mono).toContain('opacity:0.2')
		expect(mono).toContain('background-color:var(--color-shade)')

		// tint uses the dominant color, never black
		const tint = await render({ shade: { mode: 'tint', monoOpacity: 20, tintOpacity: 45 } })
		expect(tint).toContain('opacity:0.45')
		expect(tint).toContain(`opacity:0.45;background-color:${media.dominantColor}`)

		const none = await render({ shade: { mode: 'off', monoOpacity: 20, tintOpacity: 45 } })
		expect(none).toContain('top-section--no-shade')
	})
})
