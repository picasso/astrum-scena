import type { ManifestV3 } from '../images/manifest.ts'
import { type PhotoMedia, resolvePhotoMedia } from '../images/media.ts'

// each surface selects derivatives within its width cap; components own HTML `sizes`.
export type PortfolioSurface =
	| 'portfolioCard'
	| 'documentCard'
	| 'documentListItem'
	| 'bannerHero'
	| 'albumGrid'
	| 'galleryCell'
	| 'wrapAround'
	| 'photoPrimary'
	| 'relatedPhoto'
	| 'contactsAside'
	| 'footerThumb'
	| 'photoswipeSlide'

export const SURFACE_MEDIA: Record<PortfolioSurface, { maxWidth?: number }> = {
	portfolioCard: { maxWidth: 800 },
	documentCard: { maxWidth: 800 },
	documentListItem: { maxWidth: 800 },
	bannerHero: {},
	albumGrid: { maxWidth: 800 },
	galleryCell: { maxWidth: 800 },
	wrapAround: { maxWidth: 800 },
	photoPrimary: {},
	relatedPhoto: { maxWidth: 800 },
	contactsAside: { maxWidth: 800 },
	footerThumb: { maxWidth: 400 },
	photoswipeSlide: {},
}

export type SurfaceMedia = PhotoMedia & { surface: PortfolioSurface }

export function resolveSurfaceMedia(
	manifest: ManifestV3,
	photoId: string,
	surface: PortfolioSurface,
): SurfaceMedia {
	try {
		return { ...resolvePhotoMedia(manifest, photoId, SURFACE_MEDIA[surface]), surface }
	} catch (error) {
		throw new Error(
			`surface "${surface}" has no usable media for photo "${photoId}": ${(error as Error).message}`,
		)
	}
}

export function hasSurfaceMedia(
	manifest: ManifestV3,
	photoId: string,
	surface: PortfolioSurface,
): boolean {
	const entry = manifest.photos[photoId]
	if (!entry) return false
	const maxWidth = SURFACE_MEDIA[surface].maxWidth
	const formats = new Set(
		entry.derivatives
			.filter((item) => maxWidth === undefined || item.width <= maxWidth)
			.map((item) => item.format),
	)
	return formats.has('avif') && formats.has('webp')
}
