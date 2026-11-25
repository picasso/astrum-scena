import { KEBAB_CASE_PATTERN } from '../../config/kebab-case.ts'
import type { CourseData } from '../../modules/courses/schema.ts'
import type { ContentEntry, ContentSnapshot } from './model.ts'
import type { ArticleData, Locale, PageData } from './schemas.ts'

export type IntegrityErrorCode =
	| 'duplicate-id'
	| 'duplicate-reference'
	| 'dynamic-album'
	| 'filename-mismatch'
	| 'inactive-locale'
	| 'locale-gap'
	| 'locale-mismatch'
	| 'missing-course-status'
	| 'missing-published-at'
	| 'nonreference-field'
	| 'place-cycle'
	| 'published-reference'
	| 'reference-marker'
	| 'route-collision'
	| 'unknown-reference'

export type IntegrityError = {
	code: IntegrityErrorCode
	entityId: string
	path: string
	message: string
}

export type IntegrityResult =
	| { success: true; errors: [] }
	| { success: false; errors: IntegrityError[]; totalErrorCount: number }

const MAX_ERRORS = 100

function addError(errors: IntegrityError[], error: IntegrityError): void {
	errors.push(error)
}

function checkUniqueEntryIds<T>(
	collection: string,
	entries: ContentEntry<T>[],
	errors: IntegrityError[],
): void {
	const seen = new Set<string>()
	for (const entry of entries) {
		if (!KEBAB_CASE_PATTERN.test(entry.id)) {
			addError(errors, {
				code: 'filename-mismatch',
				entityId: entry.id,
				path: `${collection}.id`,
				message: `Entry ID "${entry.id}" is not lowercase ASCII kebab-case`,
			})
		}
		if (seen.has(entry.id)) {
			addError(errors, {
				code: 'duplicate-id',
				entityId: entry.id,
				path: `${collection}.id`,
				message: `Duplicate ${collection} entry ID "${entry.id}"`,
			})
		}
		seen.add(entry.id)
	}
}

function checkUniqueDictionaryIds(
	name: string,
	values: { id: string }[],
	errors: IntegrityError[],
): void {
	const seen = new Set<string>()
	for (const value of values) {
		if (seen.has(value.id)) {
			addError(errors, {
				code: 'duplicate-id',
				entityId: value.id,
				path: `${name}.id`,
				message: `Duplicate ${name} ID "${value.id}"`,
			})
		}
		seen.add(value.id)
	}
}

// tier-1 document-level fields (ADR-0013) live only in the reference-locale file and are forbidden
// elsewhere, so they are not compared across locales; `slug`/`status` stay paired (checked below)
const TIER1_FIELDS = ['coverId', 'publishedAt', 'legacyId', 'courseStatus', 'unlisted'] as const

