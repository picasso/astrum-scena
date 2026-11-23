import { photoHref } from '../content/routes.ts'
import type { Locale } from '../content/schemas.ts'
import {
	type AlbumEntry,
	buildPublishedMembershipIndex,
	type PhotoEntry,
} from '../portfolio/publication.ts'

// photo pages exist only nested in an album and a block image has no album context, so the album is
// recovered from published album membership; zero or several matches fail the build instead of
// silently picking one

export type PhotoActionRouteInput = {
	imageId: string
	albums: readonly AlbumEntry[]
	photosById: ReadonlyMap<string, PhotoEntry>
	locale: Locale
	// names the block in build errors
	block: string
}

export function resolvePhotoActionHref(input: PhotoActionRouteInput): string {
	const { imageId, albums, photosById, locale, block } = input
	const membership = buildPublishedMembershipIndex(albums, photosById)
	const albumIds = membership.get(imageId) ?? []

	if (albumIds.length === 1) return photoHref(albumIds[0]!, imageId, locale)

	if (albumIds.length === 0) {
		throw new Error(
			`${block}: photo action for "${imageId}" has no routable public photo page ` +
				'(image is not a published-album member)',
		)
	}
	throw new Error(
		`${block}: photo action for "${imageId}" is ambiguous — it belongs to ${albumIds.length} ` +
			`published albums (${albumIds.join(', ')}); use an explicit album action instead`,
	)
}
