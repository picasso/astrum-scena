import { z } from 'astro/zod'

import {
	dependencyIssues,
	disabledMenuSegmentIssues,
	MODULE_IDS,
	MODULES,
} from '../modules/registry.ts'
import { bannersSchema } from './banners.ts'
import {
	articlesOrderSchema,
	documentSurfaceSchema,
	moreDocsConfigSchema,
	surfaceWidthSchema,
} from './document-schemas.ts'
import { deriveImageRights, imageConfigSchema, type ImageRights } from './images-schema.ts'
import { LANGUAGE_SWITCHER_MODES } from './language-switcher.ts'
import { layoutSchema } from './layout.ts'
import {
	catalogIssues,
	effectiveCatalog,
	type Locale,
	localeCatalogEntrySchema,
	localeCodeSchema,
} from './locale-schema.ts'
import { type LocalizedLabel, localizedLabelSchema } from './localized-label.ts'
import { isLocalizedRouteTemplate } from './localized-route.ts'
import { localeCoverageIssues } from './localized-text.ts'
import { iconNameSchema, menuSchema } from './menu.ts'
import { privacySchema } from './privacy.ts'
import { seoSchema } from './seo-schema.ts'
import { taxonomyConfigSchema } from './taxonomy.ts'
import {
	ALBUM_LAYOUTS,
	CARD_GRID_RATIOS,
	CARD_PRESENTATIONS,
	FOOTER_CURVE_SHAPES,
	PORTFOLIO_LAYOUTS,
} from './variants.ts'

// schema of site.yaml and of the `site` of its lock, free of side effects so plain Node can load it;
// src/config/lock.ts resolves the one into the other and src/config/loader.ts reads the lock. z comes
// from `astro/zod` (repo convention) so the schema also runs under vitest, where the virtual
// `astro:schema` does not resolve.
// The YAML 1.2 core schema parses `off` as the string "off", not a boolean, so 'off' below is a string
// literal in enums and unions.

// a social link (footer and home overlay): `id` names the `social-icon--<id>` modifier,
// `icon` an svg in src/assets/icons/social, `hover` the brand colour of the circle on hover. `href` is
// an https URL (opened in a new tab) or a `/{lang}/…` route template resolved per locale.
const socialHrefSchema = z
	.string()
	.refine(
		(value) =>
			isLocalizedRouteTemplate(value) ||
			(URL.canParse(value) && new URL(value).protocol === 'https:'),
		{ message: 'href must be an https URL or a /{lang}/ route template' },
	)

const socialSchema = z
	.object({
		id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
			message: 'expected an id such as `telegram`',
		}),
		href: socialHrefSchema,
		label: localizedLabelSchema,
		icon: iconNameSchema,
		// a hex colour only: the value lands in an inline style attribute
		hover: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
			message: 'expected a hex colour such as #229ed9',
		}),
	})
	.strict()

export type SocialLink = z.infer<typeof socialSchema>

// a CSS color the core writes where no theme token reaches (the favicon is a separate SVG document): a
// hex color or a color function of plain numbers, so the value cannot close the attribute it lands in
const cssColorSchema = z
	.string()
	.regex(
		/^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([0-9a-z.%+\-\s,/]*\))$/,
		{ message: 'expected a CSS color such as #1b1b1f or oklch(0.2 0.01 280)' },
	)

const socialListSchema = z.array(socialSchema).superRefine((links, context) => {
	const seen = new Set<string>()
	links.forEach((link, index) => {
		if (seen.has(link.id))
			context.addIssue({
				code: 'custom',
				path: [index, 'id'],
				message: `duplicate social id "${link.id}"`,
			})
		seen.add(link.id)
	})
})

// topSection and footer.curve port the legacy theme's banner and curve options (`images.php`
// add_banner_section, `_section.scss`, `curve.php`): every legacy pick-one-of-many option is a config
// value with all its variants implemented. Legacy blur-onload and blur-onhover are not implemented
// (docs/backlog BK01, BK02)

