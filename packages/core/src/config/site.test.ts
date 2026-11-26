import { describe, expect, it } from 'vitest'

import { buildSiteConfig, keepLocales } from './fixtures/site-config.ts'
import { LANGUAGE_SWITCHER_MODES, switcherDisplay } from './language-switcher.ts'
import { DEFAULT_LOCALE_CATALOG, SERVICE_COPY_LOCALE } from './locale-schema.ts'
import { MENU_ANIMATIONS, MENU_THEME_MODES, MENU_WIDTH_LADDER, MENU_WIDTH_MODES } from './menu.ts'
import { defaultLocale, siteSchema } from './site-schema.ts'
import { DEFAULT_TAXONOMY } from './taxonomy.ts'
import {
	ALBUM_LAYOUTS,
	CARD_GRID_RATIOS,
	CARD_PRESENTATIONS,
	PORTFOLIO_LAYOUTS,
} from './variants.ts'

const expectReject = (input: unknown) => expect(siteSchema.safeParse(input).success).toBe(false)
const expectAccept = (input: unknown) => expect(siteSchema.safeParse(input).success).toBe(true)
// a field or block left out takes the core's default instead of failing
const parsed = (input: unknown) => siteSchema.parse(input)

// every case overrides a test-built valid config, never the real site.yaml; a fresh literal per
// override keeps invalid values away from the typecheck (safeParse takes unknown)
const validSite = buildSiteConfig()
const withTopSection = (topSection: unknown) => ({ ...validSite, topSection })
// overrides one field on top of the valid test-built topSection
const withTopField = (field: string, value: unknown) =>
	withTopSection({ ...validSite.topSection, [field]: value })
const withShade = (shade: unknown) => withTopSection({ ...validSite.topSection, shade })
const withAccent = (accent: unknown) => withTopSection({ ...validSite.topSection, accent })
const withBanners = (banners: unknown) => ({ ...validSite, banners })
const withSurfaceBanner = (surface: string, value: unknown) =>
	withBanners({
		...validSite.banners,
		surfaces: { ...validSite.banners.surfaces, [surface]: value },
	})
const withFooter = (footer: unknown) => ({ ...validSite, footer })
const withFooterCurve = (curve: unknown) => withFooter({ ...validSite.footer, curve })
const withPortfolio = (portfolio: unknown) => ({ ...validSite, portfolio })
const withAlbum = (album: unknown) => ({ ...validSite, album })
const withViewer = (viewer: unknown) => ({ ...validSite, viewer })
const withLayout = (layout: unknown) => ({ ...validSite, layout })
const withSurfaces = (surfaces: unknown) => ({ ...validSite, surfaces })
const withSurface = (name: string, value: unknown) =>
	withSurfaces({ ...validSite.surfaces, [name]: value })
const withMasonry = (masonry: unknown) => withPortfolio({ ...validSite.portfolio, masonry })
const withJustified = (justified: unknown) => withAlbum({ ...validSite.album, justified })
const withMoreDocs = (moreDocs: unknown) => ({ ...validSite, moreDocs })
// the valid config with `content` and the given fields, every config text cut to the locales of
// `content` as a site with them writes it; the field under test is laid over it afterwards
const siteOn = (content: unknown, fields: object = {}) => {
	const locales = (content as { locales?: unknown } | undefined)?.locales
	const site = { ...validSite, ...fields }
	return {
		...(Array.isArray(locales) && locales.length > 0 ? keepLocales(site, locales) : site),
		content,
	}
}

// identity for tests that force `content.locales: [en, ru]`: built here so it covers those locales
// whatever site.yaml holds
const IDENTITY_EN_RU = {
	title: { en: 'Example Photography', ru: 'Пример · Фотография' },
	photoAlt: { en: 'Photograph by Example', ru: 'Фотография Примера' },
	copyright: { holder: { en: 'Example Author', ru: 'Пример Автора' }, since: 2001 },
}

describe('site config', () => {
	it('accepts the test-built config', () => {
		expectAccept(validSite)
	})

	it('defaults the favicon colors and takes only a hex color or a color function', () => {
		const withFavicon = (favicon: unknown) => ({
			...validSite,
			theme: { ...validSite.theme, favicon },
		})
		const { theme } = validSite
		expect(parsed({ ...validSite, theme: { default: theme.default } }).theme.favicon).toEqual({
			background: '#1b1b1f',
			foreground: '#fcbf00',
		})
		for (const color of ['#FFF', '#0008', '#1b1b1f', '#1b1b1f80', 'oklch(0.7 0.15 80 / 50%)'])
			expectAccept(withFavicon({ background: color }))
		for (const color of ['red', '#12345', 'var(--x)', '#000"/><script>', 'rgb(0 0 0);x', ''])
			expectReject(withFavicon({ background: color }))
		expectReject(withFavicon({ border: '#000' }))
	})

	it('is fail-closed: rejects unknown keys at every level', () => {
		expectReject({ ...validSite, unexpected: true }) // unknown root key
		expectReject(withTopField('extra', 1)) // strict topSection
		expectReject(withShade({ mode: 'mono', monoOpacity: 30, tintOpacity: 45, extra: 1 })) // strict shade
		expectReject({ ...validSite, footer: { curve: 'off', extra: 1 } }) // strict wrapper
		expectReject({ ...validSite, theme: { ...validSite.theme, extra: 1 } })
	})
})

describe('site origin', () => {
	const withOrigin = (origin: unknown) => ({ ...validSite, origin })

	it('accepts a bare https origin', () => {
		expectAccept(withOrigin('https://site.test'))
		expectAccept(withOrigin('https://www.site.test:8443'))
	})

	it('rejects a non-https origin, a path, a trailing slash, a query, a fragment or a non-URL', () => {
		for (const origin of [
			'http://site.test',
			'https://site.test/',
			'https://site.test/en',
			'https://site.test?x=1',
			'https://site.test#top',
			'https://user@site.test',
			'https://SITE.test',
			'site.test',
			'',
		])
			expectReject(withOrigin(origin))
	})

	it('reports the key path on a bad origin', () => {
		const result = siteSchema.safeParse(withOrigin('https://site.test/'))
		expect(result.error?.issues[0]?.path).toEqual(['origin'])
	})
})

describe('factcheck own hosts', () => {
	const withOwnHosts = (ownHosts: unknown) => ({ ...validSite, factcheck: { ownHosts } })

	it('accepts lowercase host names and an empty list', () => {
		expectAccept(withOwnHosts([]))
		expectAccept(withOwnHosts(['old-site.test', 'staging.old-site.test']))
	})

	it('rejects URLs, paths and upper case', () => {
		for (const host of [
			'https://old-site.test',
			'old-site.test/x',
			'Old-Site.test',
			'localhost',
		])
			expectReject(withOwnHosts([host]))
	})
})

describe('content locales', () => {
	const withContent = (content: unknown) => siteOn(content)

	it('accepts one or more locales of the catalog holding the reference locale', () => {
		expectAccept(withContent({ locales: ['ru'], referenceLocale: 'ru' }))
		expectAccept(withContent({ locales: ['en'], referenceLocale: 'en' }))
		expectAccept(withContent({ locales: ['ru', 'en'], referenceLocale: 'en' }))
	})

	it('rejects an empty, repeated or unknown locale list and a reference outside it', () => {
		expectReject(withContent({ locales: [], referenceLocale: 'ru' }))
		expectReject(withContent({ locales: ['ru', 'ru'], referenceLocale: 'ru' }))
		expectReject(withContent({ locales: ['de'], referenceLocale: 'de' }))
		expectReject(withContent({ locales: ['en'], referenceLocale: 'ru' }))
		expectReject(withContent({ referenceLocale: 'ru' }))
	})

	it('takes the default locale from the head of the list', () => {
		expect(defaultLocale({ content: { locales: ['ru', 'en'] } })).toBe('ru')
		expect(defaultLocale({ content: { locales: ['en'] } })).toBe('en')
	})
})

