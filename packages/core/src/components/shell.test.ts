import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { SSRManifest } from 'astro'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import type { z } from 'astro/zod'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSiteConfig, contentConfig } from '../config/fixtures/site-config.ts'
import { DEFAULT_LOCALE_CATALOG, type Locale } from '../config/locale-schema.ts'
import type { seoSchema } from '../config/seo-schema.ts'
import { siteRoot } from '../config/site-root.ts'
import { defaultLocale, type SiteConfig } from '../config/site-schema.ts'
import { readYaml } from '../config/yaml-file.ts'
import { CORE_ROOT } from '../core-root.ts'
import { CORE_DICTIONARIES } from '../i18n/dictionaries.ts'
import { siteDictionaryPath } from '../i18n/site-dictionary-path.ts'
import { languageName, useTranslations } from '../i18n/ui.ts'
import Base from '../layouts/base.astro'
import Fullscreen from '../layouts/fullscreen.astro'
import HtmlShell from '../layouts/html-shell.astro'
import type { BannerModel } from '../lib/banner/select.ts'
import { parseManifest } from '../lib/images/manifest.ts'
import { IMAGES_PUBLIC_RELATIVE_PATH } from '../lib/images/public-config.ts'
import { footerPromoContext } from '../lib/portfolio/footer-promo-build.ts'
import { resolveSurfaceMedia } from '../lib/portfolio/surface.ts'
import { fontPreloads, localeScript } from '../theme/fonts.ts'
import FooterCurve from './footer-curve.astro'
import LanguageSwitcher from './language-switcher.astro'
import SiteFooter from './site-footer.astro'
import SiteHeader from './site-header.astro'

// components read the config singletons; every case renders under a test-built config instead, set
// fresh before each case, so neither the demo's yaml nor a mutated singleton reaches a render
const config = vi.hoisted(() => ({
	site: undefined as unknown as SiteConfig,
	seo: undefined as unknown as z.infer<typeof seoSchema>,
}))
vi.mock('../config/site.ts', async () => ({
	...(await import('../config/site-schema.ts')),
	get site() {
		return config.site
	},
}))
// a case whose config cannot match the demo's own files renders from a site root of its own
const root = vi.hoisted(() => ({ override: undefined as string | undefined }))
vi.mock('../config/site-root.ts', async (importOriginal) => {
	const { siteRoot } = await importOriginal<typeof import('../config/site-root.ts')>()
	return {
		get siteRoot() {
			return root.override ?? siteRoot
		},
	}
})
vi.mock('../config/seo.ts', async () => ({
	...(await import('../config/seo-schema.ts')),
	get seo() {
		return config.seo
	},
}))
beforeEach(() => {
	config.site = buildSiteConfig()
	config.seo = {
		description: { en: 'English default', ru: 'Русское описание' },
	}
})

const manifest = parseManifest(
	JSON.parse(
		readFileSync(
			path.join(CORE_ROOT, 'src/lib/images/__fixtures__/s9-ladder-manifest.json'),
			'utf8',
		),
	),
)

const banner: BannerModel = {
	media: resolveSurfaceMedia(manifest, 'morning-ridge', 'bannerHero'),
	originBase: 'https://img.example.test',
	alt: 'Morning light over a ridge',
	accent: 'accent',
}

// a demo album, so the nested route is one the demo site really has
const NESTED_ROUTE = '/en/portfolio/coastal-light/'

let container: AstroContainer
beforeAll(async () => {
	// no React renderer: a React island in the shell (the menu once was one) fails the render
	container = await AstroContainer.create()
})

describe('FooterCurve', () => {
	it('renders the legacy SVG with viewBox 0 0 100 H and the shape path', async () => {
		const html = await container.renderToString(FooterCurve, {
			props: { shape: 'upright', height: 80 },
		})
		expect(html).toContain('viewBox="0 0 100 80"')
		expect(html).toContain('M0 80 C 50 0 80 -26 100 80 Z')
		expect(html).toContain('preserveAspectRatio="none"')
		expect(html).toContain('aria-hidden="true"')
		expect(html).not.toContain('footer-curve--inverse')
	})

	it('adds the inverse modifier only for legacy inverse shapes', async () => {
		const down = await container.renderToString(FooterCurve, {
			props: { shape: 'downleft', height: 100 },
		})
		expect(down).toContain('footer-curve--inverse')
		expect(down).toContain('viewBox="0 0 100 100"')
	})
})

