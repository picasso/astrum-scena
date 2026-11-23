import { type Locale, LOCALE_CATALOG, type LocaleScript } from '../config/locale-schema.ts'

// file prefixes of the two families declared in theme.css: the latin subset and the full original
const FONT_FILE_PREFIX: Record<LocaleScript, string> = {
	latin: '/fonts/ubuntu/ubuntu-v9-latin',
	cyrillic: '/fonts/ubuntu/ubuntu-v9-cyrillic_latin',
}

// body text and headings paint above the fold; italic and 500 load on demand
const PRELOADED_FACES = ['regular', '700'] as const

export function localeScript(lang: Locale): LocaleScript {
	return LOCALE_CATALOG[lang].script
}

export function fontPreloads(script: LocaleScript): string[] {
	return PRELOADED_FACES.map((face) => `${FONT_FILE_PREFIX[script]}-${face}.woff2`)
}