describe('content taxonomy', () => {
	const content = (taxonomy: unknown) => ({
		locales: ['en', 'ru'],
		referenceLocale: 'en',
		taxonomy,
	})
	const issues = (taxonomy: unknown) => {
		const result = siteSchema.safeParse(siteOn(content(taxonomy)))
		return result.success
			? []
			: result.error.issues.map((issue) => ({
					path: issue.path.join('.'),
					message: issue.message,
				}))
	}

	it("resolves to the core's enumerations when the site declares none", () => {
		expect(parsed(siteOn(content(undefined))).content.taxonomy).toEqual({
			...DEFAULT_TAXONOMY,
			dimensions: {},
		})
	})

	it('takes a declared list whole and keeps the defaults of the others', () => {
		expect(
			parsed(
				siteOn(
					content({ categories: ['journeys', 'studies'], placeKinds: ['land', 'spot'] }),
				),
			).content.taxonomy,
		).toEqual({
			categories: ['journeys', 'studies'],
			placeKinds: ['land', 'spot'],
			tagKinds: DEFAULT_TAXONOMY.tagKinds,
			dimensions: {},
		})
	})

	it('rejects an empty list, a repeated id and an id outside kebab case, with the path', () => {
		expect(issues({ tagKinds: [] })).toEqual([
			{ path: 'content.taxonomy.tagKinds', message: 'must list at least one id' },
		])
		expect(issues({ categories: ['series', 'series'] })).toEqual([
			{ path: 'content.taxonomy.categories.1', message: 'repeats "series"' },
		])
		expect(issues({ placeKinds: ['Land'] })).toEqual([
			{
				path: 'content.taxonomy.placeKinds.0',
				message: 'expected a kebab-case id such as `series`',
			},
		])
		expect(issues({ kinds: ['events'] })).toEqual([
			{ path: 'content.taxonomy', message: expect.stringContaining('kinds') },
		])
	})

	describe('dimensions', () => {
		const events = { label: { en: 'Events', ru: 'События' }, icon: 'calendar-days' }

		it('takes a dimension with its label in every locale and an optional icon', () => {
			expect(
				parsed(siteOn(content({ dimensions: { events, people: { label: events.label } } })))
					.content.taxonomy.dimensions,
			).toEqual({ events, people: { label: events.label } })
		})

		it('rejects a missing or extra locale of the label, with the path', () => {
			expect(
				issues({ dimensions: { events: { label: { en: 'Events', de: 'X' } } } }),
			).toEqual([
				{
					path: 'content.taxonomy.dimensions.events.label.de',
					message: 'not one of content.locales [en, ru]',
				},
				{
					path: 'content.taxonomy.dimensions.events.label.ru',
					message: 'missing the "ru" text required by content.locales',
				},
			])
		})

		it.each(['categories', 'places', 'tags', 'image-sets', 'place-gps-bounds'])(
			'rejects "%s", the name of another file of src/content/config',
			(id) => {
				expect(issues({ dimensions: { [id]: events } })).toEqual([
					{
						path: `content.taxonomy.dimensions.${id}`,
						message: expect.stringContaining(`"${id}" names another file`),
					},
				])
			},
		)

		it('rejects an id or an icon name outside kebab case, with the path', () => {
			expect(issues({ dimensions: { Events: events } })).toEqual([
				{ path: 'content.taxonomy.dimensions.Events', message: expect.any(String) },
			])
			expect(issues({ dimensions: { events: { ...events, icon: 'Calendar' } } })).toEqual([
				{
					path: 'content.taxonomy.dimensions.events.icon',
					message: 'expected a Lucide icon name such as `calendar-days`',
				},
			])
		})
	})
})

describe('content catalog', () => {
	const DE = { script: 'latin', ogLocale: 'de_DE', intl: 'de-DE', charWidthPx: 7.4 }
	const issues = (content: unknown) => {
		const result = siteSchema.safeParse(siteOn(content))
		return result.success
			? []
			: result.error.issues.map((issue) => ({
					path: issue.path.join('.'),
					message: issue.message,
				}))
	}
	// a site in a locale the core has no default for, its texts moved from the English ones
	const germanSite = (catalog: unknown) => {
		const english = keepLocales({ ...validSite, content: undefined }, ['en'])
		return {
			...(JSON.parse(JSON.stringify(english).replaceAll('"en":', '"de":')) as object),
			content: { locales: ['de'], referenceLocale: 'de', catalog },
		}
	}

	it("resolves to the core's defaults for the site's locales", () => {
		expect(parsed(siteOn({ locales: ['en', 'ru'], referenceLocale: 'en' })).content).toEqual({
			locales: ['en', 'ru'],
			referenceLocale: 'en',
			catalog: { en: DEFAULT_LOCALE_CATALOG.en, ru: DEFAULT_LOCALE_CATALOG.ru },
			taxonomy: { ...DEFAULT_TAXONOMY, dimensions: {} },
		})
	})

	it("always holds the service copy's language, and no locale the site does not use", () => {
		const { catalog } = parsed(siteOn({ locales: ['ru'], referenceLocale: 'ru' })).content
		expect(Object.keys(catalog)).toEqual(['ru', SERVICE_COPY_LOCALE])
		const unused = parsed(
			siteOn({ locales: ['en'], referenceLocale: 'en', catalog: { de: DE, ru: {} } }),
		).content.catalog
		expect(Object.keys(unused)).toEqual(['en'])
	})

	it('overrides a default field by field', () => {
		const { catalog } = parsed(
			siteOn({
				locales: ['en', 'ru'],
				referenceLocale: 'en',
				catalog: { en: { ogLocale: 'en_GB' } },
			}),
		).content
		expect(catalog.en).toEqual({ ...DEFAULT_LOCALE_CATALOG.en, ogLocale: 'en_GB' })
		expect(catalog.ru).toEqual(DEFAULT_LOCALE_CATALOG.ru)
	})

	it('accepts a new locale with every field', () => {
		const site = parsed(germanSite({ de: DE }))
		expect(site.content.catalog).toEqual({ de: DE, en: DEFAULT_LOCALE_CATALOG.en })
		expect(site.identity.title).toEqual({ de: validSite.identity.title.en })
	})

	it('resolves to a fixed point, as the loader requires of the lock', () => {
		const site = parsed(germanSite({ de: DE, en: { charWidthPx: 7 } }))
		expect(parsed(site)).toEqual(site)
	})

	it('names each field a new locale lacks', () => {
		expect(
			issues({
				locales: ['en'],
				referenceLocale: 'en',
				catalog: { de: { script: 'latin' } },
			}),
		).toEqual(
			['ogLocale', 'intl', 'charWidthPx'].map((field) => ({
				path: `content.catalog.de.${field}`,
				message: 'required: the core has no default entry for "de"',
			})),
		)
	})

	it('rejects a locale without a catalog entry', () => {
		expect(issues({ locales: ['de'], referenceLocale: 'de' })).toContainEqual({
			path: 'content.locales.0',
			message: '"de" has no entry in the catalog; add content.catalog.de',
		})
	})

	it('accepts only a script the core has fonts for', () => {
		expect(
			issues({
				locales: ['en'],
				referenceLocale: 'en',
				catalog: { el: { ...DE, script: 'greek', ogLocale: 'el_GR', intl: 'el-GR' } },
			}),
		).toEqual([
			{
				path: 'content.catalog.el.script',
				message: 'expected a script the core has fonts for: latin, cyrillic',
			},
		])
	})

	it('rejects a malformed locale code, field or tag', () => {
		const format = 'expected a locale code of two or three lowercase letters, such as `en`'
		expect(issues({ locales: ['EN'], referenceLocale: 'EN' })).toContainEqual({
			path: 'content.locales.0',
			message: format,
		})
		expectReject(siteOn({ locales: ['en'], referenceLocale: 'en', catalog: { EN: {} } }))
		for (const field of [
			{ ogLocale: 'en-GB' },
			{ intl: 'not a tag' },
			{ charWidthPx: 0 },
			{ unknown: 1 },
		])
			expectReject(siteOn({ locales: ['en'], referenceLocale: 'en', catalog: { en: field } }))
	})
})