// the six legacy `.background-pattern` patterns of `_section.scss`, plus off; `plain` is the base
// data URI
const topSectionPatternSchema = z.enum([
	'off',
	'plain',
	'radial',
	'diagonal',
	'hatch',
	'carbon',
	'weave',
])

// on is 8px (3px over a pattern), small is 3px; at 768px and below CSS raises `on` to 20px
const topSectionBlurSchema = z.enum(['off', 'on', 'small'])

// a dark overlay: `mode` picks the variant and each variant keeps its own calibrated opacity, since
// mono and tint look different, so switching the mode needs no number change:
//   • off  — no overlay (legacy no-shade);
//   • mono — a black overlay (legacy monoshade) at `monoOpacity`;
//   • tint — a tint of the photo's dominant colour at `tintOpacity`.
// Opacities are integer percents, 1..99
const topSectionShadeSchema = z
	.object({
		mode: z.enum(['off', 'mono', 'tint']).default('mono'),
		monoOpacity: z.number().int().min(1).max(99).default(30),
		tintOpacity: z.number().int().min(1).max(99).default(45),
	})
	.strict()
	.prefault({})

// the banner split-heading accent: yellow `accent` or red `alt`. It is separate from
// `hero.galleryAccent`, which drives the home slider: the legacy theme kept the yellow tail on the photo
// page only and gave section banners a red accent, while albums stay yellow here
const bannerAccentSchema = z.enum(['accent', 'alt'])

const topSectionAccentSchema = z
	.object({
		album: bannerAccentSchema.default('accent'),
		section: bannerAccentSchema.default('alt'),
	})
	.strict()
	.prefault({})

// how the H1 arrives over the photo. Every variant starts after the image reveal (a CSS delay), so the
// heading always comes second; only the entrance differs:
//   • slide — slides up from under a mask, the text stays opaque throughout;
//   • fade  — fades in;
//   • off   — appears at once, no animation.
// Animating the opacity of large shadowed text drops subpixel antialiasing, which shimmers during
// ClientRouter transitions; slide and off never go translucent
const topSectionTitleRevealSchema = z.enum(['slide', 'fade', 'off'])

const topSectionSchema = z
	.object({
		parallax: z.boolean().default(true),
		shadow: z.boolean().default(true),
		blur: topSectionBlurSchema.default('off'),
		pattern: topSectionPatternSchema.default('off'),
		shade: topSectionShadeSchema,
		accent: topSectionAccentSchema,
		titleReveal: topSectionTitleRevealSchema.default('fade'),
	})
	.strict()
	.prefault({})

// the decorative upper edge of the inner-page footer: off or one of the seven legacy shapes with a
// height. An absent curve is the shape object with its defaults
const footerCurveSchema = z
	.union([
		z.literal('off'),
		z
			.object({
				shape: z.enum(FOOTER_CURVE_SHAPES).default('downright'),
				height: z.number().int().min(20).max(200).default(100),
			})
			.strict(),
	])
	.prefault({})

// legacy `footer_columns` (`_footer.scss` `.columns-2/3/4`, theme default 2). It only changes the
// layout and is an upper bound: a column with nothing visible is not rendered and the grid shrinks to
// the visible ones. The legacy four-column variant is left out: at 1440 four columns squeeze the menu
// into unreadable 25% strips
const footerColumnsSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])

// the footer quote; the text is localized (i18n `footer.quote`), so the config only switches it
const footerQuoteSchema = z.enum(['off', 'on'])

// `lang` shares its modes with `menu.lang` (language-switcher.ts) but is set independently; a
// locale-neutral page (`/rights/`, `/status/`) never shows it. `social` switches the footer icons only:
// the list and order come from the top-level `social`, and the home overlay is unaffected
const footerLangSchema = z.enum(LANGUAGE_SWITCHER_MODES)
const footerSocialSchema = z.enum(['off', 'on'])

