import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { parse as parseYaml } from 'yaml'

import { UPGRADE_HINT } from '../config/lock.ts'
import { assertSchemaVersion } from '../config/schema-version.ts'
import { validate } from '../config/yaml-file.ts'
import { FEATURED_HOME_PATH, lockedLocales } from './content/files'
import type { ContentEntry, ContentSnapshot } from './content/model'
import { contentHref } from './content/routes'
import {
	type AlbumData,
	type ArticleData,
	type FeaturedConfig,
	featuredConfigSchemaFor,
	type FeaturedInlineCopy,
	type Locale,
	type PageData,
	type PhotoData,
} from './content/schemas'
import { computeAlt } from './hero-alt'
import type { PhotoMedia } from './images/media'
import { pickLocale } from './portfolio/locale.ts'
import { type SplitHeading, splitHeading } from './split-heading'
import { cleanText, truncateSentences } from './text'

// every slide's media comes from the active manifest by (photoId, 'hero'), never photo.data.media
// (ADR-0012); the resolver stays snapshot-pure, so the manifest and document bodies are injected
// through `resolvePhotoMedia` and `resolveDocumentExcerpt`

// a site without the file (one with no photos yet) gets a home page without the slider; a file that
// exists must still hold at least one valid slide
export async function loadFeaturedHome(
	root: string,
	locales: readonly Locale[] = lockedLocales(root),
): Promise<FeaturedConfig | undefined> {
	let raw: string
	try {
		raw = await readFile(path.join(root, FEATURED_HOME_PATH), 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
		throw error
	}
	const value: unknown = parseYaml(raw)
	const schema = featuredConfigSchemaFor(locales)
	assertSchemaVersion(value, FEATURED_HOME_PATH, schema, UPGRADE_HINT)
	return validate(schema, value, FEATURED_HOME_PATH)
}

// throws when the photo or its hero role is missing (fail-closed)
export type FeaturedHeroMediaResolver = (photoId: string) => PhotoMedia

// frontmatter excerpt first, else derived from the body; undefined when there is no description
export type FeaturedExcerptResolver = (
	target: { collection: 'articles' | 'pages'; slug: string },
	locale: Locale,
) => string | undefined

export type ResolvedFeaturedSlide = {
	id: string
	align: 'left' | 'right'
	// fixed colors, not theme tokens: `accent` is yellow, `alt` is red
	accent: 'accent' | 'alt'
	// the adapter builds a PictureModel from it, so object keys stay on the server
	media: PhotoMedia
	title: SplitHeading
	desc: string
	alt: string
	link: { kind: 'album' | 'page'; href: string; label: string }
}

export type FeaturedLabelProvider = (linkKind: 'album' | 'page', locale: Locale) => string

export type ResolveFeaturedOptions = {
	resolvePhotoMedia: FeaturedHeroMediaResolver
	// the snapshot carries no document bodies, so the excerpt is derived in the Astro adapter; it is
	// the only description source for copySource:target
	resolveDocumentExcerpt: FeaturedExcerptResolver
	truncateBudget?: number
	albumAccent?: 'accent' | 'alt'
	// `coverId` lives only on the reference-locale entry (ADR-0013)
	referenceLocale: Locale
	// the alt text of a slide with neither title nor description, already in the slide locale
	genericAlt: string
}

function requiredEntry<T>(
	values: ContentEntry<T>[],
	predicate: (entry: ContentEntry<T>) => boolean,
	message: string,
): ContentEntry<T> {
	const matches = values.filter(predicate)
	if (matches.length !== 1) throw new Error(`${message}; found ${matches.length}`)
	return matches[0]!
}

function photoCopy(photo: ContentEntry<PhotoData>, locale: Locale) {
	return {
		title: pickLocale(photo.data.title, locale),
		description: photo.data.description ? pickLocale(photo.data.description, locale) : '',
	}
}

function inlineCopy(
	copy: FeaturedInlineCopy | undefined,
	locale: Locale,
): { title: string; description: string } {
	if (!copy) throw new Error('Inline copySource requires an inline copy block')
	return {
		title: pickLocale(copy.title, locale),
		description: pickLocale(copy.description, locale),
	}
}

function albumMedia(
	snapshot: ContentSnapshot,
	album: ContentEntry<AlbumData>,
	photoSlug?: string,
): ContentEntry<PhotoData> {
	const photoId = photoSlug ?? album.data.coverId
	if (!album.data.photoIds.includes(photoId)) {
		throw new Error(`Featured media "${photoId}" is not in album "${album.id}"`)
	}
	return requiredEntry(
		snapshot.photos,
		(photo) => photo.id === photoId,
		`Featured photo "${photoId}" not found`,
	)
}

function documentTarget<T extends ArticleData | PageData>(
	entries: ContentEntry<T>[],
	slug: string,
	locale: Locale,
): ContentEntry<T> {
	return requiredEntry(
		entries,
		(entry) => entry.data.slug === slug && entry.data.locale === locale,
		`Featured document "${slug}" locale "${locale}" not found`,
	)
}

// the Tier-1 field `coverId` lives only on the reference-locale entry (ADR-0013)
function referenceDocument<T extends ArticleData | PageData>(
	entries: ContentEntry<T>[],
	entry: ContentEntry<T>,
	locale: Locale,
	referenceLocale: Locale,
): ContentEntry<T> {
	return locale === referenceLocale
		? entry
		: documentTarget(entries, entry.data.slug, referenceLocale)
}

function documentMediaId(
	entries: ContentEntry<ArticleData | PageData>[],
	entry: ContentEntry<ArticleData | PageData>,
	locale: Locale,
	referenceLocale: Locale,
): string {
	const coverId = referenceDocument(entries, entry, locale, referenceLocale).data.coverId
	if (!coverId) {
		throw new Error(
			`Featured document "${entry.data.slug}" has no coverId for mediaSource: target; ` +
				'set coverId on its reference-locale entry or use mediaSource.photoSlug',
		)
	}
	return coverId
}

export function resolveFeaturedSlides(
	snapshot: ContentSnapshot,
	config: FeaturedConfig,
	locale: Locale,
	labelProvider: FeaturedLabelProvider,
	options: ResolveFeaturedOptions,
): ResolvedFeaturedSlide[] {
	const referenceLocale = options.referenceLocale
	const truncateBudget = options.truncateBudget ?? 400
	const albumAccent = options.albumAccent ?? 'accent'
	return config.slides.map((slide) => {
		let title: string
		let description: string
		let photo: ContentEntry<PhotoData>
		if (slide.target.collection === 'albums') {
			const album = requiredEntry(
				snapshot.albums,
				(entry) => entry.id === slide.target.slug,
				`Featured album "${slide.target.slug}" not found`,
			)
			if (album.data.status !== 'published') {
				throw new Error(`Featured album "${slide.target.slug}" is not published`)
			}
			photo = albumMedia(
				snapshot,
				album,
				typeof slide.mediaSource === 'string' ? undefined : slide.mediaSource.photoSlug,
			)
			const copy =
				slide.copySource === 'inline'
					? inlineCopy(slide.copy, locale)
					: slide.copySource === 'target'
						? {
								title: pickLocale(album.data.title, locale),
								description: pickLocale(album.data.description, locale),
							}
						: photoCopy(photo, locale)
			title = copy.title
			description = copy.description
		} else {
			const entries =
				slide.target.collection === 'articles' ? snapshot.articles : snapshot.pages
			const document =
				slide.target.collection === 'articles'
					? documentTarget(snapshot.articles, slide.target.slug, locale)
					: documentTarget(snapshot.pages, slide.target.slug, locale)
			if (document.data.status !== 'published') {
				throw new Error(
					`Featured document "${slide.target.slug}" (${locale}) is not published`,
				)
			}
			const photoSlug =
				typeof slide.mediaSource === 'string'
					? documentMediaId(entries, document, locale, referenceLocale)
					: slide.mediaSource.photoSlug
			photo = requiredEntry(
				snapshot.photos,
				(entry) => entry.id === photoSlug,
				`Featured photo "${photoSlug}" not found`,
			)
			if (slide.copySource === 'inline') {
				const copy = inlineCopy(slide.copy, locale)
				title = copy.title
				description = copy.description
			} else if (slide.copySource === 'target') {
				const excerpt = options.resolveDocumentExcerpt(
					{ collection: slide.target.collection, slug: slide.target.slug },
					locale,
				)
				if (!excerpt) {
					throw new Error(
						`Featured document "${slide.target.slug}" (${locale}) has no excerpt`,
					)
				}
				title = document.data.title
				description = excerpt
			} else {
				const copy = photoCopy(photo, locale)
				title = copy.title
				description = copy.description
			}
		}
		if (photo.data.status !== 'published') {
			throw new Error(`Featured photo "${photo.id}" is not published`)
		}
		const media = options.resolvePhotoMedia(photo.id)
		// fail closed if the injected adapter returns another photo's media
		if (media.photoId !== photo.id) {
			throw new Error(`Featured media for "${photo.id}" resolved to photo "${media.photoId}"`)
		}
		const cleanTitle = cleanText(title)
		const cleanDescription = cleanText(description)
		return {
			id: slide.id,
			align: slide.align,
			accent: slide.target.linkKind === 'album' ? albumAccent : 'alt',
			media,
			title: splitHeading(cleanTitle),
			desc: truncateSentences(cleanDescription, truncateBudget),
			alt: computeAlt({
				title: cleanTitle,
				desc: cleanDescription,
				fallback: options.genericAlt,
			}),
			link: {
				kind: slide.target.linkKind,
				href: contentHref(slide.target, locale),
				label: labelProvider(slide.target.linkKind, locale),
			},
		}
	})
}