describe('topSection', () => {
	it('accepts all six legacy patterns and off', () => {
		for (const pattern of ['off', 'plain', 'radial', 'diagonal', 'hatch', 'carbon', 'weave']) {
			expectAccept(withTopField('pattern', pattern))
		}
	})

	it('rejects unknown pattern names or non-strings', () => {
		expectReject(withTopField('pattern', 'zigzag'))
		expectReject(withTopField('pattern', ''))
		expectReject(withTopField('pattern', true))
	})

	it('accepts blur off | on | small and rejects others', () => {
		expectAccept(withTopField('blur', 'off'))
		expectAccept(withTopField('blur', 'on'))
		expectAccept(withTopField('blur', 'small'))
		expectReject(withTopField('blur', 'large'))
		expectReject(withTopField('blur', true))
	})

	it('requires boolean parallax and shadow', () => {
		expectAccept(withTopField('parallax', false))
		expectAccept(withTopField('shadow', false))
		expectReject(withTopField('parallax', 'yes'))
		expectReject(withTopField('shadow', 1))
	})

	it('accepts shade modes off | mono | tint', () => {
		for (const mode of ['off', 'mono', 'tint']) {
			expectAccept(withShade({ mode, monoOpacity: 30, tintOpacity: 45 }))
		}
		expectReject(withShade({ mode: 'dark', monoOpacity: 30, tintOpacity: 45 })) // unknown mode
	})

	// the banner accent is a toggle of its own, independent of hero.galleryAccent
	it('accepts accent | alt for both banner kinds and rejects anything else', () => {
		for (const album of ['accent', 'alt']) {
			for (const section of ['accent', 'alt']) {
				expectAccept(withAccent({ album, section }))
			}
		}
		expectReject(withAccent({ album: 'yellow', section: 'alt' })) // not a token
		expect(parsed(withAccent({ album: 'alt' })).topSection.accent).toEqual({
			album: 'alt',
			section: 'alt',
		}) // section defaults
		expectReject(withAccent({ album: 'accent', section: 'alt', photo: 'accent' })) // strict
		expectReject(withAccent('accent')) // not an object
	})

	it('accepts the three title reveal variants and nothing else', () => {
		for (const titleReveal of ['slide', 'fade', 'off']) {
			expectAccept(withTopField('titleReveal', titleReveal))
		}
		expectReject(withTopField('titleReveal', 'on'))
		expectReject(withTopField('titleReveal', true))
		expect(
			parsed(withTopSection({ ...validSite.topSection, titleReveal: undefined })).topSection
				.titleReveal,
		).toBe('fade') // default
	})

	it('enforces both opacity bounds (1..99, int) and defaults missing fields', () => {
		expectAccept(withShade({ mode: 'mono', monoOpacity: 1, tintOpacity: 99 })) // edges
		expectReject(withShade({ mode: 'mono', monoOpacity: 0, tintOpacity: 45 })) // < 1
		expectReject(withShade({ mode: 'mono', monoOpacity: 100, tintOpacity: 45 })) // > 99
		expectReject(withShade({ mode: 'tint', monoOpacity: 30, tintOpacity: 45.5 })) // non-int
		expect(parsed(withShade({ mode: 'tint', monoOpacity: 10 })).topSection.shade).toEqual({
			mode: 'tint',
			monoOpacity: 10,
			tintOpacity: 45,
		})
		expect(parsed(withShade({ tintOpacity: 60 })).topSection.shade).toEqual({
			mode: 'mono',
			monoOpacity: 30,
			tintOpacity: 60,
		})
	})
})

describe('footer.curve', () => {
	const shapes = [
		'upright',
		'upleft',
		'downleft',
		'downright',
		'lessdownleft',
		'lessdownright',
		'downleftinverse',
	]

	it('accepts off or any of the seven legacy shapes with a bounded height', () => {
		expectAccept(withFooterCurve('off'))
		for (const shape of shapes) {
			expectAccept(withFooterCurve({ shape, height: 80 }))
		}
		expectAccept(withFooterCurve({ shape: 'upright', height: 20 })) // lower edge
		expectAccept(withFooterCurve({ shape: 'upright', height: 200 })) // upper edge
	})

	it('rejects out-of-bounds, non-integer or unknown-shape curves', () => {
		expectReject(withFooterCurve({ shape: 'upright', height: 10 })) // < 20
		expectReject(withFooterCurve({ shape: 'upright', height: 0 }))
		expectReject(withFooterCurve({ shape: 'upright', height: 250 })) // > 200
		expectReject(withFooterCurve({ shape: 'upright', height: 60.5 })) // non-int
		expectReject(withFooterCurve({ shape: 'legacy-spline', height: 60 })) // old literal gone
		expectReject(withFooterCurve({ shape: 'wave', height: 60 })) // unknown
		expectReject(withFooterCurve({ shape: 'upright', height: 60, extra: 1 })) // strict
		expectReject(withFooterCurve('on'))
	})

	it('defaults a missing curve or field inside the shape object', () => {
		expect(parsed(withFooterCurve({ shape: 'upright' })).footer.curve).toEqual({
			shape: 'upright',
			height: 100,
		})
		expect(parsed(withFooterCurve(undefined)).footer.curve).toEqual({
			shape: 'downright',
			height: 100,
		})
	})
})

// the legacy four-column variant is not implemented, so the config does not offer it
describe('footer.columns', () => {
	it('accepts the implemented column counts only', () => {
		for (const columns of [1, 2, 3]) {
			expectAccept(withFooter({ ...validSite.footer, columns }))
		}
	})

	it('rejects unimplemented counts and non-integers, and defaults a missing key', () => {
		expectReject(withFooter({ ...validSite.footer, columns: 4 }))
		expectReject(withFooter({ ...validSite.footer, columns: 0 }))
		expectReject(withFooter({ ...validSite.footer, columns: 2.5 }))
		expectReject(withFooter({ ...validSite.footer, columns: '2' }))
		expect(parsed(withFooter({ curve: validSite.footer.curve })).footer.columns).toBe(3)
	})
})

describe('theme.default', () => {
	const withTheme = (theme: unknown) => ({ ...validSite, theme })

	it('accepts dark, light and auto', () => {
		for (const value of ['dark', 'light', 'auto']) {
			expectAccept(withTheme({ ...validSite.theme, default: value }))
		}
	})

	it('rejects unknown values and non-strings', () => {
		expectReject(withTheme({ ...validSite.theme, default: 'system' }))
		expectReject(withTheme({ ...validSite.theme, default: true }))
	})
})

// the shipped values are the owner's choice and are not pinned here; only the schema contract is
describe('menu', () => {
	// locales and social are built here too, so the label coverage check depends on nothing in site.yaml
	const CONTENT = { locales: ['en', 'ru'], referenceLocale: 'ru' }
	const withMenu = (menu: unknown, content: unknown = CONTENT) => ({
		...siteOn(content, { identity: IDENTITY_EN_RU, social: [] }),
		menu,
	})
	// a valid block; each reject case overlays one invalid key on it
	const base = {
		animate: 'word-slide-in',
		width: 'adaptive',
		minWidth: 'medium',
		lang: 'full',
		theme: 'sun',
		logoSize: 0,
		topLogoSize: 0,
		topLogoSticky: 'off',
		sticky: 'off',
		stickyFade: 'off',
		sectionIcon: 'off',
		sectionIconSwap: 'off',
		items: [
			{
				segment: 'gallery',
				label: { en: 'Gallery', ru: 'Галерея' },
				icon: ['image', 'grid'],
			},
			{ segment: 'notes', label: { en: 'Notes', ru: 'Заметки' } },
			{ segment: 'contact', label: { en: 'Contact', ru: 'Контакт' }, icon: 'mail' },
		],
	} as const

	it('accepts off and every implemented legacy effect', () => {
		for (const animate of MENU_ANIMATIONS) {
			expectAccept(withMenu({ ...base, animate }))
		}
	})

	it('accepts both width modes', () => {
		for (const width of MENU_WIDTH_MODES) {
			expectAccept(withMenu({ ...base, width }))
		}
	})

	it('accepts every width tier as minWidth', () => {
		for (const minWidth of MENU_WIDTH_LADDER) {
			expectAccept(withMenu({ ...base, minWidth }))
		}
	})

	it('accepts every language switcher mode', () => {
		for (const lang of LANGUAGE_SWITCHER_MODES) {
			expectAccept(withMenu({ ...base, lang }))
		}
	})

	it('accepts every theme toggle mode', () => {
		for (const theme of MENU_THEME_MODES) {
			expectAccept(withMenu({ ...base, theme }))
		}
	})

	it('accepts logoSize off and the 0..1 enlargement range (incl. edges)', () => {
		for (const logoSize of ['off', 0, 0.25, 0.5, 1]) {
			expectAccept(withMenu({ ...base, logoSize }))
		}
	})

	it('rejects out-of-range or malformed logoSize', () => {
		expectReject(withMenu({ ...base, logoSize: 1.5 })) // > 1
		expectReject(withMenu({ ...base, logoSize: -0.1 })) // < 0
		expectReject(withMenu({ ...base, logoSize: 'big' })) // neither a number nor off
		expectReject(withMenu({ ...base, logoSize: true }))
	})

	it('accepts topLogoSize off and the 0..1 range, rejects malformed', () => {
		for (const topLogoSize of ['off', 0, 0.25, 1]) {
			expectAccept(withMenu({ ...base, topLogoSize }))
		}
		expectReject(withMenu({ ...base, topLogoSize: 1.5 }))
		expectReject(withMenu({ ...base, topLogoSize: -0.1 }))
		expectReject(withMenu({ ...base, topLogoSize: 'big' }))
	})

	it('accepts on|off for topLogoSticky and rejects anything else', () => {
		for (const value of ['off', 'on']) {
			expectAccept(withMenu({ ...base, topLogoSticky: value }))
		}
		expectReject(withMenu({ ...base, topLogoSticky: true }))
		expectReject(withMenu({ ...base, topLogoSticky: 'fixed' }))
	})

	it('accepts on|off for sticky and rejects anything else', () => {
		for (const value of ['off', 'on']) {
			expectAccept(withMenu({ ...base, sticky: value }))
		}
		expectReject(withMenu({ ...base, sticky: true }))
		expectReject(withMenu({ ...base, sticky: 'yes' }))
	})

	it('accepts stickyFade off or a 0..1 opacity, rejects anything else', () => {
		for (const value of ['off', 0, 0.5, 0.7, 1]) {
			expectAccept(withMenu({ ...base, stickyFade: value }))
		}
		expectReject(withMenu({ ...base, stickyFade: 'on' })) // the former on/off value is no longer accepted
		expectReject(withMenu({ ...base, stickyFade: 1.5 }))
		expectReject(withMenu({ ...base, stickyFade: -0.1 }))
		expectReject(withMenu({ ...base, stickyFade: true }))
	})

	it('accepts items in any order and without icons; a hidden section is just a missing item', () => {
		expectAccept(withMenu({ ...base, items: [...base.items].reverse() }))
		expectAccept(withMenu({ ...base, items: [base.items[1]] }))
	})

	it('rejects an empty, duplicate or malformed item list', () => {
		expectReject(withMenu({ ...base, items: [] }))
		expectReject(withMenu({ ...base, items: [base.items[0], base.items[0]] }))
		expectReject(withMenu({ ...base, items: [{ ...base.items[0], segment: '/gallery/' }] }))
		expectReject(withMenu({ ...base, items: [{ ...base.items[0], key: 'nav.gallery' }] }))
		expectReject(withMenu({ ...base, courses: 'on' })) // the old section switch is gone
	})

	it('rejects icons that are not a file name or an [index, nested] pair', () => {
		for (const icon of ['../mail', 'mail.svg', ['image'], ['image', 'grid', 'text'], '']) {
			expectReject(withMenu({ ...base, items: [{ ...base.items[0], icon }] }))
		}
	})

	it('requires a label for every active locale and reports its key path', () => {
		const items = [{ segment: 'gallery', label: { en: 'Gallery' } }]
		const result = siteSchema.safeParse(withMenu({ ...base, items }))
		expect(result.error?.issues.map((issue) => issue.path)).toEqual([
			['menu', 'items', 0, 'label', 'ru'],
		])
		expectReject(
			withMenu({ ...base, items: [{ ...items[0], label: { en: 'Gallery', ru: ' ' } }] }),
		)
		expectReject(
			withMenu({ ...base, items: [{ ...items[0], label: { ...items[0]!.label, de: 'x' } }] }),
		)
	})

	it('needs only the active locales on a one-locale site', () => {
		const items = [{ segment: 'gallery', label: { ru: 'Галерея' } }]
		expectAccept(withMenu({ ...base, items }, { locales: ['ru'], referenceLocale: 'ru' }))
		expectReject(withMenu({ ...base, items }, { locales: ['en'], referenceLocale: 'en' }))
	})

	it('rejects a label in a locale outside content.locales, naming its path', () => {
		const items = [{ segment: 'gallery', label: { en: 'Gallery', ru: 'Галерея' } }]
		const result = siteSchema.safeParse(
			withMenu({ ...base, items }, { locales: ['en'], referenceLocale: 'en' }),
		)
		expect(
			result.error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
		).toEqual(['menu.items.0.label.ru: not one of content.locales [en]'])
	})

	it('accepts on|off for sectionIcon and sectionIconSwap, rejects anything else', () => {
		for (const value of ['off', 'on']) {
			expectAccept(withMenu({ ...base, sectionIcon: value }))
			expectAccept(withMenu({ ...base, sectionIconSwap: value }))
		}
		expectReject(withMenu({ ...base, sectionIcon: true }))
		expectReject(withMenu({ ...base, sectionIconSwap: 'yes' }))
	})

	it('is fail-closed: rejects unknown values, non-object and extra keys', () => {
		expectReject(withMenu({ ...base, animate: 'spin' })) // unknown effect
		expectReject(withMenu({ ...base, animate: 'anim-3' })) // the legacy mixin name is not ported
		expectReject(withMenu({ ...base, width: 'fluid' })) // unknown mode
		expectReject(withMenu({ ...base, minWidth: 'wide' })) // unknown tier
		expectReject(withMenu({ ...base, lang: 'short' })) // unknown switcher mode
		expectReject(withMenu({ ...base, theme: 'moon' })) // unknown theme mode
		expectReject(withMenu({ ...base, extra: 1 })) // strict
		expectReject(withMenu('word-slide-in')) // not an object
	})

	it('defaults a missing presentation field', () => {
		expect(parsed(withMenu({ ...base, minWidth: undefined })).menu.minWidth).toBe('standard')
	})
})