describe('LanguageSwitcher', () => {
	afterEach(() => {
		if (root.override) rmSync(root.override, { force: true, recursive: true })
		root.override = undefined
	})

	const renderWithLocales = async (locales: SiteConfig['content']['locales']) => {
		config.site = buildSiteConfig({ content: contentConfig(locales, locales[0]!) })
		return container.renderToString(LanguageSwitcher, { props: { lang: locales[0]! } })
	}

	it('links to the other locale on a two-locale site', async () => {
		expect(await renderWithLocales(['en', 'ru'])).toContain('hreflang="ru"')
	})

	it('renders nothing on a one-locale site', async () => {
		// the demo's dictionaries name both its locales, which a one-locale config rejects
		root.override = mkdtempSync(path.join(tmpdir(), 'one-locale-site-'))
		expect(await renderWithLocales(['ru'])).not.toContain('lang-switch')
	})
})

describe('SiteHeader on a language-neutral route', () => {
	// only the desktop top-menu (`.site-nav`) is checked, not the overlay locale links
	const renderWithMenuLang = async (lang: SiteConfig['menu']['lang'], localeNeutral = false) => {
		config.site.menu = { ...config.site.menu, lang }
		return container.renderToString(SiteHeader, { props: { lang: 'en', localeNeutral } })
	}
	const label = (text: string) => new RegExp(`lang-switch[\\s\\S]*</span>\\s*${text}\\s*<`)

	it('renders the language switcher in the configured menu mode', async () => {
		// an English page names the other language in English
		expect(await renderWithMenuLang('full')).toMatch(label(languageName('en', 'ru')))
		expect(await renderWithMenuLang('code')).toMatch(label('RU'))
		expect(await renderWithMenuLang('off')).not.toContain('lang-switch')
	})

	it('keeps menu.lang independent from footer.lang', async () => {
		config.site.footer = { ...config.site.footer, lang: 'off' }
		expect(await renderWithMenuLang('code')).toContain('lang-switch')
	})

	// `/rights/` exists once: a link to the Russian version would lead to a missing /ru/rights/
	it('omits the language switcher and the overlay locale links', async () => {
		const html = await container.renderToString(SiteHeader, {
			props: { lang: 'en', localeNeutral: true },
		})
		expect(html).not.toContain('lang-switch')
		expect(html).not.toContain('hreflang="ru"')
	})
})

// nested-route cases pass a request, otherwise Astro.url.pathname never reaches the nested state
describe('SiteHeader desktop top-menu', () => {
	const renderHeader = (pathname: string) =>
		container.renderToString(SiteHeader, {
			props: { lang: 'en' },
			request: new Request(`https://site.test${pathname}`),
		})

	const portfolioAnchor = (html: string): string => {
		const match = html.match(/<a[^>]*href="\/en\/portfolio\/"[^>]*>/)
		if (!match) throw new Error('portfolio top-menu link not found')
		return match[0]
	}

	it('renders a semantic list of top-menu links', async () => {
		const html = await renderHeader('/en/portfolio/')
		expect(html).toContain('aria-label="Primary"')
		expect(html).toContain('class="top-menu"')
		expect(html).toContain('top-menu-link')
	})

	it('marks the current section and aria-current on an exact section URL', async () => {
		const anchor = portfolioAnchor(await renderHeader('/en/portfolio/'))
		expect(anchor).toContain('data-current-section')
		expect(anchor).toContain('aria-current="page"')
	})

	it('marks visual ancestor state on a nested route but not aria-current', async () => {
		const anchor = portfolioAnchor(await renderHeader(NESTED_ROUTE))
		expect(anchor).toContain('data-current-section')
		expect(anchor).not.toContain('aria-current')
	})

	// the overlay keeps its own exact-only current, so the desktop-only ancestor state must not leak
	// aria-current into either
	it('keeps aria-current exact-only across nav and overlay on a nested route', async () => {
		const html = await renderHeader(NESTED_ROUTE)
		expect(html).not.toContain('aria-current="page"')
		expect(html).toContain('data-current-section')
	})

	it('applies the configured animation modifier to the desktop nav only', async () => {
		config.site.menu = { ...config.site.menu, animate: 'word-slide-in' }
		const html = await renderHeader('/en/portfolio/')
		expect(html).toContain('anim-links')
		expect(html).toContain('anim-word-slide-in')
		config.site.menu = { ...config.site.menu, animate: 'off' }
		expect(await renderHeader('/en/portfolio/')).not.toContain('anim-links')
	})
})