// the footer promo grid (selection in src/lib/portfolio/footer-promo.ts). It shows what the page has
// not shown yet, other albums first, and each page gets its own deterministic set:
//   • count — the number of slots (1..12);
//   • favorites — slots reserved for `favorite` photos (0..count; 0 means no quota);
//   • freshness — how many times rarer the oldest photo appears than the newest (1..1000; 1 ignores
//     age), independent of the corpus size
// An absent grid is the object with its defaults
const footerRecentWorksSchema = z
	.union([
		z.literal('off'),
		z
			.object({
				count: z.number().int().min(1).max(12).default(6),
				favorites: z.number().int().min(0).max(12).default(2),
				freshness: z.number().min(1).max(1000).default(10),
			})
			.strict()
			.refine((value) => value.favorites <= value.count, {
				message: 'favorites must not exceed count',
				path: ['favorites'],
			}),
	])
	.prefault({})

const articlesSchema = z
	.object({ order: articlesOrderSchema.default('newest') })
	.strict()
	.prefault({})

// the fields of a kind's block constrain each other, so an override writes the block whole: an
// absent block is the core's, a written one gets no defaults
const moreDocsSchema = z
	.object({
		article: moreDocsConfigSchema.default({
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
		}),
		page: moreDocsConfigSchema.default({
			source: 'off',
			layout: 'grid',
			width: 'wide',
			heading: 'on',
			media: 'on',
			excerpt: 'off',
			card: 'title-slide',
			ratio: 'vista',
			columns: 3,
			gap: 16,
		}),
	})
	.strict()
	.prefault({})
	.superRefine((value, context) => {
		if (value.page.order === 'newest')
			context.addIssue({
				code: 'custom',
				path: ['page', 'order'],
				message: 'page does not support newest order',
			})
	})

// card and list rules shared by every collection (albums, articles, the courses archive), as the
// legacy theme kept them in one place (`_grid-layout.scss`) rather than per section:
//   • excerptHiddenBelow — the legacy theme hid the card excerpt below 768. A media query cannot read a
//     custom property, so this is an enum of implemented breakpoints, not a free number;
//   • moreLink — a "read more" link the legacy cards never had; the `on` variant is implemented
const excerptHiddenBelowSchema = z.union([
	z.literal('off'),
	z.literal(480),
	z.literal(768),
	z.literal(1024),
])

const listingSchema = z
	.object({
		excerptHiddenBelow: excerptHiddenBelowSchema.default(768),
		moreLink: z.enum(['off', 'on']).default('off'),
	})
	.strict()
	.prefault({})

// the album page and the Portfolio index keep only a width here: `album.layout` and `portfolio.layout`
// are the only mode selectors, so two sources of truth cannot drift apart
const widthOnlySurfaceSchema = z
	.object({ width: surfaceWidthSchema.default('gallery') })
	.strict()
	.prefault({})

const surfacesSchema = z
	.object({
		portfolioIndex: widthOnlySurfaceSchema,
		album: widthOnlySurfaceSchema,
		articlesIndex: documentSurfaceSchema({
			width: 'standard',
			kind: 'masonry',
			ratio: 'original',
		}),
	})
	.strict()
	.prefault({})

// gallery layout settings, tuned to the 1440 container and the [400, 800] grid derivatives; the
// numeric bounds are fail-closed. portfolio.layout and album.layout list the implemented modes
// (lib/portfolio/portfolio-layout.ts, album-layout.ts)
const masonryLayoutSchema = (defaults: { gap: number }) =>
	z
		.object({
			minColumnWidth: z.number().int().min(160).max(640).default(300),
			gap: z.number().int().min(0).max(64).default(defaults.gap),
			maxColumns: z.number().int().min(1).max(8).default(5),
		})
		.strict()
		.prefault({})

const justifiedLayoutSchema = z
	.object({
		targetRowHeight: z.number().int().min(80).max(640).default(160),
		gap: z.number().int().min(0).max(64).default(12),
		tolerance: z.number().min(0).max(1).default(0.25),
	})
	.strict()
	.prefault({})

