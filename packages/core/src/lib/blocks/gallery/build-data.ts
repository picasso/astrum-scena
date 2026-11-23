import { albumHref } from '../../content/routes.ts'
import type { FocalPoint, Locale, Place } from '../../content/schemas.ts'
import type { ImageCatalog } from '../../images/catalog.ts'
import type { PictureModel } from '../../images/media.ts'
import {
	type AlbumEntry,
	findPublishedAlbum,
	getPublishedAlbums,
	getPublishedPhotos,
	type PhotoEntry,
	resolveAlbumPhotos,
} from '../../portfolio/publication.ts'
import { gallerySizes } from '../../portfolio/sizes.ts'
import { resolveSurfaceMedia } from '../../portfolio/surface.ts'
import { buildViewerData } from '../../portfolio/viewer-data.ts'
import type { ImageAction } from '../image-action.ts'
import { resolveManagedImage } from '../managed-image.ts'
import { resolvePhotoActionHref } from '../photo-route.ts'
import { resolveSafeLink } from '../safe-link.ts'
import { isRectCandidate } from './geometry.ts'
import type { ImageSetOrder, ImageSetsConfig } from './image-sets.ts'
import { type GalleryOrderItem, orderGalleryItems } from './order.ts'
import type { GalleryImageOverrides, GalleryProps } from './schema.ts'
import {
	type GallerySourceContext,
	type GallerySourceKind,
	resolveGallerySource,
} from './source.ts'

// build-time gallery resolver (docs/blocks/gallery.md): every pool candidate is resolved, not only
// the shown ones, because random sampling happens in the browser; URL building and link policy come
// from managed-image, safe-link and the portfolio helpers instead of being duplicated

const DEFAULT_FOCAL_POINT: FocalPoint = { x: 50, y: 50 }

export const GALLERY_FRAME_PX: Record<GalleryProps['frame'], number> = {
	none: 0,
	thin: 1,
	medium: 3,
	thick: 5,
}

// cropped layouts open the lightbox with `fade`, natural `justified` with the site-default `zoom`;
// one value per block because a gallery has a single layout
export type GalleryLightboxAnimation = 'fade' | 'zoom'

export type GalleryActionData =
	| { kind: 'none' }
	| {
			kind: 'lightbox'
			href: string
			pswp: { width: number; height: number; src: string; srcset: string; caption?: string }
			label: string
	  }
	| {
			kind: 'link'
			href: string
			external?: boolean
			target?: '_blank'
			rel?: string
			label: string
	  }

// carries sort keys and geometry so the browser coordinator can order the random sample and lay out
// justified rows
export type GalleryCandidate = GalleryOrderItem & {
	model: PictureModel
	caption?: string
	showInlineCaption: boolean
	action: GalleryActionData
	focalPoint: FocalPoint
	width: number
	height: number
}

export type GalleryViewModel = {
	layout: GalleryProps['layout']
	columns: number
	outside: number
	mobileFirstOnly: boolean
	gap: GalleryProps['gap']
	frame: GalleryProps['frame']
	framePx: number
	frameColor: GalleryProps['frameColor']
	lightboxScope: GalleryProps['lightboxScope']
	inlineCaption: boolean
	lightboxCaption: boolean
	// true when `randomCount` is set and sampling runs in the browser
	dynamic: boolean
	randomCount?: number
	order: ImageSetOrder
	priorityPhotoIds: string[]
	animation: GalleryLightboxAnimation
	hasLightbox: boolean
	// static: the full ordered set; dynamic: the first `randomCount` items for `<noscript>`
	active: GalleryCandidate[]
	// dynamic: the whole pool in source order for the inert `<template>`; static: empty
	candidates: GalleryCandidate[]
	// lower-priority sources ignored when several valid ones are given (diagnostics, not an error)
	ignoredSources: GallerySourceKind[]
}

export type GalleryBuildContext = {
	catalog: ImageCatalog
	photos: readonly PhotoEntry[]
	photosById: ReadonlyMap<string, PhotoEntry>
	albums: readonly AlbumEntry[]
	places: readonly Place[]
	locale: Locale
	imageSets: ImageSetsConfig
}