// layouts take the origin from the config; rendering under a substituted one proves no domain is hardcoded
const OTHER_ORIGIN = 'https://other.test'

describe('HtmlShell metadata API', () => {
	const slots = { default: '<p>content</p>' }

	it('renders localized SEO and social metadata with the correct card variant', async () => {
		config.site.origin = OTHER_ORIGIN
		const plain = await container.renderToString(HtmlShell, {
			props: { lang: 'ru', title: 'Страница' },
			slots,
			request: new Request('https://site.test/ru/about/'),
		})
		expect(plain).toContain('<meta name="description" content="Русское описание">')
		expect(plain).toContain('<meta property="og:title"')
		expect(plain).toContain('<meta property="og:description" content="Русское описание">')
		expect(plain).toContain(`<meta property="og:url" content="${OTHER_ORIGIN}/ru/about/">`)
		expect(plain).toContain('<meta property="og:locale" content="ru_RU">')
		expect(plain).toContain('<meta name="twitter:card" content="summary">')
		expect(plain).not.toContain('property="og:image"')

		config.seo = { ...config.seo, socialImage: '/social/cover.webp' }
		const withImage = await container.renderToString(HtmlShell, {
			props: { lang: 'en', canonical: 'https://site.test/en/' },
			slots,
			request: new Request('https://site.test/en/'),
		})
		expect(withImage).toContain('<meta name="twitter:card" content="summary_large_image">')
		expect(withImage.match(/<meta property="og:locale" content="[^"]*">/g)).toEqual([
			'<meta property="og:locale" content="en_US">',
		])
		expect(withImage).toContain(
			`<meta property="og:image" content="${OTHER_ORIGIN}/social/cover.webp">`,
		)
		expect(withImage).toContain(
			`<meta name="twitter:image" content="${OTHER_ORIGIN}/social/cover.webp">`,
		)
	})

	it("takes og:locale from the site's catalog", async () => {
		const { catalog } = config.site.content
		config.site.content = {
			...config.site.content,
			catalog: { ...catalog, en: { ...catalog.en!, ogLocale: 'en_GB' } },
		}
		const html = await container.renderToString(HtmlShell, { props: { lang: 'en' }, slots })
		expect(html.match(/<meta property="og:locale" content="[^"]*">/g)).toEqual([
			'<meta property="og:locale" content="en_GB">',
		])
	})

	it('renders canonical and alternate hreflang links when provided', async () => {
		const html = await container.renderToString(HtmlShell, {
			props: {
				lang: 'en',
				canonical: `https://site.test${NESTED_ROUTE}`,
				alternates: [
					{ hreflang: 'en', href: 'https://site.test/en/portfolio/coastal-light/' },
					{ hreflang: 'ru', href: 'https://site.test/ru/portfolio/coastal-light/' },
				],
			},
			slots,
		})
		expect(html).toContain(`<link rel="canonical" href="https://site.test${NESTED_ROUTE}">`)
		expect(html).toContain('rel="alternate"')
		expect(html).toContain('hreflang="ru"')
		expect(html).toContain('href="https://site.test/ru/portfolio/coastal-light/"')
	})

	it('omits canonical/alternate links when not provided', async () => {
		const html = await container.renderToString(HtmlShell, {
			props: { lang: 'en' },
			slots,
		})
		expect(html).not.toContain('rel="canonical"')
		expect(html).not.toContain('rel="alternate"')
	})

	// the global SEO defaults never emit robots; a page opts in explicitly
	it('renders the robots meta only when opted in', async () => {
		const withRobots = await container.renderToString(HtmlShell, {
			props: { lang: 'en', robots: 'noindex,follow' },
			slots,
		})
		expect(withRobots).toContain('<meta name="robots" content="noindex,follow">')
		const withoutRobots = await container.renderToString(HtmlShell, {
			props: { lang: 'en' },
			slots,
		})
		expect(withoutRobots).not.toContain('name="robots"')
	})
})

