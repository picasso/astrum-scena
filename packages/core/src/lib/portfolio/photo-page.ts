import { localeEntry } from '../../config/locale-schema.ts'
import { lucideIconSvg } from '../../config/lucide-icons.ts'
import { lucideIconsDir } from '../../config/lucide-icons-dir.ts'
import { siteRoot } from '../../config/site-root.ts'
import type { SiteConfig } from '../../config/site-schema.ts'
import { loadTaxonomyConfig } from '../content/files.ts'
import type { Locale } from '../content/schemas.ts'
import { loadImageCatalog } from '../images/catalog.ts'
import { buildPictureModel, type PictureModel } from '../images/media.ts'
import { type SplitHeading, splitHeading } from '../split-heading.ts'
import { resolvePublishedPhoto } from './build-data.ts'
import { formatCapturedAt } from './captured.ts'
import {
	projectAlbumText,
	projectPhotoText,
	resolvePhotoAlt,
	resolvePhotoDisplayName,
} from './locale.ts'
import { SURFACE_SIZES } from './sizes.ts'
import { resolveSurfaceMedia } from './surface.ts'
import {
	type ResolvedDimensionValue,
	resolveDimensionValues,
	type ResolvedTag,
	resolvePlaceHierarchy,
	resolveTagLabels,
} from './taxonomy.ts'
import { buildViewerData } from './viewer-data.ts'

// model of the contextual photo page `/{locale}/portfolio/{album}/{photo}/`, shared by both locales
// so en/ru pages stay thin; a draft or mismatched URL gets no static path and a missing media role
// fails the build

export type PhotoRelatedCard = {
	href: string
	media: PictureModel
	title: string
}

// clicking the primary photo opens it in the lightbox, as on the legacy site; the markup contract
// matches album-grid (`a.album-photo` with `data-pswp-*`) so the same island binds by selector
export type PhotoViewer = {
	width: number
	height: number
	src: string
	srcset: string
	caption: string
}

export type PhotoPageModel = {
	title: string
	// the H1 is split like the legacy theme's headings: head in the main colour, tail in an accent
	// span; `title` stays whole for <title> and meta
	titleSplit: SplitHeading
	description?: string
	caption?: string
	captured?: string
	placeHierarchy: string[]
	tags: ResolvedTag[]
	// chips after the tags, in the order the config declares the dimensions
	dimensions: ResolvedDimensionValue[]
	dominantColor: string
	primaryModel: PictureModel
	primaryViewer: PhotoViewer
	albumTitle: string
	albumHref: string
	related: PhotoRelatedCard[]
	// the footer promo excludes the whole album context, not just this photo
	albumPhotoIds: readonly string[]
	// no data-more-label, unlike album-grid: "More info" would link to this very page
	copyright: string
	viewerOptions: string
	// the photo or its album context is unlisted (ADR-0010): the page stays but is not indexed
	unlisted: boolean
}

// a photo page inherits `unlisted` from its album context (ADR-0010)
export function isPhotoPageUnlisted(
	album: { unlisted?: boolean },
	photo: { unlisted?: boolean },
): boolean {
	return album.unlisted === true || photo.unlisted === true
}

export async function buildPhotoPageModel(
	albumId: string,
	photoId: string,
	locale: Locale,
	albumHref: string,
	photoHrefFor: (photoId: string) => string,
	config: Pick<SiteConfig, 'viewer' | 'content'>,
): Promise<PhotoPageModel> {
	const { album, photo, related } = await resolvePublishedPhoto(albumId, photoId)
	const catalog = loadImageCatalog(siteRoot)
	const taxonomy = await loadTaxonomyConfig(
		siteRoot,
		config.content.locales,
		config.content.taxonomy,
	)

	const text = projectPhotoText(photo.data, locale)
	const displayName = resolvePhotoDisplayName(photo.data, locale, taxonomy.places)
	const albumText = projectAlbumText(album.data, locale)

	const primaryMedia = resolveSurfaceMedia(catalog.manifest, photo.id, 'photoPrimary')
	const primaryModel = buildPictureModel(primaryMedia, {
		originBase: catalog.originBase,
		alt: text.alt,
		sizes: SURFACE_SIZES.photoPrimary,
	})

	const viewerMedia = resolveSurfaceMedia(catalog.manifest, photo.id, 'photoswipeSlide')
	const viewer = buildViewerData(viewerMedia, catalog.originBase)
	const primaryViewer: PhotoViewer = {
		width: viewer.width,
		height: viewer.height,
		src: viewer.src,
		srcset: viewer.srcsetByFormat.webp ?? viewer.srcsetByFormat.avif,
		caption: displayName,
	}

	const entry = catalog.manifest.photos[photo.id]
	if (!entry) throw new Error(`photo "${photo.id}" is missing from the image manifest`)

	const placeHierarchy = photo.data.placeId
		? resolvePlaceHierarchy(photo.data.placeId, taxonomy.places, locale)
		: []
	const tags = resolveTagLabels(photo.data.tags, taxonomy.tags, locale)
	const dimensions = resolveDimensionValues(
		photo.data.dimensions ?? {},
		config.content.taxonomy.dimensions,
		taxonomy.dimensions,
		locale,
		(name) => lucideIconSvg(lucideIconsDir, name),
	)
	const captured = photo.data.capturedAt
		? formatCapturedAt(photo.data.capturedAt, localeEntry(config.content.catalog, locale).intl)
		: undefined

	const relatedCards: PhotoRelatedCard[] = related.map((item) => {
		const media = resolveSurfaceMedia(catalog.manifest, item.id, 'relatedPhoto')
		return {
			href: photoHrefFor(item.id),
			media: buildPictureModel(media, {
				originBase: catalog.originBase,
				alt: resolvePhotoAlt(item.data, locale),
				sizes: SURFACE_SIZES.relatedPhoto,
			}),
			title: resolvePhotoDisplayName(item.data, locale, taxonomy.places),
		}
	})

	// `clean` drops the manual `|` split marker so it never leaks into <title> and meta
	const titleSplit = splitHeading(displayName)

	return {
		title: titleSplit.clean,
		titleSplit,
		description: text.description,
		caption: text.caption,
		captured,
		placeHierarchy,
		tags,
		dimensions,
		dominantColor: entry.dominantColor,
		primaryModel,
		primaryViewer,
		albumTitle: albumText.title,
		albumHref,
		related: relatedCards,
		albumPhotoIds: album.data.photoIds,
		copyright: catalog.copyright,
		viewerOptions: JSON.stringify(config.viewer),
		unlisted: isPhotoPageUnlisted(album.data, photo.data),
	}
}