describe('footer.quote + footer.recentWorks', () => {
	const works = (overrides: Record<string, unknown>) => ({
		count: 6,
		favorites: 2,
		freshness: 10,
		...overrides,
	})

	it('accepts on | off for the quote toggle', () => {
		expectAccept(withFooter({ ...validSite.footer, quote: 'on' }))
		expectAccept(withFooter({ ...validSite.footer, quote: 'off' }))
		expectReject(withFooter({ ...validSite.footer, quote: true }))
		expectReject(withFooter({ ...validSite.footer, quote: 'yes' }))
	})

	it('accepts off or bounded count, favorites and freshness for recentWorks', () => {
		expectAccept(withFooter({ ...validSite.footer, recentWorks: 'off' }))
		expectAccept(
			withFooter({ ...validSite.footer, recentWorks: works({ count: 1, favorites: 0 }) }),
		)
		expectAccept(
			withFooter({ ...validSite.footer, recentWorks: works({ count: 12, favorites: 12 }) }),
		)
		expectAccept(withFooter({ ...validSite.footer, recentWorks: works({ freshness: 1 }) }))
		expectAccept(withFooter({ ...validSite.footer, recentWorks: works({ freshness: 2.5 }) }))
		expectAccept(withFooter({ ...validSite.footer, recentWorks: works({ freshness: 1000 }) }))
	})

	it('rejects out-of-range, non-integer, extra keys and bare on, and defaults missing keys', () => {
		const reject = (recentWorks: unknown) =>
			expectReject(withFooter({ ...validSite.footer, recentWorks }))
		reject(works({ count: 0 }))
		reject(works({ count: 13 }))
		reject(works({ count: 3.5 }))
		reject(works({ favorites: -1 }))
		reject(works({ favorites: 1.5 }))
		reject(works({ count: 3, favorites: 4 })) // quota above the slot count
		reject(works({ freshness: 0.8 }))
		reject(works({ freshness: 1001 }))
		reject(works({ extra: 1 }))
		reject('on')
		reject({ count: 1 }) // the default favorites quota exceeds the count
		expect(
			parsed(withFooter({ ...validSite.footer, recentWorks: { count: 8 } })).footer
				.recentWorks,
		).toEqual({ count: 8, favorites: 2, freshness: 10 })
	})
})

describe('identity', () => {
	const CONTENT = { locales: ['en', 'ru'], referenceLocale: 'ru' }
	const identity = {
		title: { en: 'Example Photography', ru: 'Пример · Фотография' },
		photoAlt: { en: 'Photograph by Example', ru: 'Фотография Примера' },
		copyright: { holder: { en: 'Example Author', ru: 'Пример Автора' }, since: 2001 },
	}
	const withIdentity = (value: unknown, content: unknown = CONTENT) => ({
		...siteOn(content, {
			menu: {
				...validSite.menu,
				items: [{ segment: 'about', label: { en: 'About', ru: 'Обо мне' } }],
			},
			social: [],
		}),
		identity: value,
	})

	it('accepts a localized title, photo alt and copyright holder with a start year', () => {
		expectAccept(withIdentity(identity))
	})

	it('rejects unknown keys and a malformed start year', () => {
		expectReject(withIdentity({ ...identity, owner: 'x' }))
		for (const since of ['1998', 1998.5, 1500])
			expectReject(withIdentity({ ...identity, copyright: { ...identity.copyright, since } }))
	})

	it('requires every text in every active locale and reports its key path', () => {
		const result = siteSchema.safeParse(
			withIdentity({
				...identity,
				title: { en: 'Example Photography' },
				copyright: { ...identity.copyright, holder: { en: 'Example Author' } },
			}),
		)
		expect(result.error?.issues.map((issue) => issue.path)).toEqual([
			['identity', 'title', 'ru'],
			['identity', 'copyright', 'holder', 'ru'],
		])
	})

	it('needs only the active locale on a one-locale site', () => {
		const ruOnly = {
			title: { ru: 'Пример · Фотография' },
			photoAlt: { ru: 'Фотография Примера' },
			copyright: { holder: { ru: 'Пример Автора' }, since: 2001 },
		}
		expectAccept(withIdentity(ruOnly, { locales: ['ru'], referenceLocale: 'ru' }))
	})
})