describe('HtmlShell fonts by locale script', () => {
	const renderShell = (lang: Locale) =>
		container.renderToString(HtmlShell, { props: { lang }, slots: { default: '<p>x</p>' } })
	const preloads = (html: string) =>
		[...html.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map((m) => m[1])

	it.each(['en', 'ru'] as const)(
		'marks the %s page with its script and preloads that subset',
		async (lang) => {
			const html = await renderShell(lang)
			const script = localeScript(config.site.content.catalog, lang)
			expect(html).toMatch(new RegExp(`<html[^>]*data-script="${script}"`))
			expect(preloads(html)).toEqual(fontPreloads(script))
		},
	)

	it("follows a script the site's catalog overrides", async () => {
		const { catalog } = config.site.content
		config.site.content = {
			...config.site.content,
			catalog: { ...catalog, en: { ...catalog.en!, script: 'cyrillic' } },
		}
		const html = await renderShell('en')
		expect(html).toMatch(/<html[^>]*data-script="cyrillic"/)
		expect(preloads(html)).toEqual(fontPreloads('cyrillic'))
	})

	it('maps en to latin and ru to cyrillic and preloads only the regular and 700 faces', () => {
		expect(localeScript(DEFAULT_LOCALE_CATALOG, 'en')).toBe('latin')
		expect(localeScript(DEFAULT_LOCALE_CATALOG, 'ru')).toBe('cyrillic')
		expect(() => localeScript(DEFAULT_LOCALE_CATALOG, 'de')).toThrow(/no entry for locale "de"/)
		for (const script of ['latin', 'cyrillic'] as const) {
			const files = fontPreloads(script)
			expect(files).toHaveLength(2)
			expect(files[0]).toMatch(/-regular\.woff2$/)
			expect(files[1]).toMatch(/-700\.woff2$/)
		}
		expect(fontPreloads('latin')).not.toEqual(fontPreloads('cyrillic'))
	})
})

describe('one-locale site', () => {
	// the demo's dictionaries name both its locales, which a one-locale config rejects; the shell
	// still reads the demo's generated image config
	beforeEach(() => {
		const demoRoot = siteRoot
		root.override = mkdtempSync(path.join(tmpdir(), 'one-locale-site-'))
		cpSync(
			path.join(demoRoot, IMAGES_PUBLIC_RELATIVE_PATH),
			path.join(root.override, IMAGES_PUBLIC_RELATIVE_PATH),
		)
		config.site = buildSiteConfig({ content: contentConfig(['en'], 'en') })
		config.site.footer = { ...config.site.footer, recentWorks: 'off' }
	})
	afterEach(() => {
		if (root.override) rmSync(root.override, { force: true, recursive: true })
		root.override = undefined
	})

	const languageNav = () => `aria-label="${useTranslations('en')('nav.language.label')}"`

	it('draws no language block in the overlay of the header and the fullscreen home', async () => {
		const header = await container.renderToString(SiteHeader, { props: { lang: 'en' } })
		const home = await container.renderToString(Fullscreen, {
			props: {},
			request: new Request('https://site.test/en/'),
		})
		for (const html of [header, home]) {
			expect(html).toContain('id="site-menu-overlay"')
			expect(html).not.toContain(languageNav())
			expect(html).not.toContain('hreflang=')
		}
	})

	it('links the single privacy policy on a neutral page without a locale suffix', async () => {
		const html = await container.renderToString(SiteFooter, {
			props: { lang: 'en', localeNeutral: true, promo: footerPromo },
			request: new Request('https://site.test/rights/'),
		})
		expect(html.match(/href="\/[a-z]{2}\/privacy\/"/g)).toEqual(['href="/en/privacy/"'])
		expect(html).toContain(`>${useTranslations('en')('footer.privacy')}</a>`)
		expect(html).not.toContain('(EN)')
		expect(html).not.toContain('hreflang=')
	})
})

describe('MenuOverlay without React', () => {
	// the menu is a native script; an island would bring the React renderer to every page
	it('renders the overlay in the header and on the fullscreen home without an island', async () => {
		const header = await container.renderToString(SiteHeader, { props: { lang: 'en' } })
		const home = await container.renderToString(Fullscreen, {
			props: {},
			request: new Request('https://site.test/en/'),
		})
		for (const html of [header, home]) {
			expect(html).toContain('<div class="menu-overlay-root">')
			expect(html).toContain('id="site-menu-overlay"')
			expect(html).not.toContain('astro-island')
		}
	})
})

describe('Fullscreen home metadata', () => {
	const OG_LOCALE = { en: 'en_US', ru: 'ru_RU' } as const

	// the container reads i18n only from `manifest`, not from `astroConfig`; with it Astro.currentLocale
	// follows the request path. It fills every other manifest field with its defaults, so a manifest
	// holding only i18n stands for a whole one
	it('renders self-canonical and both language alternates with English x-default', async () => {
		config.site.origin = OTHER_ORIGIN
		const i18n: SSRManifest['i18n'] = {
			locales: [...config.site.content.locales],
			defaultLocale: defaultLocale(config.site),
			strategy: 'pathname-prefix-always',
			fallback: undefined,
			fallbackType: 'redirect',
			domainLookupTable: {},
			domains: undefined,
		}
		const routed = await AstroContainer.create({ manifest: { i18n } as SSRManifest })
		for (const locale of ['en', 'ru'] as const) {
			const html = await routed.renderToString(Fullscreen, {
				props: {},
				request: new Request(`https://site.test/${locale}/`),
			})
			expect(html).toMatch(new RegExp(`<html[^>]*\\blang="${locale}"`))
			expect(html.match(/<meta property="og:locale" content="[^"]*">/g)).toEqual([
				`<meta property="og:locale" content="${OG_LOCALE[locale]}">`,
			])
			expect(html).toContain(`<link rel="canonical" href="${OTHER_ORIGIN}/${locale}/">`)
			expect(html).toContain(`hreflang="en" href="${OTHER_ORIGIN}/en/"`)
			expect(html).toContain(`hreflang="ru" href="${OTHER_ORIGIN}/ru/"`)
			expect(html).toContain(`hreflang="x-default" href="${OTHER_ORIGIN}/en/"`)
		}
	})
})

