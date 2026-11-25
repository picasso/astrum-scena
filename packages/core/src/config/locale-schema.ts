import { z } from 'astro/zod'

// the only declaration of the supported locales (each has a UI dictionary in src/i18n); a site picks
// its active subset in site.yaml `content.locales`. Config, content and the contact Worker import it.
// `script` picks the font family and preloads (src/theme/fonts.ts); language names live in the UI
// dictionaries (`language.<code>`), so each page names languages in its own language. `charWidthPx` is
// the mean width of a 16px glyph of the locale's text, which sizes the album header mosaic
// (lib/portfolio/album-intro.ts).
export const LOCALE_CATALOG = {
	en: { script: 'latin', ogLocale: 'en_US', intl: 'en-US', charWidthPx: 7.1 },
	ru: { script: 'cyrillic', ogLocale: 'ru_RU', intl: 'ru-RU', charWidthPx: 8.1 },
} as const satisfies Record<
	string,
	{ script: LocaleScript; ogLocale: string; intl: string; charWidthPx: number }
>

export type LocaleScript = 'latin' | 'cyrillic'

export type Locale = keyof typeof LOCALE_CATALOG

export const SUPPORTED_LOCALES = Object.keys(LOCALE_CATALOG) as [Locale, ...Locale[]]

export const localeSchema = z.enum(SUPPORTED_LOCALES)

const localeAlternation = SUPPORTED_LOCALES.join('|')

// `<translation-key>.<locale>.<md|mdx>`: groups are the key, the locale and the extension
export const LOCALE_FILE_PATTERN = new RegExp(
	`^([a-z0-9]+(?:-[a-z0-9]+)*)\\.(${localeAlternation})\\.(mdx?)$`,
)

// a leading `/<locale>` path segment; group 1 is the locale
export const LOCALE_PATH_PREFIX = new RegExp(`^/(${localeAlternation})(?=/|$)`)

// the language of service pages that are never translated (`/status/`): their copy is English on every
// site, whatever its locales, so their content is marked with this language
export const SERVICE_COPY_LOCALE: Locale = 'en'
