import { existsSync } from 'node:fs'
import path from 'node:path'

import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { SITE_LOCK_PATH } from '../config/lock.ts'
import { siteRoot } from '../config/site-root.ts'
import Base from '../layouts/base.astro'
import { footerPromoContext } from '../lib/portfolio/footer-promo-build.ts'
import SiteHeader from './site-header.astro'
import LogoReplacement from './test-fixtures/logo-replacement.astro'

// runs in the `core-no-brand` project, whose site has no `src/assets/brand/`; the brand-logo test
// of the `core` project renders the same markup with the demo's logos
let container: AstroContainer
beforeAll(async () => {
	container = await AstroContainer.create()
})

// the fixture site replaces no point; a test sets the `logo` replacement through the mocked module
const state = vi.hoisted(() => ({ overrides: {} as Record<string, unknown> }))
vi.mock('virtual:astrum-scena/overrides', () => ({ overrides: state.overrides }))
afterEach(() => {
	delete state.overrides.logo
})

const linkOf = (html: string, className: string): string =>
	new RegExp(`<a[^>]*class="${className}[^"]*"[^>]*>[\\s\\S]*?</a>`).exec(html)?.[0] ?? ''

describe('a site without brand logos', () => {
	it('is rooted at a site without the brand directory', () => {
		expect(existsSync(path.join(siteRoot, SITE_LOCK_PATH))).toBe(true)
		expect(existsSync(path.join(siteRoot, 'src/assets/brand'))).toBe(false)
	})

	it('renders the header with an empty logo slot', async () => {
		const html = await container.renderToString(SiteHeader, { props: { lang: 'en' } })
		expect(html).toContain('site-header')
		expect(html).not.toContain('site-header__logo')
		expect(html).not.toContain('<use')
	})

	it('renders the base layout with a heading and no banner logo', async () => {
		const html = await container.renderToString(Base, {
			props: {
				title: 'Fixture',
				heading: 'Fixture heading',
				footerPromo: footerPromoContext('test:brand-logo'),
			},
		})
		expect(html).toContain('<header class="site-header')
		expect(html).toContain('page-hero__title')
		expect(html).toContain('<h1>')
		expect(html).not.toContain('banner-logo')
		expect(html).not.toContain('<use')
	})

	it('fills the header and banner slots with a logo replacement, without a brand file', async () => {
		state.overrides.logo = LogoReplacement
		const header = linkOf(
			await container.renderToString(SiteHeader, { props: { lang: 'en' } }),
			'site-header__logo',
		)
		expect(header).toContain('data-replacement="logo" data-placement="header"')
		const banner = linkOf(
			await container.renderToString(Base, {
				props: {
					title: 'Fixture',
					heading: 'Fixture heading',
					footerPromo: footerPromoContext('test:brand-logo'),
				},
			}),
			'banner-logo',
		)
		expect(banner).toContain('data-replacement="logo" data-placement="banner"')
		expect(header + banner).not.toContain('<use')
	})
})
