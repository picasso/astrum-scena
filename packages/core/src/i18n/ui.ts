import { type Locale, localePathPrefix } from '../config/locale-schema.ts'
import type { MenuIcon } from '../config/menu.ts'
import { site } from '../config/site.ts'
import { siteRoot } from '../config/site-root.ts'
import { enabledModules } from '../modules/registry.ts'
import { languageKey, loadDictionaries, type UIKey } from './dictionaries.ts'

export type Lang = Locale
export type { UIKey }

// the core's and the enabled modules' dictionaries with the site's overrides, one per locale of
// `content.locales`; a missing
// key fails the build, so `t` never falls back to another locale. Loaded on first use rather than on
// import: tests swap the config singleton per case, and its locales key the cache
let loaded:
	{ locales: readonly Locale[]; dictionaries: ReturnType<typeof loadDictionaries> } | undefined

const siteDictionaries = () => {
	const { locales } = site.content
	if (loaded?.locales !== locales)
		loaded = {
			locales,
			dictionaries: loadDictionaries(siteRoot, locales, enabledModules(site)),
		}
	return loaded.dictionaries
}

export function useTranslations(lang: Lang) {
	const dict = siteDictionaries()[lang]
	if (!dict) throw new Error(`i18n: "${lang}" is not a locale of content.locales`)
	return function t(key: UIKey): string {
		return dict[key]
	}
}

// a language name in the language of the page it sits on, so an English page never shows Cyrillic
export function languageName(lang: Lang, code: Locale): string {
	return useTranslations(lang)(languageKey(code))
}

// the section icon for the current page: the index icon on the exact section index (isActive), the
// nested one below it; no icon → undefined (the slot keeps the logo)
export function resolveNavIcon(icon: MenuIcon | undefined, exact: boolean): string | undefined {
	if (!icon) return undefined
	return typeof icon === 'string' ? icon : exact ? icon[0] : icon[1]
}

// prefixDefaultLocale is on, so every locale, the default one included, gets its prefix
export function localizedHref(lang: Lang, segment: string): string {
	return segment ? `/${lang}/${segment}/` : `/${lang}/`
}

// dev and build disagree on the trailing slash, so /en/about and /en/about/ must be one route
export function normalizePath(pathname: string): string {
	const collapsed = pathname.replace(/\/{2,}/g, '/')
	return collapsed.length > 1 ? collapsed.replace(/\/$/, '') : collapsed
}

// exact match only: it drives `aria-current="page"`, which belongs on the exact page URL alone
export function isActive(pathname: string, lang: Lang, segment: string): boolean {
	return normalizePath(pathname) === normalizePath(localizedHref(lang, segment))
}

// the desktop top-menu's visual current section also covers nested routes (article → Articles,
// album/photo → Portfolio), while `isActive` stays exact for `aria-current`. Home is current only on
// its exact localized root; other sections match `/${lang}/${segment}` as a whole path segment, not a
// string prefix, so `/en/articleship/` does not activate Articles. A route outside every menu segment,
// such as the language-neutral `/rights/`, highlights nothing.
export function isCurrentSection(pathname: string, lang: Lang, segment: string): boolean {
	if (segment === '') return isActive(pathname, lang, segment)
	const base = normalizePath(localizedHref(lang, segment))
	const current = normalizePath(pathname)
	return current === base || current.startsWith(`${base}/`)
}

// a path without a locale prefix (`/rights/`) has no other language version to switch to
export function isLocaleNeutralPath(pathname: string): boolean {
	return !localePathPrefix(site.content.locales).test(pathname)
}

// keeps the current section and its trailing slash as is; a language-neutral path is returned
// unchanged, otherwise the link would lead to a missing /{lang}/… route
export function switchLocalePath(pathname: string, target: Lang): string {
	if (isLocaleNeutralPath(pathname)) return pathname
	const rest = pathname.replace(localePathPrefix(site.content.locales), '')
	const normalized = rest === '' ? '/' : rest
	return `/${target}${normalized === '/' ? '/' : normalized}`
}
