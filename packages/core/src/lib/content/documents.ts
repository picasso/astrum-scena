import type { ArticlesOrder } from '../../config/site-schema.ts'
import type { CourseData, CourseStatus } from '../../modules/courses/schema.ts'
import type { ArticleData, Locale, PageData } from './schemas.ts'

// publication contract of localized documents, free of astro:content so it is unit-testable and the
// routes stay thin; fail-closed: a route only gets a complete published set of the active locales
// with one shared slug, unique within its route family

export type DocumentData = ArticleData | PageData | CourseData

export type DocumentEntry<D extends DocumentData = DocumentData> = {
	id: string
	data: D
	// raw markdown, needed where an excerpt is derived from the body (lib/content/excerpt.ts)
	body?: string
}

// `byLocale` holds exactly the active locales of the site
export type PublishedDocument<E extends DocumentEntry> = {
	translationKey: string
	slug: string
	byLocale: Record<Locale, E>
}

export type DocumentLocales = { locales: readonly Locale[]; referenceLocale: Locale }

// the entry of a locale the document holds; asking for another one is a caller's error, never a
// fallback to some other locale's entry
export function documentIn<E>(
	document: { byLocale: Readonly<Record<Locale, E>> },
	locale: Locale,
): E {
	if (!Object.hasOwn(document.byLocale, locale))
		throw new Error(`the document has no "${locale}" entry`)
	return document.byLocale[locale]!
}

// reference-locale fields (ADR-0013, `TIER1_FIELDS` in integrity.ts) exist only in the reference
// file, so callers pass these accessors that file's data; the reference locale comes from config
// (`content.referenceLocale`) and is a parameter, never hardcoded

// a course's status, which a document card shows as a badge; other documents have none
export function documentCourseStatus(data: DocumentData): CourseStatus | undefined {
	return 'courseStatus' in data ? data.courseStatus : undefined
}

export function documentPublishedAt(data: DocumentData): string | undefined {
	return 'publishedAt' in data ? data.publishedAt : undefined
}

// reference-locale field (ADR-0010/0013), read from the pair's reference entry
export function documentUnlisted(data: DocumentData): boolean {
	return data.unlisted === true
}

// no family filter here: an `include` test reads the reference entry only, so filtering per entry
// would drop the non-reference file and resolvePair would fail with a missing locale
function groupByTranslationKey<E extends DocumentEntry>(entries: readonly E[]): Map<string, E[]> {
	const groups = new Map<string, E[]>()
	for (const entry of entries) {
		const group = groups.get(entry.data.translationKey)
		if (group) group.push(entry)
		else groups.set(entry.data.translationKey, [entry])
	}
	return groups
}

// a broken pair fails the build instead of silently losing a route
function resolvePair<E extends DocumentEntry>(
	translationKey: string,
	group: readonly E[],
	{ locales, referenceLocale }: DocumentLocales,
): Record<Locale, E> | undefined {
	const byLocale = new Map<Locale, E>()
	for (const entry of group) {
		if (byLocale.has(entry.data.locale)) {
			throw new Error(
				`document "${translationKey}" has duplicate locale "${entry.data.locale}"`,
			)
		}
		byLocale.set(entry.data.locale, entry)
	}
	if (!group.some((entry) => entry.data.status === 'published')) return undefined

	const pair = {} as Record<Locale, E>
	for (const locale of locales) {
		const entry = byLocale.get(locale)
		if (!entry) {
			throw new Error(`published document "${translationKey}" is missing locale "${locale}"`)
		}
		if (entry.data.status !== 'published') {
			throw new Error(
				`document "${translationKey}" is published in one locale but "${entry.data.status}" in "${locale}"`,
			)
		}
		pair[locale] = entry
	}

	const reference = documentIn({ byLocale: pair }, referenceLocale)
	for (const locale of locales) {
		if (documentIn({ byLocale: pair }, locale).data.slug !== reference.data.slug) {
			throw new Error(`published document "${translationKey}" has locale-specific slugs`)
		}
	}
	return pair
}

// published set of one route family (articles, courses or generic pages); `include` tests the
// group's reference entry, and slugs are unique within the family's URL space
export function collectPublishedDocuments<E extends DocumentEntry>(
	entries: readonly E[],
	content: DocumentLocales,
	include: (data: DocumentData) => boolean = () => true,
): PublishedDocument<E>[] {
	const { referenceLocale } = content
	const documents: PublishedDocument<E>[] = []
	const translationKeyBySlug = new Map<string, string>()
	for (const [translationKey, group] of groupByTranslationKey(entries)) {
		// falling back to the first entry is safe: if `include` keeps a group without the reference
		// locale, it still fails in resolvePair
		const reference = group.find((entry) => entry.data.locale === referenceLocale) ?? group[0]!
		if (!include(reference.data)) continue
		const byLocale = resolvePair(translationKey, group, content)
		if (!byLocale) continue
		const slug = documentIn({ byLocale }, referenceLocale).data.slug
		const owner = translationKeyBySlug.get(slug)
		if (owner) {
			throw new Error(
				`published documents "${owner}" and "${translationKey}" share the slug "${slug}"`,
			)
		}
		translationKeyBySlug.set(slug, translationKey)
		documents.push({ translationKey, slug, byLocale })
	}
	return documents.sort((left, right) => left.slug.localeCompare(right.slug))
}

// for discovery indexes only (ADR-0010): `documentStaticPaths` takes the full published set, so an
// unlisted document keeps its route and embeds; mirrors `getListableAlbums` in the portfolio layer
export function selectListableDocuments<E extends DocumentEntry>(
	documents: readonly PublishedDocument<E>[],
	referenceLocale: Locale,
): PublishedDocument<E>[] {
	return documents.filter(
		(document) => !documentUnlisted(documentIn(document, referenceLocale).data),
	)
}

// newest first by the reference locale's `publishedAt` (ADR-0013); slug breaks ties
export function orderByPublishedAt<E extends DocumentEntry>(
	documents: readonly PublishedDocument<E>[],
	referenceLocale: Locale,
): PublishedDocument<E>[] {
	return [...documents].sort((left, right) => {
		const leftDate = documentPublishedAt(documentIn(left, referenceLocale).data) ?? ''
		const rightDate = documentPublishedAt(documentIn(right, referenceLocale).data) ?? ''
		if (leftDate !== rightDate) return rightDate.localeCompare(leftDate)
		return left.slug.localeCompare(right.slug)
	})
}

// `title` sorts by the current locale's title, so EN and RU orders differ by design
export function orderDocuments<E extends DocumentEntry>(
	documents: readonly PublishedDocument<E>[],
	order: ArticlesOrder,
	locale: Locale,
	referenceLocale: Locale,
): PublishedDocument<E>[] {
	if (order === 'newest') return orderByPublishedAt(documents, referenceLocale)
	return [...documents].sort((left, right) => {
		const byTitle = documentIn(left, locale).data.title.localeCompare(
			documentIn(right, locale).data.title,
			locale,
		)
		return byTitle !== 0 ? byTitle : left.slug.localeCompare(right.slug)
	})
}

export function findPublishedDocument<E extends DocumentEntry>(
	documents: readonly PublishedDocument<E>[],
	slug: string,
): PublishedDocument<E> | undefined {
	return documents.find((document) => document.slug === slug)
}

export function documentStaticPaths<E extends DocumentEntry>(
	documents: readonly PublishedDocument<E>[],
): { params: { slug: string } }[] {
	return documents.map((document) => ({ params: { slug: document.slug } }))
}