describe('social', () => {
	const CONTENT = { locales: ['en', 'ru'], referenceLocale: 'ru' }
	const withSocial = (social: unknown, content: unknown = CONTENT) => ({
		...siteOn(content, {
			identity: IDENTITY_EN_RU,
			menu: {
				...validSite.menu,
				items: [{ segment: 'about', label: { en: 'About', ru: 'Обо мне' } }],
			},
		}),
		social,
	})
	const link = {
		id: 'flickr',
		href: 'https://www.flickr.com/photos/example/',
		label: { en: 'Flickr', ru: 'Flickr' },
		icon: 'flickr',
		hover: '#ff0084',
	}

	it('accepts any network by id and icon name, and an empty list', () => {
		expectAccept(withSocial([link]))
		expectAccept(
			withSocial([{ ...link, id: 'rss', icon: 'rss', href: 'https://example.test/rss.xml' }]),
		)
		expectAccept(withSocial([]))
	})

	it('takes an internal link as a /{lang}/ route template', () => {
		expectAccept(withSocial([{ ...link, id: 'contacts', href: '/{lang}/contacts/' }]))
		expectReject(withSocial([{ ...link, id: 'contacts', href: '/contacts/' }]))
	})

	it('accepts only https for an external link, on any host', () => {
		expectAccept(withSocial([{ ...link, href: 'https://t.me.example.test/x' }]))
		for (const href of ['http://www.flickr.com/', 'javascript:alert(1)', 'flickr.com', ''])
			expectReject(withSocial([{ ...link, href }]))
	})

	it('accepts only a hex hover colour, which lands in an inline style', () => {
		expectAccept(withSocial([{ ...link, hover: '#F08' }]))
		for (const hover of ['red', '#ff0084;color:red', 'var(--x)', '#ff00844'])
			expectReject(withSocial([{ ...link, hover }]))
	})

	it('rejects duplicate ids, unknown keys and icon paths', () => {
		expectReject(withSocial([link, link]))
		expectReject(withSocial([{ ...link, kind: 'flickr' }]))
		expectReject(withSocial([{ ...link, icon: '../flickr' }]))
	})

	it('requires a label for every active locale and reports its key path', () => {
		const result = siteSchema.safeParse(withSocial([{ ...link, label: { en: 'Flickr' } }]))
		expect(result.error?.issues.map((issue) => issue.path)).toEqual([
			['social', 0, 'label', 'ru'],
		])
		expectAccept(
			withSocial([{ ...link, label: { ru: 'Flickr' } }], {
				locales: ['ru'],
				referenceLocale: 'ru',
			}),
		)
	})
})

describe('privacy controller', () => {
	const controller = {
		name: { en: 'Example Person', ru: 'Пример Человека' },
		contact: { kind: 'internal', href: '/{lang}/contacts/' },
	}
	const withPrivacy = (privacy: unknown) => ({ ...validSite, privacy })

	it('rejects incomplete or unknown controller fields', () => {
		expectAccept(withPrivacy({ controller }))
		expectReject(withPrivacy({ controller, extra: true }))
		expectReject(
			withPrivacy({ controller: { ...controller, contact: { kind: 'email', href: 'x' } } }),
		)
	})

	it('requires the controller name and the seo description in exactly the active locales', () => {
		const issues = (site: unknown) =>
			siteSchema
				.safeParse(site)
				.error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
		const oneLocale = siteOn({ locales: ['en'], referenceLocale: 'en' })
		expectAccept(oneLocale)
		expect(
			issues({
				...oneLocale,
				privacy: { controller: controller },
				seo: { description: { ru: 'Описание' } },
			}),
		).toEqual([
			'privacy.controller.name.ru: not one of content.locales [en]',
			'seo.description.ru: not one of content.locales [en]',
			'seo.description.en: missing the "en" text required by content.locales',
		])
	})

	it('shares the localized route validator with the social contacts link', () => {
		const social = [
			{
				id: 'contacts',
				href: '/{lang}/contacts/',
				label: Object.fromEntries(
					validSite.content.locales.map((locale) => [locale, 'Contacts']),
				),
				icon: 'contacts',
				hover: '#5b9a68',
			},
		]
		expectAccept({ ...validSite, social })
		expectReject({ ...validSite, social: [{ ...social[0], href: '/contacts/' }] })
		expectReject(
			withPrivacy({
				controller: { ...controller, contact: { kind: 'internal', href: '/contacts/' } },
			}),
		)
	})
})

// footer.lang shares its modes with menu.lang
describe('footer.lang + footer.social', () => {
	it('accepts every language switcher mode and on | off social', () => {
		for (const lang of LANGUAGE_SWITCHER_MODES) {
			expectAccept(withFooter({ ...validSite.footer, lang }))
		}
		expectAccept(withFooter({ ...validSite.footer, social: 'on' }))
		expectAccept(withFooter({ ...validSite.footer, social: 'off' }))
	})

	it('rejects unknown and boolean values, and defaults missing ones', () => {
		expectReject(withFooter({ ...validSite.footer, lang: 'short' }))
		expectReject(withFooter({ ...validSite.footer, lang: false }))
		expectReject(withFooter({ ...validSite.footer, social: true }))
		expectReject(withFooter({ ...validSite.footer, social: 'hidden' }))
		for (const key of ['lang', 'social'] as const) {
			const footer: Record<string, unknown> = { ...validSite.footer }
			delete footer[key]
			expect(parsed(withFooter(footer)).footer[key]).toBe({ lang: 'code', social: 'on' }[key])
		}
		expectReject(withFooter({ ...validSite.footer, extra: 'on' }))
	})
})

describe('switcherDisplay', () => {
	it('returns the visible mode, or nothing for off and language-neutral pages', () => {
		expect(switcherDisplay('full', false)).toBe('full')
		expect(switcherDisplay('code', false)).toBe('code')
		expect(switcherDisplay('off', false)).toBeUndefined()
		expect(switcherDisplay('full', true)).toBeUndefined()
		expect(switcherDisplay('code', true)).toBeUndefined()
	})
})

describe('photo', () => {
	const withPhoto = (photo: unknown) => ({ ...validSite, photo })

	it('accepts on | off for both toggles', () => {
		for (const dominantStrip of ['on', 'off']) {
			for (const showRelated of ['on', 'off']) {
				expectAccept(withPhoto({ dominantStrip, showRelated }))
			}
		}
	})

	it('is strict and fail-closed', () => {
		expectReject(withPhoto({ dominantStrip: true, showRelated: 'on' }))
		expect(parsed(withPhoto({ dominantStrip: 'off' })).photo).toEqual({
			dominantStrip: 'off',
			showRelated: 'on',
		}) // showRelated defaults
		expectReject(withPhoto({ dominantStrip: 'on', showRelated: 'on', extra: 1 }))
	})
})

// albumList.collapseFrom is the album count at which the list folds on narrow screens
describe('albumList', () => {
	const withList = (albumList: unknown) => ({ ...validSite, albumList })

	it('accepts an integer threshold within range', () => {
		expectAccept(withList({ collapseFrom: 2 }))
		expectAccept(withList({ collapseFrom: 100 }))
	})

	it('is strict and rejects malformed thresholds', () => {
		expectReject(withList({ collapseFrom: 1 }))
		expectReject(withList({ collapseFrom: 101 }))
		expectReject(withList({ collapseFrom: 8.5 }))
		expectReject(withList({ collapseFrom: '8' }))
		expectReject(withList({ collapseFrom: 8, extra: 1 }))
		expect(parsed(withList({})).albumList).toEqual({ collapseFrom: 8 })
	})
})

// contacts.aside is the decorative left-column image
describe('contacts', () => {
	const aside = {
		image: 'square-moon',
		width: 25,
		ratio: 'original',
		frame: 'thick',
		frameColor: 'default',
	}
	const withAside = (patch: Record<string, unknown>) => ({
		...validSite,
		contacts: { aside: { ...aside, ...patch } },
	})

	it('accepts a photo id or off', () => {
		expectAccept(withAside({}))
		expectAccept(withAside({ image: 'off' }))
	})

	it('accepts the width range bounds and rejects values outside it', () => {
		expectAccept(withAside({ width: 20 }))
		expectAccept(withAside({ width: 40 }))
		expectReject(withAside({ width: 19 }))
		expectReject(withAside({ width: 41 }))
		expectReject(withAside({ width: 25.5 }))
		expectReject(withAside({ width: '25' }))
	})

	it('accepts every ratio and frame value', () => {
		for (const ratio of ['original', '1:1', '4:5', '3:4', '2:3', '9:16'])
			expectAccept(withAside({ ratio }))
		for (const frame of ['none', 'thin', 'medium', 'thick']) expectAccept(withAside({ frame }))
		for (const frameColor of ['default', 'alt']) expectAccept(withAside({ frameColor }))
	})

	it('is strict and rejects malformed values', () => {
		expectReject(withAside({ image: 'Bad_Id' }))
		expectReject(withAside({ ratio: 'square' }))
		expectReject(withAside({ ratio: '16:9' }))
		expectReject(withAside({ frame: 'normal' }))
		expectReject(withAside({ frameColor: 'red' }))
		expectReject(withAside({ extra: 1 }))
		expectReject({ ...validSite, contacts: { asideImage: 'square-moon' } })
	})

	it('defaults the aside fields left out', () => {
		expect(parsed({ ...validSite, contacts: { aside: { image: 'square-moon' } } })).toEqual(
			expect.objectContaining({
				contacts: {
					aside: {
						image: 'square-moon',
						width: 34,
						ratio: 'original',
						frame: 'thick',
						frameColor: 'alt',
					},
				},
			}),
		)
		expect(parsed({ ...validSite, contacts: {} }).contacts.aside.image).toBe('off')
	})
})