function checkDocumentPairs<T extends ArticleData | PageData | CourseData>(
	collection: 'articles' | 'pages' | 'courses',
	entries: ContentEntry<T>[],
	referenceLocale: Locale,
	activeLocales: readonly Locale[],
	errors: IntegrityError[],
): void {
	const pairByKey = Map.groupBy(entries, (entry) => entry.data.translationKey)
	const keyBySlug = new Map<string, string>()
	for (const [translationKey, pair] of pairByKey) {
		const locales = new Set<string>()
		for (const entry of pair) {
			const expectedId = `${entry.data.translationKey}-${entry.data.locale}`
			if (entry.id !== expectedId) {
				addError(errors, {
					code: 'filename-mismatch',
					entityId: entry.id,
					path: `${collection}.${entry.id}.id`,
					message: `Entry ID must be "${expectedId}" from filename/frontmatter`,
				})
			}
			if (locales.has(entry.data.locale)) {
				addError(errors, {
					code: 'duplicate-id',
					entityId: entry.id,
					path: `${collection}.${entry.id}.locale`,
					message: `Duplicate locale "${entry.data.locale}" for "${translationKey}"`,
				})
			}
			locales.add(entry.data.locale)
			if (!activeLocales.includes(entry.data.locale)) {
				addError(errors, {
					code: 'inactive-locale',
					entityId: entry.id,
					path: `${collection}.${entry.id}.locale`,
					message: `Locale "${entry.data.locale}" is not in content.locales (${activeLocales.join(', ')})`,
				})
			}
			// the marker records which reference body a translation came from; the reference has none
			if (
				entry.data.locale === referenceLocale &&
				entry.data.translatedFromDigest !== undefined
			) {
				addError(errors, {
					code: 'reference-marker',
					entityId: entry.id,
					path: `${collection}.${entry.id}.translatedFromDigest`,
					message: `translatedFromDigest is forbidden on the reference locale "${referenceLocale}"; it belongs on translations`,
				})
			}
			if (entry.data.locale !== referenceLocale) {
				for (const field of TIER1_FIELDS) {
					if ((entry.data as Record<string, unknown>)[field] !== undefined) {
						addError(errors, {
							code: 'nonreference-field',
							entityId: entry.id,
							path: `${collection}.${entry.id}.${field}`,
							message: `Tier-1 field "${field}" is forbidden on non-reference locale "${entry.data.locale}"; keep it only on "${referenceLocale}"`,
						})
					}
				}
			}
		}
		const first = pair[0]!
		const routeOwner = keyBySlug.get(first.data.slug)
		if (routeOwner && routeOwner !== translationKey) {
			addError(errors, {
				code: 'route-collision',
				entityId: first.id,
				path: `${collection}.${first.id}.slug`,
				message: `Slug "${first.data.slug}" belongs to both "${routeOwner}" and "${translationKey}"`,
			})
		}
		keyBySlug.set(first.data.slug, translationKey)
		for (const entry of pair.slice(1)) {
			if (entry.data.slug !== first.data.slug || entry.data.status !== first.data.status) {
				addError(errors, {
					code: 'locale-mismatch',
					entityId: entry.id,
					path: `${collection}.${entry.id}`,
					message: `Locale variants for "${translationKey}" disagree on slug/status`,
				})
			}
		}
		const published = pair.some((entry) => entry.data.status === 'published')
		// a published document exists in every active locale (`content.locales`)
		if (published && activeLocales.some((locale) => !locales.has(locale))) {
			addError(errors, {
				code: 'locale-gap',
				entityId: translationKey,
				path: `${collection}.${translationKey}.locale`,
				message: `Published pair "${translationKey}" requires every active locale (${activeLocales.join(', ')})`,
			})
		}
		// `publishedAt` is a reference-locale Tier-1 field (ADR-0013), so the published ⇒ publishedAt
		// rule is checked on the pair's reference entry rather than in the per-file schema
		if (published && collection === 'articles') {
			const reference = pair.find((entry) => entry.data.locale === referenceLocale)
			if (
				reference &&
				(reference.data as { publishedAt?: string }).publishedAt === undefined
			) {
				addError(errors, {
					code: 'missing-published-at',
					entityId: reference.id,
					path: `${collection}.${reference.id}.publishedAt`,
					message: `Published article "${translationKey}" requires publishedAt on the reference locale "${referenceLocale}"`,
				})
			}
		}
		// `courseStatus` is Tier-1: a course declares archive/current on its reference locale regardless
		// of status
		if (collection === 'courses') {
			const reference = pair.find((entry) => entry.data.locale === referenceLocale)
			if (reference && (reference.data as CourseData).courseStatus === undefined) {
				addError(errors, {
					code: 'missing-course-status',
					entityId: reference.id,
					path: `${collection}.${reference.id}.courseStatus`,
					message: `Course "${translationKey}" requires courseStatus (archive | current) on the reference locale "${referenceLocale}"`,
				})
			}
		}
	}
}

function checkPlaces(snapshot: ContentSnapshot, errors: IntegrityError[]): void {
	const byId = new Map(snapshot.places.map((place) => [place.id, place]))
	for (const place of snapshot.places) {
		if (place.parentId && !byId.has(place.parentId)) {
			addError(errors, {
				code: 'unknown-reference',
				entityId: place.id,
				path: `places.${place.id}.parentId`,
				message: `Unknown parent place "${place.parentId}"`,
			})
			continue
		}
		const visited = new Set([place.id])
		let current = place
		while (current.parentId) {
			if (visited.has(current.parentId)) {
				addError(errors, {
					code: 'place-cycle',
					entityId: place.id,
					path: `places.${place.id}.parentId`,
					message: `Place hierarchy cycle includes "${current.parentId}"`,
				})
				break
			}
			visited.add(current.parentId)
			const parent = byId.get(current.parentId)
			if (!parent) break
			current = parent
		}
	}
}

