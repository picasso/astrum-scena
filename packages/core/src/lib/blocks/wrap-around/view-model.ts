import { albumHref } from '../../content/routes.ts'
import type { Locale, Place } from '../../content/schemas.ts'
import type { ImageCatalog } from '../../images/catalog.ts'
import type { PictureModel } from '../../images/media.ts'
import {
	type AlbumEntry,
	findPublishedAlbum,
	type PhotoEntry,
} from '../../portfolio/publication.ts'
import { wrapAroundSizes } from '../../portfolio/sizes.ts'
import { resolveSurfaceMedia } from '../../portfolio/surface.ts'
import { buildViewerData } from '../../portfolio/viewer-data.ts'
import { resolveManagedImage } from '../managed-image.ts'
import { resolveSafeLink } from '../safe-link.ts'
import { resolveWrapPhotoHref } from './photo-route.ts'
import type { ImageAction, WrapAroundProps } from './schema.ts'
import { resolveWrapWidth } from './width.ts'

export type ResolvedAction =
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

export type ResolvedWrapImage = {
	imageId: string
	model: PictureModel
	caption?: string
	showCaption: boolean
	action: ResolvedAction
}

export type WrapAroundViewModel = {
	width: number
	outside: number
	position: WrapAroundProps['position']
	textGap: WrapAroundProps['textGap']
	imageGap: WrapAroundProps['imageGap']
	frame: WrapAroundProps['frame']
	frameColor: WrapAroundProps['frameColor']
	lightboxScope: WrapAroundProps['lightboxScope']
	multiple: boolean
	hasLightbox: boolean
	items: ResolvedWrapImage[]
}

export type WrapAroundContext = {
	catalog: ImageCatalog
	photos: readonly PhotoEntry[]
	albums: readonly AlbumEntry[]
	photosById: ReadonlyMap<string, PhotoEntry>
	places: readonly Place[]
	locale: Locale
}

function pickAction(image: ImageAction | undefined, block: ImageAction): ImageAction {
	return image ?? block ?? 'lightbox'
}

function resolveAction(
	action: ImageAction,
	params: {
		imageId: string
		label: string
		caption: string | undefined
		lightboxCaption: boolean
		ctx: WrapAroundContext
	},
): ResolvedAction {
	const { imageId, label, caption, lightboxCaption, ctx } = params

	if (action === 'none') return { kind: 'none' }

	if (action === 'lightbox') {
		// the anchor targets the viewer image file, not the photo page, so without JS a click still
		// opens the picture
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
		const href = resolveWrapPhotoHref({
			imageId,
			albums: ctx.albums,
			photosById: ctx.photosById,
			locale: ctx.locale,
		})
		return { kind: 'link', href, label }
	}

	if (action.type === 'album') {
		const album = findPublishedAlbum(ctx.albums, action.albumId)
		if (!album) {
			throw new Error(
				`WrapAround: album action target "${action.albumId}" is not a published album`,
			)
		}
		return { kind: 'link', href: albumHref(action.albumId, ctx.locale), label }
	}

	const safe = resolveSafeLink(action.href, { newTab: action.newTab })
	if (!safe) throw new Error(`WrapAround: custom href "${action.href}" is not an allowed link`)
	return {
		kind: 'link',
		href: safe.href,
		external: safe.external,
		target: safe.target,
		rel: safe.rel,
		label,
	}
}

export function resolveWrapAround(
	props: WrapAroundProps,
	ctx: WrapAroundContext,
): WrapAroundViewModel {
	// the width heuristic reads viewer geometry because rounded grid-derivative dimensions can
	// cross an exact ratio boundary (0.75 → 0.7498); the preview itself still uses grid derivatives
	const aspects = props.images.map((image) => {
		const media = resolveSurfaceMedia(ctx.catalog.manifest, image.imageId, 'photoswipeSlide')
		return { width: media.width, height: media.height }
	})
	const width = resolveWrapWidth(aspects, props.width)
	const sizes = wrapAroundSizes(width, props.outside)

	const items: ResolvedWrapImage[] = props.images.map((image) => {
		// catalog alt/caption per ADR-0009; the viewer derivative stays in the lightbox payload and
		// never enters the small float's `<picture>`
		const managed = resolveManagedImage({
			catalog: ctx.catalog,
			photos: ctx.photos,
			places: ctx.places,
			imageId: image.imageId,
			surface: 'wrapAround',
			locale: ctx.locale,
			sizes,
		})

		const catalogAlt = managed.alt
		// `!== undefined` keeps a deliberate decorative `alt=""`
		const displayAlt = image.alt !== undefined ? image.alt : catalogAlt
		// a link around a decorative image still needs an accessible name
		const label = displayAlt || catalogAlt

		const caption =
			image.caption === false
				? undefined
				: typeof image.caption === 'string'
					? image.caption
					: managed.caption

		const model =
			displayAlt === catalogAlt ? managed.model : { ...managed.model, alt: displayAlt }

		const action = resolveAction(pickAction(image.action, props.action), {
			imageId: image.imageId,
			label,
			caption,
			lightboxCaption: props.lightboxCaption,
			ctx,
		})

		return {
			imageId: image.imageId,
			model,
			caption,
			showCaption: props.inlineCaption && caption != null,
			action,
		}
	})

	return {
		width,
		outside: props.outside,
		position: props.position,
		textGap: props.textGap,
		imageGap: props.imageGap,
		frame: props.frame,
		frameColor: props.frameColor,
		lightboxScope: props.lightboxScope,
		multiple: items.length > 1,
		hasLightbox: items.some((item) => item.action.kind === 'lightbox'),
		items,
	}
}