// an even card grid: `columns` is exact once the grid is at least 720px wide (narrower, it auto-fits
// cards of at least 220px), `ratio` is the preview frame (the moreDocs grid set, without original)
const cardGridLayoutSchema = z
	.object({
		columns: z.number().int().min(1).max(6).default(3),
		gap: z.number().int().min(0).max(64).default(16),
		ratio: z.enum(CARD_GRID_RATIOS).default('vista'),
	})
	.strict()
	.prefault({})

// a mode selector plus the settings of every implemented mode (lib/portfolio/portfolio-layout.ts), on the
// same principle as album: the inactive block is kept and validated
const portfolioLayoutSchema = z
	.object({
		layout: z.enum(PORTFOLIO_LAYOUTS).default('masonry'),
		// the album card look (variants.ts), in both modes
		card: z.enum(CARD_PRESENTATIONS).default('details'),
		// the `details` card text: the album excerpt, else whole sentences of the description. As in
		// moreDocs, the compact looks show no text and so require `off`
		excerpt: z.enum(['on', 'off']).default('on'),
		masonry: masonryLayoutSchema({ gap: 16 }),
		grid: cardGridLayoutSchema,
	})
	.strict()
	.refine((value) => value.card === 'details' || value.excerpt === 'off', {
		message: 'compact presentations require excerpt: off',
		path: ['excerpt'],
	})
	.prefault({})

// album: a mode selector plus the settings of every implemented mode (lib/portfolio/album-layout.ts).
// Every block is always validated, active or not, so a typo surfaces now rather than at a
// later switch; unknown keys are errors. The square/rect crop grid: `columns` is the maximum,
// `minColumns` the minimum on a narrow container (1 | 2), and in between a tile is never narrower than
// 240px
const cropGridLayoutSchema = z
	.object({
		columns: z.number().int().min(1).max(6).default(4),
		gap: z.number().int().min(0).max(64).default(12),
		minColumns: z.union([z.literal(1), z.literal(2)]).default(2),
	})
	.strict()
	.refine((value) => value.minColumns <= value.columns, {
		message: 'minColumns must not exceed columns',
		path: ['minColumns'],
	})
	.prefault({})

const albumLayoutSchema = z
	.object({
		layout: z.enum(ALBUM_LAYOUTS).default('justified'),
		justified: justifiedLayoutSchema,
		// the same bounds as portfolio.masonry, with independent values
		masonry: masonryLayoutSchema({ gap: 12 }),
		square: cropGridLayoutSchema,
		rect: cropGridLayoutSchema,
	})
	.strict()
	.prefault({})

// photo page toggles:
//   • dominantStrip — a dominantColor strip above the menu instead of the empty legacy `.empty` banner;
//   • showRelated — a thumbnail grid of the album's other photos under the text
const photoDisplaySchema = z
	.object({
		dominantStrip: z.enum(['off', 'on']).default('on'),
		showRelated: z.enum(['off', 'on']).default('on'),
	})
	.strict()
	.prefault({})

// the album list in the left column of Portfolio and album pages. On narrow screens (< 1024) a list
// of `collapseFrom` or more albums folds into an "Albums (N) · current" disclosure; desktop needs no
// threshold, since the column is capped at the viewport height and scrolls when the list overflows
const albumListSchema = z
	.object({
		collapseFrom: z.number().int().min(2).max(100).default(8),
	})
	.strict()
	.prefault({})

// contacts keeps the legacy image + form layout. `aside` sets the decorative, non-clickable left image:
// `image` is a photo id (`off` drops it and the form takes the full width); `width` an integer percent
// of the container, 20..40 (legacy 1/4 = 25); `ratio` a portrait frame (`original` is uncropped,
// otherwise cover at the photo's focalPoint); `frame`/`frameColor` the Wrap Around frame scale
// (image-frame.css)
export const CONTACTS_ASIDE_RATIOS = ['original', '1:1', '4:5', '3:4', '2:3', '9:16'] as const
export const CONTACTS_ASIDE_WIDTH = { min: 20, max: 40 } as const

