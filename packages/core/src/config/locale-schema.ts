import { z } from 'astro/zod'

// a locale is its code; which codes a site builds is site.yaml `content.locales`, and what the core
// knows about each is the site's effective `content.catalog` in its lock. Schemas built on import (a
// content file's `locale`, the contact Worker) check the code's format only; membership is checked
// against the config where it is known.
export type Locale = string

const LOCALE_CODE = '[a-z]{2,3}'

export const localeCodeSchema = z.string().regex(new RegExp(`^${LOCALE_CODE}$`), {
	message: 'expected a locale code of two or three lowercase letters, such as `en`',
})

// the writing systems the core ships fonts for (src/theme/fonts.ts, theme.css)
export const LOCALE_SCRIPTS = ['latin', 'cyrillic'] as const

export type LocaleScript = (typeof LOCALE_SCRIPTS)[number]

// a malformed tag makes Intl throw rather than return no match
const isSupportedIntlTag = (value: string): boolean => {
	try {
		return Intl.DateTimeFormat.supportedLocalesOf(value).length > 0
	} catch {
		return false
	}
}

// `script` picks the font family and preloads (src/theme/fonts.ts); language names live in the UI
// dictionaries (`language.<code>`), so each page names languages in its own language. `charWidthPx` is
// the mean width of a 16px glyph of the locale's text, which sizes the album header mosaic
// (lib/portfolio/album-intro.ts).
export const localeCatalogEntrySchema = z
	.object({
		script: z.enum(LOCALE_SCRIPTS, {
			message: `expected a script the core has fonts for: ${LOCALE_SCRIPTS.join(', ')}`,
		}),
		ogLocale: z.string().regex(/^[a-z]{2,3}_[A-Z]{2}$/, {
			message: 'expected an og:locale such as `en_US`',
		}),
		intl: z.string().refine(isSupportedIntlTag, {
			message: 'expected a BCP 47 tag Intl supports, such as `en-US`',
		}),
		charWidthPx: z.number().positive(),
	})
	.strict()

export type LocaleCatalogEntry = z.infer<typeof localeCatalogEntrySchema>

export type LocaleCatalog = Readonly<Record<Locale, LocaleCatalogEntry>>

// the core's defaults, which site.yaml `content.catalog` overrides field by field and extends with
// new codes; consumers read the effective catalog from the config, never this
export const DEFAULT_LOCALE_CATALOG = {
	en: { script: 'latin', ogLocale: 'en_US', intl: 'en-US', charWidthPx: 7.1 },
	ru: { script: 'cyrillic', ogLocale: 'ru_RU', intl: 'ru-RU', charWidthPx: 8.1 },
} as const satisfies LocaleCatalog

// the language of service pages that are never translated (`/status/`): their copy is the core's
// English on every site, whatever its locales, so their content is marked with this language and the
// effective catalog always has its entry
export const SERVICE_COPY_LOCALE: Locale = 'en'

// the entry of a locale the catalog must have: a missing one is an error, never another locale's
export function localeEntry(catalog: LocaleCatalog, locale: Locale): LocaleCatalogEntry {
	if (!Object.hasOwn(catalog, locale))
		throw new Error(`content.catalog: no entry for locale "${locale}"`)
	return catalog[locale]!
}

// `<translation-key>.<locale>.<md|mdx>`: groups are the key, the locale and the extension. Any code of
// the locale format matches; the reader checks it against `content.locales`
export const LOCALE_FILE_PATTERN = new RegExp(
	`^([a-z0-9]+(?:-[a-z0-9]+)*)\\.(${LOCALE_CODE})\\.(mdx?)$`,
)

// a leading `/<locale>` path segment of one of `locales`; group 1 is the locale. Built from the list,
// since a two-letter segment such as `/my/` is not a locale of every site
export const localePathPrefix = (locales: readonly Locale[]): RegExp =>
	new RegExp(`^/(${locales.join('|')})(?=/|$)`)

type CatalogOverrides = Readonly<Record<Locale, Partial<LocaleCatalogEntry>>>

const hasDefault = (locale: Locale): locale is keyof typeof DEFAULT_LOCALE_CATALOG =>
	Object.hasOwn(DEFAULT_LOCALE_CATALOG, locale)

const ENTRY_FIELDS = Object.keys(localeCatalogEntrySchema.shape) as (keyof LocaleCatalogEntry)[]

// a code the core has no default for needs every field, and a locale the site builds needs an entry,
// so no locale is ever described by another's metadata
export function catalogIssues(content: {
	locales: readonly Locale[]
	catalog: CatalogOverrides
}): { path: (string | number)[]; message: string }[] {
	const incomplete = Object.entries(content.catalog)
		.filter(([locale]) => !hasDefault(locale))
		.flatMap(([locale, entry]) =>
			ENTRY_FIELDS.filter((field) => entry[field] === undefined).map((field) => ({
				path: ['catalog', locale, field],
				message: `required: the core has no default entry for "${locale}"`,
			})),
		)
	const missing = content.locales.flatMap((locale, index) =>
		hasDefault(locale) || Object.hasOwn(content.catalog, locale)
			? []
			: [
					{
						path: ['locales', index],
						message: `"${locale}" has no entry in the catalog; add content.catalog.${locale}`,
					},
				],
	)
	return [...incomplete, ...missing]
}

// the core's default of each locale with the site's fields over it, for the site's locales and the
// service copy's language only; called after `catalogIssues` found nothing
export function effectiveCatalog(
	locales: readonly Locale[],
	overrides: CatalogOverrides,
): LocaleCatalog {
	return Object.fromEntries(
		[...new Set([...locales, SERVICE_COPY_LOCALE])].map((locale) => [
			locale,
			{
				...(hasDefault(locale) ? DEFAULT_LOCALE_CATALOG[locale] : {}),
				...overrides[locale],
			} as LocaleCatalogEntry,
		]),
	)
}
