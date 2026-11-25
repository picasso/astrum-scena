import type { Locale } from '../../config/locale-schema.ts'
import { switchLocalePath } from '../../i18n/ui.ts'

// every route is self-canonical; alternates keep the same album/photo pair because
// `switchLocalePath` swaps only the locale prefix. x-default is the first active locale. A one-locale
// site has nothing to alternate with, so it emits no hreflang at all

// unlisted documents, albums and photos (ADR-0010) stay reachable by URL but opt out of indexing
export const UNLISTED_ROBOTS = 'noindex,follow'

export function unlistedRobots(unlisted: boolean): typeof UNLISTED_ROBOTS | undefined {
	return unlisted ? UNLISTED_ROBOTS : undefined
}

export type AlternateLink = {
	hreflang: string
	href: string
}

export type LocaleMeta = {
	canonical: string
	alternates: AlternateLink[]
}

export function buildLocaleMeta(
	pathname: string,
	origin: string,
	locales: readonly [Locale, ...Locale[]],
): LocaleMeta {
	const absolute = (path: string): string => new URL(path, origin).href
	if (locales.length === 1) return { canonical: absolute(pathname), alternates: [] }
	return {
		canonical: absolute(pathname),
		alternates: [
			...locales.map((lang) => ({
				hreflang: lang,
				href: absolute(switchLocalePath(pathname, lang)),
			})),
			{ hreflang: 'x-default', href: absolute(switchLocalePath(pathname, locales[0])) },
		],
	}
}