const contactsSchema = z
	.object({
		aside: z
			.object({
				image: z
					.union([z.literal('off'), z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)])
					.default('off'),
				width: z
					.number()
					.int()
					.min(CONTACTS_ASIDE_WIDTH.min)
					.max(CONTACTS_ASIDE_WIDTH.max)
					.default(34),
				ratio: z.enum(CONTACTS_ASIDE_RATIOS).default('original'),
				frame: z.enum(['none', 'thin', 'medium', 'thick']).default('thick'),
				frameColor: z.enum(['default', 'alt']).default('alt'),
			})
			.strict()
			.prefault({}),
	})
	.strict()
	.prefault({})

// PhotoSwipe viewer options ported from the legacy theme (`scripts/frontend/gallery/lightbox.js`,
// `jquery.photoswipe.js`) and mapped onto PhotoSwipeLightbox v5: showHideAnimationType 'zoom' is the
// legacy showHideOpacity:false (zoom from the thumbnail), the legacy show/hide/slide durations were
// 800ms and loop defaulted to true. The island reads the values from a data attribute on its container
const viewerSchema = z
	.object({
		showHideAnimationType: z.enum(['zoom', 'fade', 'none']).default('zoom'),
		showAnimationDuration: z.number().int().min(0).max(5000).default(800),
		hideAnimationDuration: z.number().int().min(0).max(5000).default(800),
		zoomAnimationDuration: z.number().int().min(0).max(5000).default(800),
		loop: z.boolean().default(true),
		bgOpacity: z.number().min(0).max(1).default(1),
		easing: z.string().min(1).default('cubic-bezier(0.4, 0, 0.22, 1)'),
		// viewer chrome and behaviour: `counter` is the "1 / N" counter, `fullscreen` the fullscreen
		// button, `moreInfo` the "More info →" link to the photo page, `copyright` the copyright line in
		// the bottom bar; `idle` is how many ms without mouse movement pass before the top bar and arrows
		// fade (off keeps them); `slideSpring` is the arrow/keyboard transition softness (lower is slower,
		// off is instant)
		counter: z.enum(['on', 'off']).default('off'),
		fullscreen: z.enum(['on', 'off']).default('on'),
		moreInfo: z.enum(['on', 'off']).default('on'),
		copyright: z.enum(['on', 'off']).default('on'),
		idle: z.union([z.literal('off'), z.number().int().min(500).max(60000)]).default(4000),
		slideSpring: z.union([z.literal('off'), z.number().int().min(5).max(60)]).default(20),
	})
	.strict()
	.prefault({})

// `locales` lists the site's locales; its order is the language switcher order and its first entry the
// default locale (x-default, Astro `defaultLocale`). The reference locale (ADR-0013) is the only source
// of Tier-1 document-level fields (coverId, publishedAt, source, kind). `catalog` overrides fields of
// the core's locale defaults and adds the codes the core has no default for, each with every field;
// the lock holds the effective entry of each locale the site builds and of the service copy's language.
// `taxonomy` holds the enumerations of the content's taxonomy (config/taxonomy.ts).
const contentConfigSchema = z
	.object({
		// a tuple with a rest element types the list as non-empty
		locales: z
			.tuple([localeCodeSchema], localeCodeSchema)
			.refine((locales) => new Set(locales).size === locales.length, {
				message: 'content.locales must not repeat a locale',
			}),
		referenceLocale: localeCodeSchema,
		catalog: z.record(localeCodeSchema, localeCatalogEntrySchema.partial()).default({}),
		taxonomy: taxonomyConfigSchema,
	})
	.strict()
	.refine((value) => value.locales.includes(value.referenceLocale), {
		message: 'content.referenceLocale must be one of content.locales',
		path: ['referenceLocale'],
	})
	.superRefine((value, context) => {
		for (const issue of catalogIssues(value)) context.addIssue({ code: 'custom', ...issue })
	})
	.transform(({ catalog, ...value }) => ({
		...value,
		catalog: effectiveCatalog(value.locales, catalog),
	}))

