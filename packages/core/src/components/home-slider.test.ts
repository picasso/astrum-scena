import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { site } from '../config/site.ts'
import HomePage from '../pages/[locale]/index.astro'

// the slider itself needs an active image release, which the demo does not have yet; the stub stands
// in for it so the test sees only which branch the home page takes
vi.mock('../lib/featured.ts', () => ({ loadFeaturedHome: async () => ({ slides: [] }) }))
vi.mock('./hero-slider.astro', async () => ({
	default: (await import('./test-fixtures/hero-slider-stub.astro')).default,
}))

let container: AstroContainer
beforeAll(async () => {
	container = await AstroContainer.create()
})

describe('the home page of a site with featured slides', () => {
	it.each(site.content.locales)('shows the slider and no fallback in %s', async (locale) => {
		const html = await container.renderToString(HomePage, {
			props: { locale },
			request: new Request(`${site.origin}/${locale}/`),
			locals: {},
		})
		expect(html).toContain('data-hero-slider-stub')
		expect(html).not.toContain('home-fallback')
	})
})
