import { getCollection } from 'astro:content'

import { siteRoot } from '../../config/site-root.ts'
import type { SiteConfig } from '../../config/site-schema.ts'
import { useTranslations } from '../../i18n/ui.ts'
import { assertBannerAssignments, requirePublishedPhoto } from '../banner/build-data.ts'
import type { BannerDocumentCollection } from '../banner/select.ts'
import {
	documentCourseStatus,
	type DocumentEntry,
	type PublishedDocument,
} from '../content/documents.ts'
import { deriveExcerpt } from '../content/excerpt.ts'
import type { Locale } from '../content/schemas.ts'
import { loadImageCatalog } from '../images/catalog.ts'
import { buildPictureModel } from '../images/media.ts'
import { resolvePhotoAlt } from '../portfolio/locale.ts'
import { indexById, type PhotoEntry } from '../portfolio/publication.ts'
import { SURFACE_SIZES } from '../portfolio/sizes.ts'
import { resolveSurfaceMedia } from '../portfolio/surface.ts'
import type { CardModel, DocumentCardSurface } from './select.ts'

// the card image is the banner cover (reference-locale `coverId`, ADR-0013): which photo represents
// a document is one editorial decision, so thumbnails have no second source

export async function resolveDocumentCards<E extends DocumentEntry>(
	documents: readonly PublishedDocument<E>[],
	locale: Locale,
	options: {
		href: (slug: string) => string
		surface: DocumentCardSurface
		collection: BannerDocumentCollection
		// `surfaces.*Index.ratio`; original keeps the cover's natural height
		ratio?: 'pano' | 'vista' | 'landscape' | 'square' | 'portrait' | 'original'
		siteConfig: Pick<SiteConfig, 'banners' | 'content' | 'modules'>
	},
): Promise<CardModel[]> {
	await assertBannerAssignments(options.siteConfig)

	const photosById = indexById(await getCollection('photos'))
	const catalog = loadImageCatalog(siteRoot)

	return documents.map((document) =>
		resolveDocumentCard(document, locale, options, { photosById, catalog }),
	)
}

export async function resolveMoreDocumentCard<E extends DocumentEntry>(
	document: PublishedDocument<E>,
	locale: Locale,
	options: {
		href: (slug: string) => string
		surface: DocumentCardSurface
		collection: BannerDocumentCollection
		sizes: string
		includeExcerpt: boolean
		includeMedia: boolean
		ratio?: 'pano' | 'vista' | 'landscape' | 'square' | 'portrait' | 'original'
		siteConfig: Pick<SiteConfig, 'banners' | 'content' | 'modules'>
	},
) {
	await assertBannerAssignments(options.siteConfig)
	return resolveDocumentCard(document, locale, options, {
		photosById: indexById(await getCollection('photos')),
		catalog: loadImageCatalog(siteRoot),
	})
}

function resolveDocumentCard<E extends DocumentEntry>(
	document: PublishedDocument<E>,
	locale: Locale,
	options: {
		href: (slug: string) => string
		surface: DocumentCardSurface
		collection: BannerDocumentCollection
		sizes?: string
		includeExcerpt?: boolean
		includeMedia?: boolean
		ratio?: 'pano' | 'vista' | 'landscape' | 'square' | 'portrait' | 'original'
		siteConfig: Pick<SiteConfig, 'content'>
	},
	resources: {
		photosById: ReadonlyMap<string, PhotoEntry>
		catalog: ReturnType<typeof loadImageCatalog>
	},
) {
	const entry = document.byLocale[locale]
	const target = {
		kind: 'document' as const,
		collection: options.collection,
		translationKey: document.translationKey,
	}
	const reference = document.byLocale[options.siteConfig.content.referenceLocale].data
	const photoId = reference.coverId
	// course status is a Tier-1 field, read from the reference locale (ADR-0013)
	const courseStatus = documentCourseStatus(reference)
	const includeMedia = options.includeMedia ?? true
	const cover =
		includeMedia && photoId
			? requirePublishedPhoto(resources.photosById, photoId, target)
			: undefined
	const media = cover
		? buildPictureModel(
				resolveSurfaceMedia(resources.catalog.manifest, cover.id, options.surface),
				{
					originBase: resources.catalog.originBase,
					alt: resolvePhotoAlt(cover.data, locale),
					sizes: options.sizes ?? SURFACE_SIZES[options.surface],
				},
			)
		: undefined
	const focal = cover?.data.focalPoint
	const excerpt =
		options.includeExcerpt === false ? undefined : deriveExcerpt(entry.data.excerpt, entry.body)
	return {
		href: options.href(document.slug),
		title: entry.data.title,
		...(excerpt ? { excerpt } : {}),
		...(media ? { media, photoId } : {}),
		...(media && focal ? { focal } : {}),
		...(includeMedia && !media ? { mediaPlaceholder: true } : {}),
		...(options.ratio ? { ratio: options.ratio } : {}),
		...(courseStatus
			? {
					badge: {
						status: courseStatus,
						label: useTranslations(locale)(`courses.status.${courseStatus}`),
					},
				}
			: {}),
	}
}