// the canonical production origin (`site`, canonical URLs, sitemap, robots.txt): an https origin with
// nothing after the host, so `new URL(path, origin)` never drops or doubles a segment
const originSchema = z
	.string()
	.refine((value) => URL.canParse(value) && new URL(value).protocol === 'https:', {
		message: 'origin must be an https URL',
	})
	.refine((value) => !URL.canParse(value) || new URL(value).origin === value, {
		message: 'origin must have no path, trailing slash, query or fragment',
	})

const hostSchema = z
	.string()
	.regex(/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/, {
		message: 'expected a lowercase host name',
	})

// links to the author's own hosts are self-links, not third-party facts (ADR-0011). The origin host and
// the `www.` variants are derived; `ownHosts` lists only the other (former) hosts.
const factcheckConfigSchema = z
	.object({
		ownHosts: z.array(hostSchema).default([]),
	})
	.strict()
	.prefault({})

// who the site belongs to, per locale: the site name (page titles, logo and slider labels), the alt
// text of a featured slide with neither title nor description, and the copyright line of the home
// overlay and the footer (`Copyright © <since>-<current year> <holder>.`)
const identitySchema = z
	.object({
		title: localizedLabelSchema,
		photoAlt: localizedLabelSchema,
		copyright: z
			.object({
				holder: localizedLabelSchema,
				since: z.number().int().min(1900).max(2100),
			})
			.strict(),
	})
	.strict()

export type IdentityConfig = z.infer<typeof identitySchema>

// a key per enabled module, checked by the module's own schema; a module left out is disabled, and a
// key the registry does not know fails with the known ones
const modulesSchema = z
	.object(
		Object.fromEntries(MODULES.map((module) => [module.id, module.config.optional()])) as {
			[M in (typeof MODULES)[number] as M['id']]: z.ZodOptional<M['config']>
		},
	)
	// a strict object would report a misspelt module as an unrecognized key, without the known ones
	.catchall(z.unknown())
	.superRefine((value, context) => {
		for (const key of Object.keys(value))
			if (!(MODULE_IDS as readonly string[]).includes(key))
				context.addIssue({
					code: 'custom',
					path: [key],
					message: `unknown module; known: ${MODULE_IDS.join(', ')}`,
				})
	})
	.prefault({})

// the image rights derived from `origin` need the root, which no section default can see
function withDerivedRights<
	T extends { origin: string; images: { rights: Parameters<typeof deriveImageRights>[0] } },
>(value: T): T & { images: { rights: ImageRights } } {
	return {
		...value,
		images: { ...value.images, rights: deriveImageRights(value.images.rights, value.origin) },
	}
}

