import { readFileSync } from 'node:fs'
import path from 'node:path'

import { getCollection } from 'astro:content'

import { defaultLocale, type SiteConfig } from '../../config/site-schema.ts'
import { COURSES_MODULE_ID } from '../../modules/courses/manifest.ts'
import { courseHref } from '../../modules/courses/routes.ts'
import { isModuleEnabled } from '../../modules/registry.ts'
import type { DocumentData } from '../content/documents.ts'
import { articleHref, pageHref } from '../content/routes.ts'
import type { Locale } from '../content/schemas.ts'
import {
	resolveTranslationFreshness,
	type TranslationFreshness,
} from '../content/translation-freshness.ts'
import { loadReleaseDescriptor } from '../images/release.ts'
import { getPublishedAlbums, getPublishedPhotos } from '../portfolio/publication.ts'

// server-only model of the `/status/` page, built from Content Collections and the tracked image
// descriptor with no network, env secrets, mtime, Git or live R2; the clock is injected so unit
// tests stay deterministic
//
// the page is public by URL: draft rows show a title but no slug or route link, and the image summary
// never exposes SHAs, manifest keys, R2 origin, rights IDs or configDigest

// courses come from the courses module's collection, a section of their own as on the site
export type DocumentCollection = 'articles' | 'courses' | 'pages'
export type StatusSection = DocumentCollection

// independent of astro:content types so tests do not need the Astro container
export type StatusDocumentEntry = {
	data: Pick<DocumentData, 'translationKey' | 'locale' | 'slug' | 'title' | 'status'> & {
		courseStatus?: 'archive' | 'current'
		translatedFromDigest?: string
		// ISO date or datetime; not shown for courses
		publishedAt?: string
	}
	body?: string
}

// drafts show a title too (anonymous rows are useless); only published pairs with a real document
// route get `routeHref`
export type StatusTranslationRow = {
	section: StatusSection
	published: boolean
	status: TranslationFreshness
	// freshness of the translations for the translation column (the first stale one wins): up-to-date —
	// the marker matches the current reference body; outdated — the reference changed after translation;
	// unverified — the translation has no marker. Always up-to-date on a one-locale site.
	translation: StatusTranslationState
	title: string
	routeHref?: string
	// courses show an Archive / Open badge instead of a date
	courseStatus?: 'archive' | 'current'
	// formatted as month, year by the page
	publishedAt?: string
}

export type StatusTranslationState = 'up-to-date' | 'outdated' | 'unverified'

export type StatusTranslationSummary = {
	totalPairs: number
	publishedPairs: number
	current: number
	needsReview: number
}

export type StatusContentAggregates = {
	publishedArticlePairs: number
	// only with the courses module enabled
	publishedCoursePairs?: number
	publishedPagePairs: number
	publishedPhotos: number
	publishedAlbums: number
}

// no keys, hashes, origin or configDigest, and no claim about live R2/CDN availability
export type StatusImageRelease = {
	active: boolean
	assetCount: number
}

export type SiteStatusModel = {
	// UTC time of the snapshot (injected clock), not a content change, deploy or CDN health date
	generatedAt: string
	// shown in the snapshot caption
	version: string
	translations: {
		// translated (non-reference) locales in `content.locales` order; empty on a one-locale site, which
		// has no freshness to show
		locales: Locale[]
		// language of the row titles (the display locale), which can differ from the English service copy
		titleLocale: Locale
		summary: StatusTranslationSummary
		rows: StatusTranslationRow[]
	}
	content: StatusContentAggregates
	imageRelease: StatusImageRelease
}

// two distinct locale roles (ADR-0013): displayLocale is the language of `/status/` itself (titles
// and route links); referenceLocale holds the Tier-1 fields (`courseStatus`, `publishedAt`) that live
// only there. slug and status are paired, so they are read from displayLocale
type StatusLocales = {
	locales: readonly Locale[]
	displayLocale: Locale
	referenceLocale: Locale
	translatedLocales: readonly Locale[]
}

