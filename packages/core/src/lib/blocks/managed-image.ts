import type { Locale, Place } from '../content/schemas.ts'
import type { ImageCatalog } from '../images/catalog.ts'
import { buildPictureModel, type PictureModel } from '../images/media.ts'
import { resolvePhotoAlt, resolvePhotoCaption } from '../portfolio/locale.ts'
import type { PhotoEntry } from '../portfolio/publication.ts'
import { type PortfolioSurface, resolveSurfaceMedia } from '../portfolio/surface.ts'

// managed blocks resolve imageId through the catalog and a width-capped surface.
// Alt/caption come from ADR-0009 resolvers; the caller owns HTML `sizes`.

export type ManagedImageInput = {
	catalog: ImageCatalog
	photos: readonly PhotoEntry[]
	places: readonly Place[]
	imageId: string
	surface: PortfolioSurface
	locale: Locale
	sizes: string
}

export type ManagedImage = {
	imageId: string
	model: PictureModel
	alt: string
	caption?: string
}

export function resolveManagedImage(input: ManagedImageInput): ManagedImage {
	const { catalog, photos, places, imageId, surface, locale, sizes } = input

	const photo = photos.find((entry) => entry.id === imageId)
	if (!photo) throw new Error(`managed image "${imageId}" is not in the photo catalog`)

	const media = resolveSurfaceMedia(catalog.manifest, imageId, surface)
	const alt = resolvePhotoAlt(photo.data, locale)

	return {
		imageId,
		model: buildPictureModel(media, { originBase: catalog.originBase, alt, sizes }),
		alt,
		caption: resolvePhotoCaption(photo.data, locale, places),
	}
}
