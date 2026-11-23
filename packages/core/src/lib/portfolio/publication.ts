import type { ContentEntry } from '../content/model.ts'
import type { AlbumData, PhotoData } from '../content/schemas.ts'

// album.photoIds is the only stored membership; the reverse index is computed here rather than kept
// as `albumIds` in photo YAML. Missing or draft references throw instead of being dropped silently:
// integrity checks catch them at build time, this guards static paths at runtime

export type PhotoEntry = ContentEntry<PhotoData>
export type AlbumEntry = ContentEntry<AlbumData>

export function indexById<T>(entries: readonly ContentEntry<T>[]): Map<string, ContentEntry<T>> {
	return new Map(entries.map((entry) => [entry.id, entry]))
}

export function getPublishedAlbums(albums: readonly AlbumEntry[]): AlbumEntry[] {
	return albums.filter((album) => album.data.status === 'published')
}

export function getPublishedPhotos(photos: readonly PhotoEntry[]): PhotoEntry[] {
	return photos.filter((photo) => photo.data.status === 'published')
}

// discovery lists (portfolio grid, album list, Recent/Favorites) also hide `unlisted` entries
// (ADR-0010), which stay published and reachable by direct link; detail pages, static paths and
// album member grids deliberately keep using the published-only variants
export function getListableAlbums(albums: readonly AlbumEntry[]): AlbumEntry[] {
	return getPublishedAlbums(albums).filter((album) => !album.data.unlisted)
}

export function getListablePhotos(photos: readonly PhotoEntry[]): PhotoEntry[] {
	return getPublishedPhotos(photos).filter((photo) => !photo.data.unlisted)
}

export function findPublishedAlbum(
	albums: readonly AlbumEntry[],
	albumId: string,
): AlbumEntry | undefined {
	return albums.find((album) => album.id === albumId && album.data.status === 'published')
}

// reverse membership: photoId → ids of the published albums that contain it. Only published albums,
// fail-closed through resolveAlbumPhotos (a missing/draft reference throws instead of being silently
// indexed). Computed at build time, not stored.
export function buildPublishedMembershipIndex(
	albums: readonly AlbumEntry[],
	photosById: ReadonlyMap<string, PhotoEntry>,
): ReadonlyMap<string, readonly string[]> {
	const index = new Map<string, string[]>()
	for (const album of getPublishedAlbums(albums)) {
		for (const photo of resolveAlbumPhotos(album, photosById)) {
			const list = index.get(photo.id) ?? []
			list.push(album.id)
			index.set(photo.id, list)
		}
	}
	return index
}

// a published album must never reference a draft photo
export function resolveAlbumPhotos(
	album: AlbumEntry,
	photosById: ReadonlyMap<string, PhotoEntry>,
): PhotoEntry[] {
	const requirePublished = album.data.status === 'published'
	return album.data.photoIds.map((photoId) => {
		const photo = photosById.get(photoId)
		if (!photo) {
			throw new Error(`album "${album.id}" references unknown photo "${photoId}"`)
		}
		if (requirePublished && photo.data.status !== 'published') {
			throw new Error(`published album "${album.id}" references draft photo "${photoId}"`)
		}
		return photo
	})
}

export function resolveAlbumCover(
	album: AlbumEntry,
	photosById: ReadonlyMap<string, PhotoEntry>,
): PhotoEntry {
	const cover = photosById.get(album.data.coverId)
	if (!cover) {
		throw new Error(`album "${album.id}" cover photo "${album.data.coverId}" is missing`)
	}
	if (album.data.status === 'published' && cover.data.status !== 'published') {
		throw new Error(`published album "${album.id}" has a draft cover "${album.data.coverId}"`)
	}
	return cover
}

// related photos depend on the album in the URL, not on global membership; a non-member current
// photo means the /album/photo route itself is invalid
export function resolveRelatedPhotos(
	album: AlbumEntry,
	currentPhotoId: string,
	photosById: ReadonlyMap<string, PhotoEntry>,
): PhotoEntry[] {
	if (!album.data.photoIds.includes(currentPhotoId)) {
		throw new Error(`photo "${currentPhotoId}" is not a member of album "${album.id}"`)
	}
	return resolveAlbumPhotos(album, photosById).filter((photo) => photo.id !== currentPhotoId)
}