describe('articles + listing', () => {
	const withArticles = (articles: unknown) => ({ ...validSite, articles })
	const withListing = (listing: unknown) => ({ ...validSite, listing })

	it('accepts both implemented index orders', () => {
		for (const order of ['newest', 'title']) {
			expectAccept(withArticles({ ...validSite.articles, order }))
		}
		expectReject(withArticles({ ...validSite.articles, order: 'modified' })) // the legacy order is not ported
	})

	it('accepts on | off for moreLink', () => {
		for (const value of ['on', 'off'])
			expectAccept(withListing({ ...validSite.listing, moreLink: value }))
		expectReject(withListing({ ...validSite.listing, moreLink: false }))
	})

	// the threshold is an enum of implemented values: each has a static rule in card.css.
	it('accepts only the implemented excerpt breakpoints', () => {
		for (const threshold of ['off', 480, 768, 1024]) {
			expectAccept(withListing({ ...validSite.listing, excerptHiddenBelow: threshold }))
		}
		expectReject(withListing({ ...validSite.listing, excerptHiddenBelow: 600 })) // no CSS rule
		expectReject(withListing({ ...validSite.listing, excerptHiddenBelow: '768' }))
		expectReject(withListing({ ...validSite.listing, excerptHiddenBelow: true }))
	})

	it('is fail-closed: rejects unknown keys and defaults missing fields', () => {
		expectReject(withArticles({ ...validSite.articles, extra: 1 }))
		expectReject(withListing({ ...validSite.listing, extra: 1 }))
		expect(parsed(withArticles({ order: 'title' })).articles).toEqual({ order: 'title' })
		expect(parsed(withArticles({})).articles).toEqual({ order: 'newest' })
		expect(parsed(withListing({ moreLink: 'on' })).listing).toEqual({
			excerptHiddenBelow: 768,
			moreLink: 'on',
		})
	})
})

describe('moreDocs', () => {
	it('accepts conditional layout and source fields', () => {
		expectAccept(
			withMoreDocs({
				...validSite.moreDocs,
				article: {
					...validSite.moreDocs.article,
					layout: 'grid',
					columns: 2,
					gap: 16,
					ratio: 'square',
					card: 'details',
				},
				page: {
					...validSite.moreDocs.page,
					layout: 'list',
					columns: undefined,
					gap: undefined,
					media: 'off',
					ratio: undefined,
					card: 'details',
				},
			}),
		)
	})

	it('requires gap for grid and masonry and forbids it for a list', () => {
		const grid = {
			source: 'siblings',
			layout: 'grid',
			columns: 3,
			gap: 16,
			width: 'medium',
			heading: 'on',
			media: 'on',
			ratio: 'landscape',
			excerpt: 'on',
			card: 'details',
			order: 'newest',
			limit: 'all',
		}
		const withArticle = (article: Record<string, unknown>) =>
			withMoreDocs({ ...validSite.moreDocs, article })
		expectAccept(withArticle(grid))
		const { gap: _gap, ...noGap } = grid
		void _gap
		expectReject(withArticle(noGap))
		expectReject(withArticle({ ...grid, gap: 65 }))
		const { columns: _columns, ...list } = { ...grid, layout: 'list' }
		void _columns
		expectReject(withArticle(list))
		const { gap: _listGap, ...listNoGap } = list
		void _listGap
		expectAccept(withArticle(listNoGap))
	})

	it('rejects invalid conditional combinations and unsupported newest order', () => {
		expectReject(
			withMoreDocs({
				...validSite.moreDocs,
				article: { ...validSite.moreDocs.article, columns: 0 },
			}),
		)
		expectReject(
			withMoreDocs({
				...validSite.moreDocs,
				article: { ...validSite.moreDocs.article, layout: 'list', columns: 2 },
			}),
		)
		expectReject(
			withMoreDocs({
				...validSite.moreDocs,
				article: { ...validSite.moreDocs.article, media: 'off', ratio: 'landscape' },
			}),
		)
		expectReject(
			withMoreDocs({
				...validSite.moreDocs,
				page: { ...validSite.moreDocs.page, source: 'siblings', order: 'newest', limit: 3 },
			}),
		)
		// the course block is the courses module's (modules.courses.moreDocs)
		expectReject(withMoreDocs({ ...validSite.moreDocs, course: validSite.moreDocs.page }))
		expectReject(
			withMoreDocs({
				...validSite.moreDocs,
				page: { ...validSite.moreDocs.page, source: 'off', order: 'title' },
			}),
		)
	})
})

// compact looks need grid or masonry, media and no excerpt, while details takes every combination;
// the fixture is built here and the shipped values are not pinned
describe('moreDocs card', () => {
	const grid = {
		source: 'siblings',
		layout: 'grid',
		columns: 3,
		gap: 16,
		width: 'medium',
		heading: 'on',
		media: 'on',
		ratio: 'landscape',
		excerpt: 'off',
		card: 'title-slide',
		order: 'newest',
		limit: 'all',
	}
	const withArticle = (article: Record<string, unknown>) =>
		withMoreDocs({ ...validSite.moreDocs, article })

	it('accepts every presentation on grid and compact ones on masonry', () => {
		for (const card of CARD_PRESENTATIONS) {
			expectAccept(withArticle({ ...grid, card }))
		}
		expectAccept(withArticle({ ...grid, layout: 'masonry', ratio: 'original' }))
		expectAccept(withArticle({ ...grid, card: 'details', excerpt: 'on' }))
	})

	it('rejects compact looks on a list, with an excerpt or without media', () => {
		for (const card of ['title-strip', 'title-slide']) {
			const compact = { ...grid, card }
			const { columns: _columns, ...list } = { ...compact, layout: 'list' }
			void _columns
			expectReject(withArticle(list))
			expectReject(withArticle({ ...compact, excerpt: 'on' }))
			const { ratio: _ratio, ...noMedia } = { ...compact, media: 'off' }
			void _ratio
			expectReject(withArticle(noMedia))
		}
	})

	it('rejects a missing or unknown presentation', () => {
		const { card: _omit, ...missing } = grid
		void _omit
		expectReject(withArticle(missing))
		expectReject(withArticle({ ...grid, card: 'overlay' }))
	})
})

// the shipped value is not pinned
describe('portfolio.card', () => {
	it('accepts exactly the three presentations', () => {
		for (const card of CARD_PRESENTATIONS) {
			expectAccept(withPortfolio({ ...validSite.portfolio, card, excerpt: 'off' }))
		}
	})

	// as in moreDocs: details takes on | off, the compact looks only off
	it('allows the excerpt only with details', () => {
		expectAccept(withPortfolio({ ...validSite.portfolio, card: 'details', excerpt: 'on' }))
		expectAccept(withPortfolio({ ...validSite.portfolio, card: 'details', excerpt: 'off' }))
		for (const card of ['title-strip', 'title-slide']) {
			const result = siteSchema.safeParse(
				withPortfolio({ ...validSite.portfolio, card, excerpt: 'on' }),
			)
			expect(result.success).toBe(false)
			expect(result.error?.issues[0]?.path).toEqual(['portfolio', 'excerpt'])
		}
		expectReject(withPortfolio({ ...validSite.portfolio, excerpt: true }))
		// the default excerpt is on, which a compact look forbids
		const withoutExcerpt: Record<string, unknown> = { ...validSite.portfolio }
		delete withoutExcerpt.excerpt
		expectReject(withPortfolio({ ...withoutExcerpt, card: 'title-strip' }))
	})

	it('rejects unknown, boolean values and extra keys, and defaults a missing one', () => {
		expectReject(withPortfolio({ ...validSite.portfolio, card: 'overlay' }))
		expectReject(withPortfolio({ ...validSite.portfolio, card: true }))
		const { card: _omit, ...withoutPresentation } = validSite.portfolio
		void _omit
		expect(parsed(withPortfolio(withoutPresentation)).portfolio.card).toBe('details')
		expectReject(withPortfolio({ ...validSite.portfolio, extra: 'details' }))
	})
})

