// only real public routes reach the sitemap: the noindex `/status/` page is public by URL but
// deliberately left out

import { STATUS_PATH } from './content/routes.ts'

function pathnameOf(url: string): string {
	const { pathname } = new URL(url)
	return pathname.endsWith('/') ? pathname : `${pathname}/`
}

// unlisted documents, albums and photos (ADR-0010) stay reachable by URL but out of the sitemap; the
// caller passes their paths from the published/unlisted route split (buildRedirectRouteSets)
export function createSitemapFilter(unlistedPaths: ReadonlySet<string>): (url: string) => boolean {
	return (url) => {
		const pathname = pathnameOf(url)
		return pathname !== STATUS_PATH && !unlistedPaths.has(pathname)
	}
}

// exactly one trailing slash, so the canonical route and its sitemap entry match byte for byte
export function canonicalSitemapUrl(url: string): string {
	const parsed = new URL(url)
	parsed.pathname = pathnameOf(url)
	return parsed.href
}
