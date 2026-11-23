import { getCollection } from 'astro:content'

import {
	type AlbumEntry,
	findPublishedAlbum,
	getListableAlbums,
	getPublishedAlbums,
	indexById,
	type PhotoEntry,
	resolveAlbumPhotos,
} from './publication.ts'

// shared static-page logic for the portfolio tree, so en/ru pages stay thin. Only published
// album/photo paths get static paths, so a forged, draft or mismatched nested URL is a 404

async function loadCollections(): Promise<{
	albums: AlbumEntry[]
	photosById: ReadonlyMap<string, PhotoEntry>
}> {
	const [albums, photos] = await Promise.all([getCollection('albums'), getCollection('photos')])
	return { albums, photosById: indexById(photos) }
}

// the portfolio grid is a discovery surface, so unlisted albums are left out
export async function loadPublishedPortfolio(): Promise<{
	albums: AlbumEntry[]
	photosById: ReadonlyMap<string, PhotoEntry>
}> {
	const { albums, photosById } = await loadCollections()
	return { albums: getListableAlbums(albums), photosById }
}

export async function albumStaticPaths(): Promise<{ params: { album: string } }[]> {
	const { albums } = await loadCollections()
	return getPublishedAlbums(albums).map((album) => ({ params: { album: album.id } }))
}

// a photo gets a separate path in every published album it belongs to
export async function photoStaticPaths(): Promise<{ params: { album: string; photo: string } }[]> {
	const { albums, photosById } = await loadCollections()
	return getPublishedAlbums(albums).flatMap((album) =>
		resolveAlbumPhotos(album, photosById).map((photo) => ({
			params: { album: album.id, photo: photo.id },
		})),
	)
}

// the album list in the side column is a discovery list and excludes unlisted albums, while the
// current album is resolved among all published ones so an unlisted album's own page still works
export async function resolvePublishedAlbum(albumId: string): Promise<{
	album: AlbumEntry
	albums: AlbumEntry[]
	photosById: ReadonlyMap<string, PhotoEntry>
}> {
	const { albums, photosById } = await loadCollections()
	const listable = getListableAlbums(albums)
	const album = findPublishedAlbum(albums, albumId)
	if (!album) throw new Error(`no published album "${albumId}"`)
	return { album, albums: listable, photosById }
}

// related photos come from the album in the URL, not from global membership
export async function resolvePublishedPhoto(
	albumId: string,
	photoId: string,
): Promise<{
	album: AlbumEntry
	photo: PhotoEntry
	related: PhotoEntry[]
	photosById: ReadonlyMap<string, PhotoEntry>
}> {
	const { album, photosById } = await resolvePublishedAlbum(albumId)
	// the photo page shows no album list
	const photos = resolveAlbumPhotos(album, photosById)
	const photo = photos.find((entry) => entry.id === photoId)
	if (!photo)
		throw new Error(`photo "${photoId}" is not a member of published album "${albumId}"`)
	return { album, photo, related: photos.filter((entry) => entry.id !== photoId), photosById }
}
