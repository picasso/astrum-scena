import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { localizedLabel } from '../config/localized-label.ts'
import { site } from '../config/site.ts'
import Base from '../layouts/base.astro'
import { footerPromoContext } from '../lib/portfolio/footer-promo-build.ts'
import SiteHeader from './site-header.astro'

// the control for brand-logo.no-brand.test.ts: the demo site ships both logos in src/assets/brand and
// replaces the `logo` point (src/overrides/logo.astro). The module is mocked over the real one, so a
// test can render the core's default logo as well as the demo's replacement
const state = vi.hoisted(() => ({ overrides: {} as Record<string, unknown> }))
vi.mock('virtual:astrum-scena/overrides', () => ({ overrides: state.overrides }))

type Overrides = { overrides: Record<string, unknown> }
let demoLogo: unknown
let container: AstroContainer
beforeAll(async () => {
	container = await AstroContainer.create()
	demoLogo = (await vi.importActual<Overrides>('virtual:astrum-scena/overrides')).overrides.logo
})
afterEach(() => {
	delete state.overrides.logo
})

const renderHeader = () => container.renderToString(SiteHeader, { props: { lang: 'en' } })
const renderBase = () =>
	container.renderToString(Base, {
		props: {
			title: 'Fixture',
			heading: 'Fixture heading',
			footerPromo: footerPromoContext('test:brand-logo'),
		},
	})

// the core's link of a slot, from its opening tag to its end
const linkOf = (html: string, className: string): string =>
	new RegExp(`<a[^>]*class="${className}[^"]*"[^>]*>[\\s\\S]*?</a>`).exec(html)?.[0] ?? ''

const title = localizedLabel(site.identity.title, 'en')

describe('a site with brand logos', () => {
	it('renders the menu logo in the header slot', async () => {
		const link = linkOf(await renderHeader(), 'site-header__logo')
		expect(link).toMatch(/<use href="[^"]*menu-logo[^"]*#menu-photography"/)
	})

	it('renders the brand logo in the banner of a page with a heading', async () => {
		const link = linkOf(await renderBase(), 'banner-logo')
		expect(link).toMatch(/<use href="[^"]*brand-logo[^"]*#brand-outline"/)
	})
})

describe("the demo's logo replacement", () => {
	it('is served from src/overrides/logo.astro of the site', () => {
		expect(demoLogo).toBeTypeOf('function')
	})

	it("draws the site's mark inside the core's header link, without the SVG logo", async () => {
		state.overrides.logo = demoLogo
		const link = linkOf(await renderHeader(), 'site-header__logo')
		expect(link).toContain(`href="/en/"`)
		expect(link).toContain(`aria-label="${title}"`)
		expect(link).toContain('data-placement="header"')
		expect(link).toContain(title)
		expect(link).not.toContain('<use')
	})

	it("draws the site's mark inside the core's banner link", async () => {
		state.overrides.logo = demoLogo
		const link = linkOf(await renderBase(), 'banner-logo')
		expect(link).toContain(`aria-label="${title}"`)
		expect(link).toContain('data-placement="banner"')
		expect(link).not.toContain('<use')
	})
})