// base requires a footer promo context; a neutral one is enough for shell tests
const footerPromo = footerPromoContext('test:shell')

describe('site dictionary overrides', () => {
	it("renders the site's footer quote, not the core default", async () => {
		for (const lang of ['en', 'ru'] as const) {
			const file = siteDictionaryPath(lang)
			const quote = (readYaml(siteRoot, file) as Record<string, string>)['footer.quote']!
			expect(quote, file).not.toBe(CORE_DICTIONARIES[lang]!['footer.quote'])
			const html = await container.renderToString(SiteFooter, {
				props: { lang, promo: footerPromo },
				request: new Request(`https://site.test/${lang}/about/`),
			})
			expect(html).toContain(`<blockquote class="footer-quote">${quote}</blockquote>`)
		}
	})
})

describe('privacy legal links', () => {
	it('keeps a localized privacy link in the footer outside primary navigation', async () => {
		for (const lang of ['en', 'ru'] as const) {
			const html = await container.renderToString(SiteFooter, {
				props: { lang, promo: footerPromo },
				request: new Request(`https://site.test/${lang}/about/`),
			})
			expect(html).toContain(`href="/${lang}/privacy/"`)
			expect(html).toContain('class="footer-legal"')
			expect(html.match(/href="\/(en|ru)\/privacy\/"/g)).toHaveLength(1)
		}
	})

	it('shows both explicitly labelled policies on neutral pages', async () => {
		const html = await container.renderToString(SiteFooter, {
			props: { lang: 'en', localeNeutral: true, promo: footerPromo },
			request: new Request('https://site.test/rights/'),
		})
		for (const locale of ['en', 'ru'] as const) {
			expect(html).toContain(`href="/${locale}/privacy/"`)
			expect(html).toContain(
				`${useTranslations(locale)('footer.privacy')} (${locale.toUpperCase()})`,
			)
		}
	})
})