type DocumentPair = {
	collection: DocumentCollection
	translationKey: string
	byLocale: Record<Locale, StatusDocumentEntry>
}

// every pair, drafts included, since the page shows each translation's state; an incomplete pair or a
// duplicate locale fails the build instead of being skipped
function pairDocuments(
	collection: DocumentCollection,
	entries: readonly StatusDocumentEntry[],
	locales: readonly Locale[],
): DocumentPair[] {
	const groups = new Map<string, Map<Locale, StatusDocumentEntry>>()
	for (const entry of entries) {
		const key = entry.data.translationKey
		let byLocale = groups.get(key)
		if (!byLocale) {
			byLocale = new Map()
			groups.set(key, byLocale)
		}
		if (byLocale.has(entry.data.locale)) {
			throw new Error(
				`document "${collection}/${key}" has duplicate locale "${entry.data.locale}"`,
			)
		}
		byLocale.set(entry.data.locale, entry)
	}

	const pairs: DocumentPair[] = []
	for (const [translationKey, byLocale] of groups) {
		const resolved = {} as Record<Locale, StatusDocumentEntry>
		for (const locale of locales) {
			const entry = byLocale.get(locale)
			if (!entry) {
				throw new Error(
					`document "${collection}/${translationKey}" is missing locale "${locale}"`,
				)
			}
			resolved[locale] = entry
		}
		pairs.push({ collection, translationKey, byLocale: resolved })
	}
	return pairs
}

// `home` is the homepage and has no document route even when published. slug and status come from
// displayLocale
function documentRouteHref(pair: DocumentPair, roles: StatusLocales): string | undefined {
	const { displayLocale } = roles
	const display = pair.byLocale[displayLocale].data
	if (display.status !== 'published') return undefined
	if (pair.collection === 'articles') return articleHref(display.slug, displayLocale)
	if (pair.collection === 'courses') return courseHref(display.slug, displayLocale)
	if (display.slug === 'home' || pair.translationKey === 'privacy') return undefined
	return pageHref(display.slug, displayLocale)
}

// the first stale translation of the document; a one-locale site has nothing to translate
function documentFreshness(
	pair: DocumentPair,
	roles: StatusLocales,
): ReturnType<typeof resolveTranslationFreshness> {
	const referenceBody = pair.byLocale[roles.referenceLocale].body ?? ''
	const results = roles.translatedLocales.map((locale) =>
		resolveTranslationFreshness({
			referenceBody,
			translationMarker: pair.byLocale[locale].data.translatedFromDigest,
		}),
	)
	return results.find((result) => result.status === 'needs-review') ?? { status: 'current' }
}

type BuiltRow = {
	sortKey: string
	row: StatusTranslationRow
}

function buildRow(pair: DocumentPair, roles: StatusLocales): BuiltRow {
	const display = pair.byLocale[roles.displayLocale].data
	const reference = pair.byLocale[roles.referenceLocale].data
	const published = display.status === 'published'
	const freshness = documentFreshness(pair, roles)
	const section: StatusSection = pair.collection
	const row: StatusTranslationRow = {
		section,
		published,
		status: freshness.status,
		translation:
			freshness.status === 'current'
				? 'up-to-date'
				: freshness.reason === 'digest-mismatch'
					? 'outdated'
					: 'unverified',
		// `/status/` titles are deliberately in displayLocale
		title: display.title,
	}
	const href = documentRouteHref(pair, roles)
	if (href) row.routeHref = href
	// courses show a status instead of a date, since only those moved from Articles have a date
	if (section === 'courses' && reference.courseStatus) row.courseStatus = reference.courseStatus
	else if (published && reference.publishedAt) row.publishedAt = reference.publishedAt
	// translationKey only orders rows and is never emitted for drafts
	return {
		sortKey: `${section}\u0000${published ? '0' : '1'}\u0000${pair.translationKey}`,
		row,
	}
}