// also used by the footer promo, so a gallery pool in the document body counts as already shown
// through the same source context the block renders with
export function buildSourceContext(
	ctx: Pick<GalleryBuildContext, 'albums' | 'photos' | 'photosById' | 'imageSets'>,
): GallerySourceContext {
	const albumPhotoIds = new Map<string, readonly string[]>()
	for (const album of getPublishedAlbums(ctx.albums)) {
		albumPhotoIds.set(
			album.id,
			resolveAlbumPhotos(album, ctx.photosById).map((photo) => photo.id),
		)
	}
	const knownPhotoIds = new Set(getPublishedPhotos(ctx.photos).map((photo) => photo.id))
	return { imageSets: ctx.imageSets, albumPhotoIds, knownPhotoIds }
}

function pickAction(override: ImageAction | undefined, block: ImageAction): ImageAction {
	return override ?? block
}

function resolveAction(
	action: ImageAction,
	params: {
		imageId: string
		label: string
		caption: string | undefined
		lightboxCaption: boolean
		ctx: GalleryBuildContext
	},
): GalleryActionData {
	const { imageId, label, caption, lightboxCaption, ctx } = params

	if (action === 'none') return { kind: 'none' }

	if (action === 'lightbox') {
		// without JS the anchor opens the viewer derivative itself, not the photo page; PhotoSwipe
		// reads `data-pswp-*` after init. A missing viewer role fails the build
		const media = resolveSurfaceMedia(ctx.catalog.manifest, imageId, 'photoswipeSlide')
		const viewer = buildViewerData(media, ctx.catalog.originBase)
		const srcset = viewer.srcsetByFormat.webp ?? viewer.srcsetByFormat.avif ?? ''
		return {
			kind: 'lightbox',
			href: viewer.src,
			pswp: {
				width: viewer.width,
				height: viewer.height,
				src: viewer.src,
				srcset,
				caption: lightboxCaption ? caption : undefined,
			},
			label,
		}
	}

	if (action === 'photo') {
		const href = resolvePhotoActionHref({
			imageId,
			albums: ctx.albums,
			photosById: ctx.photosById,
			locale: ctx.locale,
			block: 'Gallery',
		})
		return { kind: 'link', href, label }
	}

	if (action.type === 'album') {
		const album = findPublishedAlbum(ctx.albums, action.albumId)
		if (!album) {
			throw new Error(
				`Gallery: album action target "${action.albumId}" is not a published album`,
			)
		}
		return { kind: 'link', href: albumHref(action.albumId, ctx.locale), label }
	}

	const safe = resolveSafeLink(action.href, { newTab: action.newTab })
	if (!safe) throw new Error(`Gallery: custom href "${action.href}" is not an allowed link`)
	return {
		kind: 'link',
		href: safe.href,
		external: safe.external,
		target: safe.target,
		rel: safe.rel,
		label,
	}
}

function resolveCandidate(
	imageId: string,
	props: GalleryProps,
	ctx: GalleryBuildContext,
	publishedPhotos: readonly PhotoEntry[],
	override: GalleryImageOverrides | undefined,
): GalleryCandidate {
	// catalog alt/caption come from the managed-image resolver (ADR-0009); overrides layer on top
	const managed = resolveManagedImage({
		catalog: ctx.catalog,
		photos: publishedPhotos,
		places: ctx.places,
		imageId,
		surface: 'galleryCell',
		locale: ctx.locale,
		sizes: gallerySizes(props.columns, props.layout),
	})

	const catalogAlt = managed.alt
	// `!== undefined` keeps a deliberately decorative `alt=""`
	const displayAlt = override?.alt !== undefined ? override.alt : catalogAlt
	// a link around a decorative image still needs an accessible name
	const label = displayAlt || catalogAlt

	const caption =
		override?.caption === false
			? undefined
			: typeof override?.caption === 'string'
				? override.caption
				: managed.caption

	// an alt override changes only the attribute; the derivatives stay shared
	const model = displayAlt === catalogAlt ? managed.model : { ...managed.model, alt: displayAlt }

	const action = resolveAction(pickAction(override?.action, props.action), {
		imageId,
		label,
		caption,
		lightboxCaption: props.lightboxCaption,
		ctx,
	})

	const photo = ctx.photosById.get(imageId)
	// only explicit `images` carry overrides; `justified` ignores the focal point
	const focalPoint = override?.focalPoint ?? photo?.data.focalPoint ?? DEFAULT_FOCAL_POINT

	return {
		imageId,
		model,
		caption,
		showInlineCaption: props.inlineCaption && caption != null,
		action,
		focalPoint,
		// grid derivatives keep the master's proportions, so these give the aspect for justified
		// rows and client-side geometry
		width: model.width,
		height: model.height,
		favorite: photo?.data.favorite ?? false,
		publishedAt: photo?.data.publishedAt,
		capturedAt: photo?.data.capturedAt,
	}
}