describe('Base content width', () => {
	const renderBase = (props: Record<string, unknown>, slots: Record<string, string>) =>
		container.renderToString(Base, {
			props: { footerPromo, ...props },
			slots,
			request: new Request('https://site.test/en/about/'),
		})

	it('falls back to the legacy standard width', async () => {
		const html = await renderBase({}, { default: '<p>content</p>' })
		expect(html).toContain('content content--standard')
	})

	it('applies the typed width to the main container', async () => {
		for (const width of ['prose', 'medium', 'gallery', 'standard']) {
			const html = await renderBase({ width }, { default: '<p>content</p>' })
			expect(html).toContain(`content content--${width}`)
		}
	})

	it('passes the opt-in robots meta through to the shell', async () => {
		const withRobots = await renderBase(
			{ robots: 'noindex,follow', localeNeutral: true, width: 'prose' },
			{ default: '<p>content</p>' },
		)
		expect(withRobots).toContain('<meta name="robots" content="noindex,follow">')
		const withoutRobots = await renderBase({ width: 'prose' }, { default: '<p>content</p>' })
		expect(withoutRobots).not.toContain('name="robots"')
	})

	// `/status/` is a service page and stays out of navigation
	it('never links to the status page from the header or footer chrome', async () => {
		const html = await renderBase(
			{ localeNeutral: true, width: 'prose' },
			{ default: '<p>content</p>' },
		)
		expect(html).not.toContain('/status/')
	})
})

// the legacy theme rendered the banner before the header, so the navigation bar sits below it; here
// the header is in normal flow and the markup order sets this
describe('Base block order', () => {
	const renderBase = (props: Record<string, unknown>) =>
		container.renderToString(Base, {
			props: { footerPromo, ...props },
			slots: { default: '<p>content</p>' },
			request: new Request(`https://site.test${NESTED_ROUTE}`),
		})

	it('renders the banner above the header', async () => {
		const html = await renderBase({ heading: 'Harbour Mornings', banner })
		expect(html).toContain('top-section')
		expect(html).toContain('<header')
		expect(html.indexOf('top-section')).toBeLessThan(html.indexOf('<header'))
	})

	it('keeps the header first and emits no wrapper when there is no heading', async () => {
		const html = await renderBase({})
		expect(html).toContain('<header')
		expect(html).toContain('<main')
		expect(html.indexOf('<header')).toBeLessThan(html.indexOf('<main'))
		expect(html).not.toContain('<div data-menu-inert></div>')
	})
})

// in the legacy theme the H1 lived only in the banner and the document body started with H2; without
// an assigned photo the banner falls back to a text hero in the same place, above the navigation
describe('Base page heading', () => {
	const renderBase = (props: Record<string, unknown>, slots: Record<string, string>) =>
		container.renderToString(Base, {
			props: { footerPromo, ...props },
			slots,
			request: new Request('https://site.test/en/about/'),
		})

	it('renders the heading as a text hero above the header', async () => {
		const html = await renderBase({ heading: 'Quiet Notes' }, { default: '<p>content</p>' })
		expect(html).toContain('page-hero')
		expect(html).toContain('<header')
		expect(html.indexOf('page-hero')).toBeLessThan(html.indexOf('<header'))
		expect(html).toContain('<h1>')
	})

	it('splits the heading into head and accent tail, like the photo banner', async () => {
		const html = await renderBase({ heading: 'Quiet Notes' }, { default: '<p>content</p>' })
		expect(html).toContain(
			'Quiet<span class="page-hero__accent page-hero__accent--alt"> Notes</span>',
		)
	})

	it('emits no h1 at all when the page passes no heading', async () => {
		const html = await renderBase({}, { default: '<p>content</p>' })
		expect(html).not.toContain('page-hero')
		expect(html).not.toContain('<h1')
	})

	// a page must not get two H1s, so the heading renders exactly one hero state
	it('replaces the text hero with the banner when a photo is assigned', async () => {
		const html = await renderBase(
			{ heading: 'Harbour Mornings', banner },
			{ default: '<p>content</p>' },
		)
		expect(html).not.toContain('page-hero')
		expect(html).toContain('top-section')
		expect(html.match(/<h1/g)).toHaveLength(1)
	})

	// the banner draws the H1 itself, so a banner without a heading fails the build
	it('fails closed when a banner comes without a heading', async () => {
		await expect(renderBase({ banner }, { default: '<p>content</p>' })).rejects.toThrow(
			/heading/,
		)
	})
})