// strict at every level (fail-closed): an unknown key anywhere fails the build instead of passing
// silently; exported for the accept/reject unit tests. The site's own data is required; every
// behaviour section has the core's defaults, and an override merges into them key by key (a written
// array or scalar replaces the default whole; a `moreDocs.<kind>` block is written whole)
export const siteSchema = z
	.object({
		schemaVersion: z.literal(4),
		origin: originSchema,
		identity: identitySchema,
		content: contentConfigSchema,
		factcheck: factcheckConfigSchema,
		privacy: privacySchema,
		theme: z
			.object({
				// dark|light is a hard default that ignores the system; auto follows prefers-color-scheme,
				// else dark. A saved user choice always wins
				default: z.enum(['dark', 'light', 'auto']).default('dark'),
				toggleVisible: z.boolean().default(true),
				// the placeholder favicon: a rounded square with a disc
				favicon: z
					.object({
						background: cssColorSchema.default('#1b1b1f'),
						foreground: cssColorSchema.default('#fcbf00'),
					})
					.strict()
					.prefault({}),
			})
			.strict()
			.prefault({}),
		hero: z
			.object({
				galleryAccent: z.enum(['accent', 'alt']).default('accent'),
			})
			.strict()
			.prefault({}),
		menu: menuSchema,
		slider: z
			.object({
				speed: z.number().int().positive().default(1000),
				autoplayDelay: z.number().int().positive().default(15000),
				truncateBudget: z.number().int().positive().default(400),
			})
			.strict()
			.prefault({}),
		social: socialListSchema,
		topSection: topSectionSchema,
		footer: z
			.object({
				columns: footerColumnsSchema.default(3),
				curve: footerCurveSchema,
				quote: footerQuoteSchema.default('on'),
				lang: footerLangSchema.default('code'),
				social: footerSocialSchema.default('on'),
				recentWorks: footerRecentWorksSchema,
			})
			.strict()
			.prefault({}),
		articles: articlesSchema,
		modules: modulesSchema,
		moreDocs: moreDocsSchema,
		listing: listingSchema,
		layout: layoutSchema,
		surfaces: surfacesSchema,
		banners: bannersSchema,
		portfolio: portfolioLayoutSchema,
		albumList: albumListSchema,
		album: albumLayoutSchema,
		photo: photoDisplaySchema,
		contacts: contactsSchema,
		viewer: viewerSchema,
		// nested rather than merged into the root: the site and its images both have a `privacy`
		seo: seoSchema,
		images: imageConfigSchema,
	})
	.strict()
	.superRefine((value, context) => {
		// a config text has exactly the active locales: a missing one would fail a page, another one
		// is dead text
		const requireLocales = (text: LocalizedLabel, path: (string | number)[]) => {
			for (const issue of localeCoverageIssues(text, value.content.locales))
				context.addIssue({
					code: 'custom',
					path: [...path, ...issue.path],
					message: issue.message,
				})
		}
		requireLocales(value.identity.title, ['identity', 'title'])
		requireLocales(value.identity.photoAlt, ['identity', 'photoAlt'])
		requireLocales(value.identity.copyright.holder, ['identity', 'copyright', 'holder'])
		requireLocales(value.privacy.controller.name, ['privacy', 'controller', 'name'])
		requireLocales(value.seo.description, ['seo', 'description'])
		value.menu.items.forEach((item, index) =>
			requireLocales(item.label, ['menu', 'items', index, 'label']),
		)
		value.social.forEach((link, index) =>
			requireLocales(link.label, ['social', index, 'label']),
		)
		const enabled = Object.keys(value.modules)
		for (const issue of [
			...dependencyIssues(enabled),
			...disabledMenuSegmentIssues(value.menu.items, enabled),
		])
			context.addIssue({ code: 'custom', ...issue })
	})
	.transform(withDerivedRights)

export type SiteConfig = z.infer<typeof siteSchema>

export type ContentConfig = z.infer<typeof contentConfigSchema>

export type FactcheckConfig = z.infer<typeof factcheckConfigSchema>

// the only source of Tier-1 document-level fields (ADR-0013)
export type ReferenceLocale = ContentConfig['referenceLocale']

// x-default, Astro `defaultLocale` and the fallback of `Astro.currentLocale`
export function defaultLocale(config: { content: Pick<ContentConfig, 'locales'> }): Locale {
	return config.content.locales[0]
}

// reaches the PhotoSwipe island through a data attribute on its container
export type ViewerConfig = z.infer<typeof viewerSchema>

export type TopSectionConfig = z.infer<typeof topSectionSchema>
export type TopSectionTitleReveal = z.infer<typeof topSectionTitleRevealSchema>
// `accent` is yellow, `alt` is red
export type BannerAccent = z.infer<typeof bannerAccentSchema>
// `off` plus the six legacy patterns
export type TopSectionPattern = z.infer<typeof topSectionPatternSchema>
export type TopSectionBlur = z.infer<typeof topSectionBlurSchema>

// a moreDocs target kind; `course` belongs to the courses module, whose `modules.courses.moreDocs` holds
// its block
export type MoreDocsKind = 'article' | 'course' | 'page'
export type {
	ArticlesOrder,
	ContentWidth,
	DocumentSurfaceKind,
	MoreDocumentsConfig,
} from './document-schemas.ts'
// `off` never hides the excerpt
export type ExcerptHiddenBelow = z.infer<typeof excerptHiddenBelowSchema>
export type ListingConfig = z.infer<typeof listingSchema>

export type FooterRecentWorks = z.infer<typeof footerRecentWorksSchema>