// the fixture is built here and the shipped values are not pinned
describe('portfolio.layout (mode selector + settings matrix)', () => {
	const grid = { columns: 3, gap: 16, ratio: 'vista' }

	it('accepts every implemented mode and keeps the inactive block', () => {
		for (const layout of PORTFOLIO_LAYOUTS) {
			expectAccept(withPortfolio({ ...validSite.portfolio, layout, grid }))
		}
		const parsed = siteSchema.parse(
			withPortfolio({ ...validSite.portfolio, layout: 'masonry', grid }),
		)
		expect(parsed.portfolio.grid).toEqual(grid)
	})

	it('rejects unimplemented modes and bad grid settings, and defaults a missing block', () => {
		expectReject(withPortfolio({ ...validSite.portfolio, layout: 'square' }))
		expectReject(withPortfolio({ ...validSite.portfolio, layout: 'justified' }))
		const withoutGrid: Record<string, unknown> = { ...validSite.portfolio }
		delete withoutGrid.grid
		expect(parsed(withPortfolio(withoutGrid)).portfolio.grid).toEqual({
			columns: 3,
			gap: 16,
			ratio: 'vista',
		})
		for (const ratio of CARD_GRID_RATIOS) {
			expectAccept(withPortfolio({ ...validSite.portfolio, grid: { ...grid, ratio } }))
		}
		expectReject(
			withPortfolio({ ...validSite.portfolio, grid: { ...grid, ratio: 'original' } }),
		)
		expectReject(withPortfolio({ ...validSite.portfolio, grid: { ...grid, columns: 0 } }))
		expectReject(withPortfolio({ ...validSite.portfolio, grid: { ...grid, columns: 7 } }))
		expectReject(withPortfolio({ ...validSite.portfolio, grid: { ...grid, gap: 65 } }))
		expectReject(withPortfolio({ ...validSite.portfolio, grid: { ...grid, extra: 1 } }))
	})

	it('enforces masonry numeric bounds (inclusive edges accepted, just-outside rejected)', () => {
		expectAccept(withMasonry({ minColumnWidth: 300, gap: 16, maxColumns: 5 }))
		expectAccept(withMasonry({ minColumnWidth: 160, gap: 0, maxColumns: 1 })) // lower edges
		expectAccept(withMasonry({ minColumnWidth: 640, gap: 64, maxColumns: 8 })) // upper edges
		expectReject(withMasonry({ minColumnWidth: 159, gap: 16, maxColumns: 5 })) // < 160
		expectReject(withMasonry({ minColumnWidth: 641, gap: 16, maxColumns: 5 })) // > 640
		expectReject(withMasonry({ minColumnWidth: 300, gap: 65, maxColumns: 5 })) // > 64
		expectReject(withMasonry({ minColumnWidth: 300, gap: -1, maxColumns: 5 }))
		expectReject(withMasonry({ minColumnWidth: 300, gap: 16, maxColumns: 0 }))
		expectReject(withMasonry({ minColumnWidth: 300, gap: 16, maxColumns: 9 })) // > 8
		expectReject(withMasonry({ minColumnWidth: 300.5, gap: 16, maxColumns: 5 })) // non-int
		expectReject(withMasonry({ minColumnWidth: 300, gap: 16, maxColumns: 5, extra: 1 })) // strict
	})
})

// the fixture is built here; the shipped site.yaml values, including the owner-tuned targetRowHeight,
// are not pinned
describe('album.layout (mode selector + settings matrix)', () => {
	const matrix = {
		layout: 'justified',
		justified: { targetRowHeight: 200, gap: 10, tolerance: 0.3 },
		masonry: { minColumnWidth: 280, gap: 14, maxColumns: 4 },
		square: { columns: 3, gap: 8, minColumns: 1 },
		rect: { columns: 5, gap: 6, minColumns: 2 },
	}

	it('accepts every implemented mode as the selector', () => {
		for (const layout of ALBUM_LAYOUTS) expectAccept(withAlbum({ ...matrix, layout }))
	})

	it('rejects modes without a renderer and extra keys, and defaults missing blocks', () => {
		// a mode without a renderer is rejected even when its settings block is present
		expectReject(withAlbum({ ...matrix, layout: 'slider' }))
		expectReject(withAlbum({ ...matrix, fullscreen: { columns: 1 } }))
		for (const mode of ['square', 'rect'] as const) {
			const withoutMode: Record<string, unknown> = { ...matrix }
			delete withoutMode[mode]
			expect(parsed(withAlbum(withoutMode)).album[mode]).toEqual({
				columns: 4,
				gap: 12,
				minColumns: 2,
			})
		}
		// the two masonry blocks share bounds but not defaults
		expect(parsed(withAlbum({ layout: 'masonry' })).album.masonry.gap).toBe(12)
		expect(parsed(withPortfolio({})).portfolio.masonry.gap).toBe(16)
		expectReject(withAlbum({ ...matrix, extra: 1 }))
	})

	it('reports the exact path of an invalid settings block', () => {
		const result = siteSchema.safeParse(
			withAlbum({ ...matrix, justified: { ...matrix.justified, gap: 99 } }),
		)
		expect(result.success).toBe(false)
		expect(result.error?.issues[0]?.path).toEqual(['album', 'justified', 'gap'])
	})

	it('bounds the crop grid: columns 1..6, minColumns 1 | 2 and never above columns', () => {
		const square = (overrides: Record<string, unknown>) =>
			withAlbum({ ...matrix, square: { ...matrix.square, ...overrides } })
		expectAccept(square({ columns: 1, minColumns: 1 }))
		expectAccept(square({ columns: 6, minColumns: 2 }))
		expectReject(square({ columns: 0 }))
		expectReject(square({ columns: 7 }))
		expectReject(square({ minColumns: 3 }))
		expectReject(square({ minColumns: 0 }))
		expectReject(square({ columns: 1, minColumns: 2 }))
		expectReject(square({ gap: 65 }))
		expectReject(square({ extra: 1 }))
		expectReject(withAlbum({ ...matrix, rect: { ...matrix.rect, minColumns: 3 } }))
	})

	it('validates an inactive block too, so a typo surfaces before switching', () => {
		const result = siteSchema.safeParse(
			withAlbum({ ...matrix, masonry: { ...matrix.masonry, maxColumns: 0 } }),
		)
		expect(result.success).toBe(false)
		expect(result.error?.issues[0]?.path).toEqual(['album', 'masonry', 'maxColumns'])
	})

	it('switching the selector back and forth keeps every block byte-equivalent', () => {
		const toMasonry = siteSchema.parse(withAlbum({ ...matrix, layout: 'masonry' })).album
		const back = siteSchema.parse(withAlbum({ ...toMasonry, layout: 'justified' })).album
		expect(back).toEqual(matrix)
	})

	it('parses without mutating or rewriting the stored blocks', () => {
		const input = structuredClone(matrix)
		const parsed = siteSchema.parse(withAlbum(input)).album
		expect(input).toEqual(matrix)
		expect(parsed).toEqual(matrix)
	})

	it('enforces justified numeric bounds (inclusive edges accepted, just-outside rejected)', () => {
		expectAccept(withJustified({ targetRowHeight: 240, gap: 12, tolerance: 0.25 }))
		expectAccept(withJustified({ targetRowHeight: 80, gap: 0, tolerance: 0 })) // lower edges
		expectAccept(withJustified({ targetRowHeight: 640, gap: 64, tolerance: 1 })) // upper edges
		expectReject(withJustified({ targetRowHeight: 79, gap: 12, tolerance: 0.25 })) // < 80
		expectReject(withJustified({ targetRowHeight: 641, gap: 12, tolerance: 0.25 })) // > 640
		expectReject(withJustified({ targetRowHeight: 240, gap: 12, tolerance: 1.5 })) // > 1
		expectReject(withJustified({ targetRowHeight: 240, gap: 12, tolerance: -0.1 }))
		expectReject(withJustified({ targetRowHeight: 240.5, gap: 12, tolerance: 0.25 })) // non-int
		expectReject(withJustified({ targetRowHeight: 240, gap: 12, tolerance: 0.25, extra: 1 })) // strict
	})
})

describe('viewer (PhotoSwipe options)', () => {
	it('accepts the test-built viewer config', () => {
		expectAccept(validSite)
	})

	it('rejects an unknown showHideAnimationType', () => {
		expectReject(withViewer({ ...validSite.viewer, showHideAnimationType: 'slide' }))
	})

	it('enforces duration and bgOpacity bounds', () => {
		expectReject(withViewer({ ...validSite.viewer, showAnimationDuration: -1 }))
		expectReject(withViewer({ ...validSite.viewer, showAnimationDuration: 5001 }))
		expectReject(withViewer({ ...validSite.viewer, bgOpacity: 1.5 }))
		expectAccept(withViewer({ ...validSite.viewer, bgOpacity: 0 }))
	})

	it('accepts on/off chrome toggles and off or in-range idle / slideSpring', () => {
		for (const key of ['counter', 'fullscreen', 'moreInfo', 'copyright']) {
			expectAccept(withViewer({ ...validSite.viewer, [key]: 'on' }))
			expectAccept(withViewer({ ...validSite.viewer, [key]: 'off' }))
			expectReject(withViewer({ ...validSite.viewer, [key]: true }))
		}
		expectAccept(withViewer({ ...validSite.viewer, idle: 'off' }))
		expectAccept(withViewer({ ...validSite.viewer, idle: 500 }))
		expectAccept(withViewer({ ...validSite.viewer, idle: 60000 }))
		expectReject(withViewer({ ...validSite.viewer, idle: 499 }))
		expectReject(withViewer({ ...validSite.viewer, idle: 60001 }))
		expectReject(withViewer({ ...validSite.viewer, idle: 'on' }))
		expectAccept(withViewer({ ...validSite.viewer, slideSpring: 'off' }))
		expectAccept(withViewer({ ...validSite.viewer, slideSpring: 5 }))
		expectAccept(withViewer({ ...validSite.viewer, slideSpring: 60 }))
		expectReject(withViewer({ ...validSite.viewer, slideSpring: 4 }))
		expectReject(withViewer({ ...validSite.viewer, slideSpring: 20.5 }))
	})

	it('is fail-closed: rejects unknown keys and defaults missing fields', () => {
		expectReject(withViewer({ ...validSite.viewer, extra: true }))
		const withoutEasing = { ...validSite.viewer }
		delete (withoutEasing as { easing?: string }).easing
		expect(parsed(withViewer(withoutEasing)).viewer.easing).toBe(
			'cubic-bezier(0.4, 0, 0.22, 1)',
		)
	})
})