// footer.social only toggles the footer icons; the home overlay keeps rendering the shared
// `site.social` list
describe('home social icons ignore footer.social', () => {
	it('keeps the overlay icons when the footer icons are off', async () => {
		config.site.footer = { ...config.site.footer, social: 'off' }
		config.site.social = [
			{
				id: 'github',
				href: 'https://github.com/example',
				label: { en: 'GitHub' },
				icon: 'github',
				hover: '#181717',
			},
		]
		const html = await container.renderToString(Fullscreen, {
			props: {},
			slots: { default: '<p>home</p>' },
			request: new Request('https://site.test/en/'),
		})
		expect(html).toMatch(/class="social-icons[^"]*\bover\b/)
	})
})

// menu, social links and identity are config; the surfaces render whatever is substituted here
describe('config-driven navigation, social links and copyright', () => {
	const ITEMS: SiteConfig['menu']['items'] = [
		{ segment: 'notes', label: { en: 'Notes 41a', ru: 'Заметки' } },
		{ segment: 'gallery', label: { en: 'Gallery 41a', ru: 'Галерея' } },
	]
	const SOCIAL: SiteConfig['social'] = [
		{
			id: 'flickr',
			href: 'https://www.flickr.com/photos/example/',
			label: { en: 'Flickr' },
			icon: 'github',
			hover: '#ff0084',
		},
		{
			id: 'write',
			href: '/{lang}/contacts/',
			label: { en: 'Write' },
			icon: 'contacts',
			hover: '#123abc',
		},
	]
	const IDENTITY: SiteConfig['identity'] = {
		title: { en: 'Example Photography' },
		photoAlt: { en: 'Photograph by Example' },
		copyright: { holder: { en: 'Example Author 41a' }, since: 2003 },
	}

	const withConfig = <T>(render: () => Promise<T>): Promise<T> => {
		const base = buildSiteConfig()
		config.site = buildSiteConfig({
			menu: { ...base.menu, items: ITEMS },
			footer: { ...base.footer, social: 'on' },
			social: SOCIAL,
			identity: IDENTITY,
		})
		return render()
	}
	const renderHome = () =>
		withConfig(() =>
			container.renderToString(Fullscreen, {
				props: {},
				slots: { default: '<p>home</p>' },
				request: new Request('https://site.test/en/'),
			}),
		)
	const renderFooter = () =>
		withConfig(() =>
			container.renderToString(SiteFooter, {
				props: { lang: 'en', promo: footerPromoContext('test:footer') },
			}),
		)
	const anchorOf = (html: string, id: string) =>
		html.match(new RegExp(`class="social-icon social-icon--${id}"[^>]*>\\s*(<a[^>]*>)`))?.[1] ??
		''

	it('passes the configured items, labels and order to the home overlay', async () => {
		const html = (await renderHome()).replaceAll('&quot;', '"')
		const notes = html.indexOf('"/en/notes/"')
		const gallery = html.indexOf('"/en/gallery/"')
		expect(notes).toBeGreaterThan(-1)
		expect(gallery).toBeGreaterThan(notes)
		expect(html).toContain('Notes 41a')
		expect(html).toContain('Gallery 41a')
		expect(html).not.toContain('"/en/portfolio/"')
	})

	it('opens external links in a new tab, keeps internal ones, and sets each hover colour', async () => {
		for (const html of [await renderHome(), await renderFooter()]) {
			const external = anchorOf(html, 'flickr')
			expect(external).toContain('href="https://www.flickr.com/photos/example/"')
			expect(external).toContain('target="_blank"')
			expect(external).toContain('rel="noopener noreferrer"')
			expect(external).toContain('style="--social-hover:#ff0084"')
			const internal = anchorOf(html, 'write')
			expect(internal).toContain('href="/en/contacts/"')
			expect(internal).not.toContain('target=')
			expect(internal).not.toContain('rel=')
			expect(internal).toContain('style="--social-hover:#123abc"')
		}
	})

	it('renders the configured copyright holder and start year on the home and in the footer', async () => {
		const year = new Date().getFullYear()
		for (const html of [await renderHome(), await renderFooter()]) {
			expect(html).toContain(`Copyright © 2003-${year} Example Author 41a.`)
		}
	})
})
