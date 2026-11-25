import { courseHref } from '../../modules/courses/routes.ts'
import type { ModuleManifest } from '../../modules/manifest.ts'
import {
	collectPublishedDocuments,
	documentIn,
	type DocumentLocales,
} from '../content/documents.ts'
import type { ContentSnapshot } from '../content/model.ts'
import {
	albumHref,
	articleHref,
	articlesIndexHref,
	pageHref,
	photoHref,
} from '../content/routes.ts'
import type { Locale } from '../content/schemas.ts'
import { getPublishedAlbums, indexById, resolveAlbumPhotos } from '../portfolio/publication.ts'

// every active locale prefix `/{locale}/` is protected too
const PROTECTED_PREFIXES = ['/api/contact', '/_astro/', '/fonts/', '/sitemap']
const PROTECTED_PATHS = new Set(['/rights/', '/status/'])

export type RedirectRouteSets = {
	locales: readonly Locale[]
	published: Set<string>
	unlisted: Set<string>
}

// `modules` are the enabled ones: each serves an index under every segment it owns
export function buildRedirectRouteSets(
	snapshot: ContentSnapshot,
	content: DocumentLocales,
	modules: readonly ModuleManifest[],
): RedirectRouteSets {
	const { locales, referenceLocale } = content
	const published = new Set<string>([
		...locales.flatMap((locale) => [
			`/${locale}/`,
			`/${locale}/portfolio/`,
			`/${locale}/contacts/`,
			articlesIndexHref(locale),
			...modules.flatMap((module) =>
				module.segments.map((segment) => `/${locale}/${segment}/`),
			),
		]),
		'/rights/',
		'/status/',
	])
	const unlisted = new Set<string>()
	const add = (path: string, isUnlisted: boolean) => (isUnlisted ? unlisted : published).add(path)

	for (const document of collectPublishedDocuments(snapshot.articles, content)) {
		for (const locale of locales)
			add(
				articleHref(document.slug, locale),
				documentIn(document, referenceLocale).data.unlisted === true,
			)
	}
	for (const document of collectPublishedDocuments(snapshot.courses, content)) {
		for (const locale of locales)
			add(
				courseHref(document.slug, locale),
				documentIn(document, referenceLocale).data.unlisted === true,
			)
	}
	for (const document of collectPublishedDocuments(
		snapshot.pages,
		content,
		(data) => data.slug !== 'home',
	)) {
		for (const locale of locales)
			add(
				pageHref(document.slug, locale),
				documentIn(document, referenceLocale).data.unlisted === true,
			)
	}

	const photosById = indexById(snapshot.photos)
	for (const album of getPublishedAlbums(snapshot.albums)) {
		const albumUnlisted = album.data.unlisted === true
		for (const locale of locales) add(albumHref(album.id, locale), albumUnlisted)
		for (const photo of resolveAlbumPhotos(album, photosById)) {
			for (const locale of locales) {
				add(
					photoHref(album.id, photo.id, locale),
					albumUnlisted || photo.data.unlisted === true,
				)
			}
		}
	}

	return { locales, published, unlisted }
}

export function validateRedirects(source: string, routes: RedirectRouteSets): string[] {
	const errors: string[] = []
	const rules = new Map<string, { target: string; line: number; ownerApproved: boolean }>()
	let ownerApprovedNext = false

	for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
		const lineNumber = index + 1
		const line = rawLine.trim()
		if (!line) continue
		if (line.startsWith('#')) {
			ownerApprovedNext = line === '# owner-approved-unlisted'
			continue
		}

		const [from, to, status, ...extra] = line.split(/\s+/)
		if (from === undefined || to === undefined || status === undefined || extra.length > 0) {
			errors.push(`line ${lineNumber}: expected exactly source, target, and status`)
			ownerApprovedNext = false
			continue
		}
		if (status !== '301') errors.push(`line ${lineNumber}: only status 301 is allowed`)
		if (!from.startsWith('/') || from.startsWith('//') || /[?#*]/.test(from))
			errors.push(
				`line ${lineNumber}: source must be an exact local path without query, fragment, or wildcard`,
			)
		if (hasNamedPlaceholder(from))
			errors.push(`line ${lineNumber}: source cannot contain a Cloudflare named placeholder`)
		if (from !== '/' && !from.endsWith('/'))
			errors.push(`line ${lineNumber}: source must end with a slash`)
		if (!to.startsWith('/') || to.startsWith('//') || /[?#*]/.test(to))
			errors.push(
				`line ${lineNumber}: target must be an exact local path without query, fragment, or wildcard`,
			)
		if (hasNamedPlaceholder(to))
			errors.push(`line ${lineNumber}: target cannot contain a Cloudflare named placeholder`)
		if (!to.endsWith('/')) errors.push(`line ${lineNumber}: target must end with a slash`)
		if (from === to) errors.push(`line ${lineNumber}: source and target must differ`)
		if (isProtected(from, routes.locales))
			errors.push(`line ${lineNumber}: source collides with a protected route`)
		if (routes.published.has(from) || routes.unlisted.has(from))
			errors.push(`line ${lineNumber}: source collides with an existing content route`)
		if (rules.has(from)) errors.push(`line ${lineNumber}: duplicate source "${from}"`)
		else rules.set(from, { target: to, line: lineNumber, ownerApproved: ownerApprovedNext })
		ownerApprovedNext = false
	}

	for (const [from, rule] of rules) {
		if (rules.has(rule.target))
			errors.push(
				`line ${rule.line}: redirect chain or loop from "${from}" through "${rule.target}"`,
			)
		if (routes.unlisted.has(rule.target) && !rule.ownerApproved)
			errors.push(
				`line ${rule.line}: unlisted target requires a preceding # owner-approved-unlisted comment`,
			)
		else if (!routes.published.has(rule.target) && !routes.unlisted.has(rule.target))
			errors.push(`line ${rule.line}: target "${rule.target}" is not a published route`)
	}

	return errors
}

function isProtected(path: string, locales: readonly Locale[]): boolean {
	return (
		PROTECTED_PATHS.has(path) ||
		PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
		locales.some((locale) => path.startsWith(`/${locale}/`))
	)
}

function hasNamedPlaceholder(path: string): boolean {
	return /(?:^|\/):[^/]+/.test(path)
}
