import type { Locale } from './schemas.ts'

export const ARTICLES_SEGMENT = 'articles'

export { RIGHTS_PATH } from '../../config/rights.ts'

// public by direct URL but not navigational: no UI links, excluded from the sitemap and marked
// `noindex,follow`; language-neutral like `/rights/`
export const STATUS_PATH = '/status/'

export type LocalizedStaticPath<P extends Record<string, string>> = {
	params: P & { locale: Locale }
	props: { locale: Locale }
}

// the one place that crosses the configured locales with a route's paths (`src/pages/[locale]/**`).
// Without `paths` the route is a single page per locale; an empty `paths` yields no pages at all.
export function localizedStaticPaths<P extends Record<string, string> = Record<never, string>>(
	locales: readonly Locale[],
	paths: readonly { params: P }[] = [{ params: {} as P }],
): LocalizedStaticPath<P>[] {
	return locales.flatMap((locale) =>
		paths.map((path) => ({ params: { ...path.params, locale }, props: { locale } })),
	)
}

export type ContentRouteTarget = {
	collection: 'albums' | 'articles' | 'pages'
	slug: string
	linkKind: 'album' | 'page'
}

export function contentHref(target: ContentRouteTarget, locale: Locale): string {
	if (target.linkKind === 'album') return albumHref(target.slug, locale)
	if (target.collection === 'articles') return articleHref(target.slug, locale)
	return pageHref(target.slug, locale)
}

// always locale-prefixed (prefixDefaultLocale) with one trailing slash, consistent with contentHref
export function albumHref(albumId: string, locale: Locale): string {
	return `/${locale}/portfolio/${albumId}/`
}

// the photo route nests under the album because the backlink and related photos depend on the URL's
// album even when the photo is in several published albums; the alternate locale keeps the same pair
export function photoHref(albumId: string, photoId: string, locale: Locale): string {
	return `/${locale}/portfolio/${albumId}/${photoId}/`
}

export function pageHref(slug: string, locale: Locale): string {
	return `/${locale}/${slug}/`
}

export function articlesIndexHref(locale: Locale): string {
	return `/${locale}/${ARTICLES_SEGMENT}/`
}

export function articleHref(slug: string, locale: Locale): string {
	return `/${locale}/${ARTICLES_SEGMENT}/${slug}/`
}