// `locales` is the site's `content.locales`
export function validateContentSnapshot(
	snapshot: ContentSnapshot,
	referenceLocale: Locale,
	locales: readonly Locale[],
): IntegrityResult {
	const errors: IntegrityError[] = []
	checkUniqueEntryIds('albums', snapshot.albums, errors)
	checkUniqueEntryIds('photos', snapshot.photos, errors)
	checkUniqueEntryIds('articles', snapshot.articles, errors)
	checkUniqueEntryIds('pages', snapshot.pages, errors)
	checkUniqueEntryIds('courses', snapshot.courses, errors)
	checkUniqueDictionaryIds('categories', snapshot.categories, errors)
	checkUniqueDictionaryIds('places', snapshot.places, errors)
	checkUniqueDictionaryIds('tags', snapshot.tags, errors)

	const photos = new Map(snapshot.photos.map((photo) => [photo.id, photo]))
	const places = new Set(snapshot.places.map((place) => place.id))
	const tags = new Set(snapshot.tags.map((tag) => tag.id))
	const categories = new Set(snapshot.categories.map((category) => category.id))

	for (const album of snapshot.albums) {
		if (['recent-works', 'favorites'].includes(album.id)) {
			addError(errors, {
				code: 'dynamic-album',
				entityId: album.id,
				path: `albums.${album.id}`,
				message: `"${album.id}" is a derived slice and cannot be persisted as an album`,
			})
		}
		if (!categories.has(album.data.category)) {
			addError(errors, {
				code: 'unknown-reference',
				entityId: album.id,
				path: `albums.${album.id}.category`,
				message: `Unknown category "${album.data.category}"`,
			})
		}
		const seenPhotoIds = new Set<string>()
		for (const photoId of album.data.photoIds) {
			if (seenPhotoIds.has(photoId)) {
				addError(errors, {
					code: 'duplicate-reference',
					entityId: album.id,
					path: `albums.${album.id}.photoIds`,
					message: `Duplicate photo reference "${photoId}"`,
				})
			}
			seenPhotoIds.add(photoId)
			const photo = photos.get(photoId)
			if (!photo) {
				addError(errors, {
					code: 'unknown-reference',
					entityId: album.id,
					path: `albums.${album.id}.photoIds`,
					message: `Unknown photo "${photoId}"`,
				})
			} else if (album.data.status === 'published' && photo.data.status !== 'published') {
				addError(errors, {
					code: 'published-reference',
					entityId: album.id,
					path: `albums.${album.id}.photoIds`,
					message: `Published album cannot reference draft photo "${photoId}"`,
				})
			}
		}
	}

	for (const photo of snapshot.photos) {
		if (photo.data.placeId && !places.has(photo.data.placeId)) {
			addError(errors, {
				code: 'unknown-reference',
				entityId: photo.id,
				path: `photos.${photo.id}.placeId`,
				message: `Unknown place "${photo.data.placeId}"`,
			})
		}
		for (const tag of photo.data.tags) {
			if (!tags.has(tag)) {
				addError(errors, {
					code: 'unknown-reference',
					entityId: photo.id,
					path: `photos.${photo.id}.tags`,
					message: `Unknown tag "${tag}"`,
				})
			}
		}
	}

	checkPlaces(snapshot, errors)
	checkDocumentPairs('articles', snapshot.articles, referenceLocale, locales, errors)
	checkDocumentPairs('pages', snapshot.pages, referenceLocale, locales, errors)
	checkDocumentPairs('courses', snapshot.courses, referenceLocale, locales, errors)
	return errors.length
		? { success: false, errors: errors.slice(0, MAX_ERRORS), totalErrorCount: errors.length }
		: { success: true, errors: [] }
}