describe('layout (content widths)', () => {
	it('enforces integer bounds', () => {
		expectAccept(withLayout({ prose: 320, medium: 600, standard: 600, gallery: 2560 })) // edges
		expectReject(withLayout({ prose: 319, medium: 960, standard: 1200, gallery: 1440 })) // below prose min
		expectReject(withLayout({ prose: 1201, medium: 1300, standard: 1300, gallery: 1440 })) // above prose max
		expectReject(withLayout({ prose: 680, medium: 599, standard: 1200, gallery: 1440 })) // below medium min
		expectReject(withLayout({ prose: 680, medium: 960, standard: 1601, gallery: 1700 })) // above standard max
		expectReject(withLayout({ prose: 680, medium: 960, standard: 1200, gallery: 599 })) // below gallery min
		expectReject(withLayout({ prose: 680, medium: 960, standard: 1200, gallery: 2561 })) // above gallery max
		expectReject(withLayout({ prose: 680.5, medium: 960, standard: 1200, gallery: 1440 })) // non-int
	})

	// otherwise the reading, document or index container could outgrow the next tier
	it('enforces prose ≤ medium ≤ standard ≤ gallery', () => {
		expectAccept(withLayout({ prose: 1000, medium: 1000, standard: 1000, gallery: 1000 })) // equality is fine
		expectReject(withLayout({ prose: 1001, medium: 1000, standard: 1200, gallery: 1440 }))
		expectReject(withLayout({ prose: 680, medium: 1201, standard: 1200, gallery: 1440 }))
		expectReject(withLayout({ prose: 680, medium: 960, standard: 1441, gallery: 1440 }))
	})

	it('is fail-closed: rejects unknown keys and defaults missing fields', () => {
		expectReject(
			withLayout({ prose: 680, medium: 960, standard: 1200, gallery: 1440, extra: 1 }),
		)
		expect(parsed(withLayout({ prose: 600, medium: 900, gallery: 1440 })).layout).toEqual({
			prose: 600,
			medium: 900,
			standard: 1200,
			gallery: 1440,
		})
		// a default takes part in the tier order like a written value
		expectReject(withLayout({ gallery: 1100 }))
	})
})

describe('banners (per-surface assignment)', () => {
	// the surface set is a code contract, since each has a consuming page; the picks are editorial and
	// change, so only the keys are pinned
	it('requires an assignment slot for every banner surface', () => {
		expect(
			Object.keys(siteSchema.in.shape.banners.unwrap().shape.surfaces.unwrap().shape).sort(),
		).toEqual(['articlesIndex', 'contacts', 'portfolioIndex'])
	})

	it('accepts off or a photo id per surface', () => {
		expectAccept(withSurfaceBanner('contacts', 'off'))
		expectAccept(withSurfaceBanner('contacts', 'morning-ridge'))
	})

	// a malformed id would silently turn into a missing banner
	it('rejects malformed photo ids and non-strings', () => {
		expectReject(withSurfaceBanner('contacts', 'Morning-Ridge')) // not kebab-case
		expectReject(withSurfaceBanner('contacts', 'good--morning')) // double hyphen
		expectReject(withSurfaceBanner('contacts', '-ridge')) // leading hyphen
		expectReject(withSurfaceBanner('contacts', ''))
		expectReject(withSurfaceBanner('contacts', true))
		expectReject(withBanners({ ...validSite.banners, documents: { about: 'About' } }))
	})

	it('is fail-closed: rejects unknown surfaces and defaults missing ones to off', () => {
		expectReject(withSurfaceBanner('photoPage', 'off')) // the photo page has no banner
		expect(
			parsed(withBanners({ surfaces: { portfolioIndex: 'quiet-light' } })).banners.surfaces,
		).toEqual({
			portfolioIndex: 'quiet-light',
			articlesIndex: 'off',
			contacts: 'off',
		})
		// `banners.documents` is gone (ADR-0013): a document's cover lives in its content
		expectReject(withBanners({ ...validSite.banners, documents: {} }))
		expectReject(withBanners({ ...validSite.banners, extra: 1 }))
	})
})

describe('surfaces (per-surface layout contract)', () => {
	// each surface's width and layout are the owner's choice; the code contract is that every routed
	// collection has an entry
	it('requires a layout for every routed collection surface', () => {
		expect(Object.keys(siteSchema.in.shape.surfaces.unwrap().shape).sort()).toEqual([
			'album',
			'articlesIndex',
			'portfolioIndex',
		])
	})

	// width and kind are independent: any width works with any layout the surface implements
	it('accepts either width with every layout the surface implements', () => {
		for (const width of ['prose', 'medium', 'standard', 'gallery']) {
			for (const [kind, ratio] of [
				['masonry', 'original'],
				['list', 'vista'],
				['grid', 'landscape'],
			]) {
				expectAccept(withSurface('articlesIndex', { width, kind, ratio }))
			}
			expectAccept(withSurface('portfolioIndex', { width }))
			expectAccept(withSurface('album', { width }))
		}
	})

	// the config must not accept a value the runtime silently ignores (as with `portfolio.layout` and
	// `album.layout`)
	it('rejects layouts the surface does not implement', () => {
		// the album keeps only a width: `album.layout` is the only mode selector
		expectReject(withSurface('album', { width: 'gallery', kind: 'justified' }))
		// likewise `portfolio.layout` for the Portfolio index
		expectReject(withSurface('portfolioIndex', { width: 'gallery', kind: 'masonry' }))
		expectReject(withSurface('articlesIndex', { width: 'gallery', kind: 'justified' }))
		// the courses index surface is the courses module's (modules.courses.surface)
		expectReject(withSurface('coursesIndex', { width: 'prose', kind: 'list', ratio: 'vista' }))
	})

	// the moreDocs rules: masonry if and only if original, and no index without a ratio
	it('ties the card ratio to the layout', () => {
		expectReject(
			withSurface('articlesIndex', { width: 'prose', kind: 'list', ratio: 'original' }),
		)
		expectReject(
			withSurface('articlesIndex', { width: 'standard', kind: 'masonry', ratio: 'vista' }),
		)
		// a default ratio is tied to the layout like a written one
		expectReject(withSurface('articlesIndex', { kind: 'grid' }))
		expectReject(withSurface('articlesIndex', { width: 'prose', kind: 'list', ratio: 'wide' }))
	})

	// `standard` (1200) is a valid width for card indexes (ADR-0008 addendum of 2026-09-09): they hold
	// cards, not running text, so the prose readability cap does not apply
	it('accepts the standard width and rejects unknown kinds', () => {
		expectAccept(withSurface('album', { width: 'standard' }))
		expectAccept(
			withSurface('articlesIndex', { width: 'standard', kind: 'masonry', ratio: 'original' }),
		)
		expectReject(
			withSurface('articlesIndex', { width: 'gallery', kind: 'carousel', ratio: 'original' }),
		)
	})

	it('is fail-closed: rejects unknown keys and defaults missing fields and surfaces', () => {
		expectReject(withSurface('album', { width: 'gallery', extra: 1 }))
		expect(parsed(withSurface('album', {})).surfaces.album).toEqual({ width: 'gallery' })
		expectReject(
			withSurfaces({
				...validSite.surfaces,
				extra: { width: 'prose', kind: 'list', ratio: 'vista' },
			}),
		)
		const withoutAlbum = { ...validSite.surfaces }
		delete (withoutAlbum as { album?: unknown }).album
		expect(parsed(withSurfaces(withoutAlbum)).surfaces.album).toEqual({ width: 'gallery' })
		expect(
			parsed(withSurface('articlesIndex', { kind: 'grid', ratio: 'vista' })).surfaces
				.articlesIndex,
		).toEqual({ width: 'standard', kind: 'grid', ratio: 'vista' })
	})
})
