import { REQUIRED_DENIED_FIELDS } from '../images-schema.ts'
import { DEFAULT_LOCALE_CATALOG, effectiveCatalog, type Locale } from '../locale-schema.ts'
import type { SiteConfig } from '../site-schema.ts'
import { taxonomyConfigSchema } from '../taxonomy.ts'

// a complete, valid site config built for tests; it never follows the real site.yaml, so a test that
// needs a whole config takes this and overrides only the fields it is about
export function buildSiteConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
	return { ...structuredClone(SITE_CONFIG), ...overrides }
}

// the `content` section a site.yaml with these locales and no catalog or taxonomy resolves to
export const contentConfig = (
	locales: [Locale, ...Locale[]],
	referenceLocale: Locale,
): SiteConfig['content'] => ({
	locales,
	referenceLocale,
	catalog: effectiveCatalog(locales, {}),
	taxonomy: taxonomyConfigSchema.parse({}),
})

const SITE_CONFIG: SiteConfig = {
	schemaVersion: 4,
	origin: 'https://site.test',
	identity: {
		title: {
			en: 'Example Photography',
			ru: 'Пример · Фотография',
		},
		photoAlt: {
			en: 'Photograph by Example',
			ru: 'Фотография Примера',
		},
		copyright: {
			holder: {
				en: 'Example Author',
				ru: 'Пример Автора',
			},
			since: 2001,
		},
	},
	content: contentConfig(['en', 'ru'], 'ru'),
	factcheck: {
		ownHosts: ['old-site.test'],
	},
	privacy: {
		controller: {
			name: {
				en: 'Example Author',
				ru: 'Пример Автора',
			},
			contact: {
				kind: 'internal',
				href: '/{lang}/contacts/',
			},
		},
	},
	theme: {
		default: 'dark',
		toggleVisible: true,
		favicon: {
			background: '#1b1b1f',
			foreground: '#fcbf00',
		},
	},
	hero: {
		galleryAccent: 'accent',
	},
	menu: {
		animate: 'word-slide-in',
		width: 'adaptive',
		minWidth: 'standard',
		lang: 'code',
		theme: 'sun',
		logoSize: 0.5,
		topLogoSize: 0.2,
		topLogoSticky: 'off',
		sticky: 'on',
		stickyFade: 0.9,
		sectionIcon: 'off',
		sectionIconSwap: 'on',
		items: [
			{
				segment: 'portfolio',
				label: {
					en: 'Portfolio',
					ru: 'Портфолио',
				},
				icon: ['image', 'grid'],
			},
			{
				segment: 'articles',
				label: {
					en: 'Articles',
					ru: 'Статьи',
				},
				icon: ['bookmark', 'text'],
			},
			{
				segment: 'courses',
				label: {
					en: 'Courses',
					ru: 'Курсы',
				},
			},
			{
				segment: 'about',
				label: {
					en: 'About',
					ru: 'О себе',
				},
				icon: 'person',
			},
			{
				segment: 'contacts',
				label: {
					en: 'Contacts',
					ru: 'Контакты',
				},
				icon: 'mail',
			},
		],
	},
	slider: {
		speed: 1000,
		autoplayDelay: 15000,
		truncateBudget: 400,
	},
	social: [
		{
			id: 'telegram',
			href: 'https://t.me/example',
			label: {
				en: 'Telegram',
				ru: 'Telegram',
			},
			icon: 'telegram',
			hover: '#229ed9',
		},
		{
			id: 'contacts',
			href: '/{lang}/contacts/',
			label: {
				en: 'Contacts',
				ru: 'Контакты',
			},
			icon: 'contacts',
			hover: '#5b9a68',
		},
	],
	topSection: {
		parallax: true,
		shadow: true,
		blur: 'off',
		pattern: 'off',
		shade: {
			mode: 'mono',
			monoOpacity: 30,
			tintOpacity: 45,
		},
		accent: {
			album: 'accent',
			section: 'alt',
		},
		titleReveal: 'fade',
	},
	footer: {
		columns: 3,
		curve: {
			shape: 'downright',
			height: 100,
		},
		quote: 'on',
		lang: 'code',
		social: 'on',
		recentWorks: {
			count: 6,
			favorites: 2,
			freshness: 10,
		},
	},
	articles: {
		order: 'newest',
	},
	modules: {
		courses: {
			order: 'title',
			currentFirst: 'on',
			moreDocs: {
				source: 'siblings',
				layout: 'list',
				width: 'medium',
				heading: 'on',
				media: 'on',
				excerpt: 'on',
				card: 'details',
				ratio: 'vista',
				order: 'title',
				limit: 'all',
			},
			surface: {
				width: 'standard',
				kind: 'list',
				ratio: 'vista',
			},
			banner: 'valley-fog',
		},
	},
	moreDocs: {
		article: {
			source: 'siblings',
			layout: 'grid',
			width: 'medium',
			heading: 'on',
			media: 'on',
			excerpt: 'on',
			card: 'details',
			ratio: 'vista',
			columns: 3,
			gap: 16,
			order: 'newest',
			limit: 'all',
		},
		page: {
			source: 'off',
			layout: 'list',
			width: 'medium',
			heading: 'off',
			media: 'on',
			excerpt: 'on',
			card: 'details',
			ratio: 'landscape',
		},
	},
	listing: {
		excerptHiddenBelow: 768,
		moreLink: 'off',
	},
	layout: {
		prose: 680,
		medium: 960,
		standard: 1200,
		gallery: 1440,
	},
	surfaces: {
		portfolioIndex: {
			width: 'gallery',
		},
		album: {
			width: 'gallery',
		},
		articlesIndex: {
			width: 'standard',
			kind: 'masonry',
			ratio: 'original',
		},
	},
	banners: {
		surfaces: {
			portfolioIndex: 'quiet-light',
			articlesIndex: 'harbor-sunrise',
			contacts: 'still-symmetry',
		},
	},
	portfolio: {
		layout: 'masonry',
		card: 'details',
		excerpt: 'on',
		masonry: {
			minColumnWidth: 300,
			gap: 16,
			maxColumns: 5,
		},
		grid: {
			columns: 3,
			gap: 16,
			ratio: 'vista',
		},
	},
	albumList: {
		collapseFrom: 8,
	},
	album: {
		layout: 'justified',
		justified: {
			targetRowHeight: 160,
			gap: 12,
			tolerance: 0.25,
		},
		masonry: {
			minColumnWidth: 300,
			gap: 12,
			maxColumns: 5,
		},
		square: {
			columns: 4,
			gap: 12,
			minColumns: 2,
		},
		rect: {
			columns: 4,
			gap: 12,
			minColumns: 2,
		},
	},
	photo: {
		dominantStrip: 'on',
		showRelated: 'on',
	},
	contacts: {
		aside: {
			image: 'square-moon',
			width: 34,
			ratio: 'original',
			frame: 'thick',
			frameColor: 'alt',
		},
	},
	viewer: {
		showHideAnimationType: 'zoom',
		showAnimationDuration: 800,
		hideAnimationDuration: 800,
		zoomAnimationDuration: 800,
		loop: true,
		bgOpacity: 1,
		easing: 'cubic-bezier(0.4, 0, 0.22, 1)',
		counter: 'off',
		fullscreen: 'on',
		moreInfo: 'on',
		copyright: 'on',
		idle: 4000,
		slideSpring: 20,
	},
	seo: {
		description: {
			en: 'Photographs by Example.',
			ru: 'Фотографии Примера.',
		},
	},
	images: {
		publicPath: '/media',
		formats: ['avif', 'webp'],
		archive: { ignoreDirs: [] },
		rights: {
			copyright: '© Example Author',
			credit: 'Example Author',
			licensor: 'Example Author',
			source: 'site.test',
			webStatement: 'https://site.test/rights/',
			imageId: 'example',
		},
		privacy: { deniedFields: [...REQUIRED_DENIED_FIELDS] },
		watermark: {
			aboveWidth: 800,
			assets: [{ id: 'example-mark', file: 'src/assets/mark.png', sha256: 'a'.repeat(64) }],
			profile: {
				id: 'watermark',
				assetId: 'example-mark',
				scale: 0.2,
				minPx: 96,
				maxPx: 384,
				position: 'bottom-right',
				inset: 24,
				opacity: 0.8,
			},
		},
		ladder: {
			widths: [400, 800, 1200],
			native: { enabled: false, maxLongSide: 2000 },
			quality: [{ avif: 50, webp: 72 }],
		},
	},
}

const isLocalizedText = (value: object): boolean =>
	Object.keys(value).length > 0 &&
	Object.entries(value).every(
		([key, text]) => Object.hasOwn(DEFAULT_LOCALE_CATALOG, key) && typeof text === 'string',
	)

// a config (or any part of one) whose texts keep only `locales`, as a site with those
// `content.locales` writes it; the locale list itself is left to the caller
export function keepLocales<T>(value: T, locales: readonly string[]): T {
	if (Array.isArray(value)) return value.map((item: unknown) => keepLocales(item, locales)) as T
	if (value === null || typeof value !== 'object') return value
	if (isLocalizedText(value))
		return Object.fromEntries(
			Object.entries(value).filter(([locale]) => locales.includes(locale)),
		) as T
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, keepLocales(item, locales)]),
	) as T
}