export function resolveGallery(props: GalleryProps, ctx: GalleryBuildContext): GalleryViewModel {
	const sourceCtx = buildSourceContext(ctx)
	const source = resolveGallerySource(props, sourceCtx)
	const dynamic = props.randomCount !== undefined

	// checked before any manifest lookup: explicit `images` may name an unpublished photo (image
	// sets and albums are vetted by the source resolver), which would otherwise fail below as a
	// missing manifest entry instead of this clear error
	for (const id of source.poolIds) {
		if (!sourceCtx.knownPhotoIds.has(id)) {
			throw new Error(`Gallery: image "${id}" is not a published, embeddable managed photo`)
		}
	}

	// a dynamic rect gallery (`randomCount` set) keeps only images at least 4:3 wide, a static
	// list is not filtered; orientation comes from the post-rotation `grid` role, whose absence
	// fails the build because the cell could not render anyway
	let poolIds = source.poolIds
	if (dynamic && props.layout === 'rect') {
		poolIds = poolIds.filter((id) => {
			const media = resolveSurfaceMedia(ctx.catalog.manifest, id, 'galleryCell')
			return isRectCandidate({ width: media.width, height: media.height })
		})
	}

	if (dynamic && poolIds.length < props.randomCount!) {
		throw new Error(
			`Gallery: pool has ${poolIds.length} images after permanent filters but randomCount=${props.randomCount}`,
		)
	}

	const overridesById =
		source.kind === 'images'
			? new Map(props.images!.map((image) => [image.imageId, image]))
			: new Map<string, GalleryImageOverrides>()

	const publishedPhotos = getPublishedPhotos(ctx.photos)
	const candidates = poolIds.map((id) =>
		resolveCandidate(id, props, ctx, publishedPhotos, overridesById.get(id)),
	)

	// the dynamic pool stays unordered in `<template>` because the browser coordinator samples and
	// orders it; only the canonical `<noscript>` items are ordered at build
	const ordered = orderGalleryItems(candidates, source.order, source.priorityPhotoIds)
	const active = dynamic ? ordered.slice(0, props.randomCount!) : ordered

	// the dynamic sample is unknown at build, so any lightbox item in the pool counts
	const lightboxPool = dynamic ? candidates : active
	const hasLightbox = lightboxPool.some((candidate) => candidate.action.kind === 'lightbox')

	return {
		layout: props.layout,
		columns: props.columns,
		outside: props.outside,
		mobileFirstOnly: props.mobileFirstOnly,
		gap: props.gap,
		frame: props.frame,
		framePx: GALLERY_FRAME_PX[props.frame],
		frameColor: props.frameColor,
		lightboxScope: props.lightboxScope,
		inlineCaption: props.inlineCaption,
		lightboxCaption: props.lightboxCaption,
		dynamic,
		randomCount: props.randomCount,
		order: source.order,
		priorityPhotoIds: source.priorityPhotoIds,
		animation: props.layout === 'justified' ? 'zoom' : 'fade',
		hasLightbox,
		active,
		candidates: dynamic ? candidates : [],
		ignoredSources: source.ignoredSources,
	}
}