export type SiteStatusInput = {
	articles: readonly StatusDocumentEntry[]
	pages: readonly StatusDocumentEntry[]
	// undefined while the courses module is disabled, which drops the section from the page
	courses?: readonly StatusDocumentEntry[]
	publishedPhotos: number
	publishedAlbums: number
	imageRelease: StatusImageRelease
	// the first locale is the page language; referenceLocale holds the Tier-1 fields (ADR-0013)
	content: Pick<SiteConfig['content'], 'locales' | 'referenceLocale'>
	// injected from the static build boundary to keep tests deterministic
	generatedAt: Date
	version: string
}

// pure and deterministic: no astro:content or fs
export function buildSiteStatusModel(input: SiteStatusInput): SiteStatusModel {
	const { locales, referenceLocale } = input.content
	const roles: StatusLocales = {
		locales,
		displayLocale: defaultLocale(input),
		referenceLocale,
		translatedLocales: locales.filter((locale) => locale !== referenceLocale),
	}
	const pairs = [
		...pairDocuments('articles', input.articles, roles.locales),
		...pairDocuments('pages', input.pages, roles.locales),
		...pairDocuments('courses', input.courses ?? [], roles.locales),
	]
	const built = pairs
		.map((pair) => buildRow(pair, roles))
		.sort((left, right) => left.sortKey.localeCompare(right.sortKey))
	const rows = built.map((entry) => entry.row)

	const publishedIn = (section: StatusSection) =>
		rows.filter((r) => r.section === section && r.published).length
	const publishedArticlePairs = publishedIn('articles')
	const publishedCoursePairs = publishedIn('courses')
	const publishedPagePairs = publishedIn('pages')
	const summary: StatusTranslationSummary = {
		totalPairs: rows.length,
		publishedPairs: publishedArticlePairs + publishedCoursePairs + publishedPagePairs,
		current: rows.filter((r) => r.status === 'current').length,
		needsReview: rows.filter((r) => r.status === 'needs-review').length,
	}

	return {
		generatedAt: input.generatedAt.toISOString(),
		version: input.version,
		translations: {
			locales: [...roles.translatedLocales],
			titleLocale: roles.displayLocale,
			summary,
			rows,
		},
		content: {
			publishedArticlePairs,
			...(input.courses ? { publishedCoursePairs } : {}),
			publishedPagePairs,
			publishedPhotos: input.publishedPhotos,
			publishedAlbums: input.publishedAlbums,
		},
		imageRelease: input.imageRelease,
	}
}

// the version shown is the site's own, from the site root's package.json
function readSiteVersion(root: string): string {
	const raw = readFileSync(path.join(root, 'package.json'), 'utf8')
	const version = (JSON.parse(raw) as { version?: unknown }).version
	if (typeof version !== 'string' || version.length === 0) {
		throw new Error('package.json is missing a string "version"')
	}
	return version
}

// descriptor schema/invariant errors stay build failures (loadReleaseDescriptor throws) instead of
// turning into a misleading red status
export async function loadSiteStatus(
	generatedAt: Date,
	config: Pick<SiteConfig, 'content' | 'modules'>,
	root: string,
): Promise<SiteStatusModel> {
	const [articles, pages, courses, photos, albums] = await Promise.all([
		getCollection('articles'),
		getCollection('pages'),
		isModuleEnabled(config, COURSES_MODULE_ID) ? getCollection('courses') : undefined,
		getCollection('photos'),
		getCollection('albums'),
	])
	const { descriptor } = loadReleaseDescriptor(root)
	return buildSiteStatusModel({
		articles,
		pages,
		...(courses ? { courses } : {}),
		publishedPhotos: getPublishedPhotos(photos).length,
		publishedAlbums: getPublishedAlbums(albums).length,
		imageRelease: {
			active: descriptor.active,
			assetCount: Object.keys(descriptor.manifest.photos).length,
		},
		content: config.content,
		generatedAt,
		version: readSiteVersion(root),
	})
}
