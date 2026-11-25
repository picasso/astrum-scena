import type { AlbumData, PhotoData, Place } from '../../content/schemas.ts'
import type { ImageCatalog } from '../../images/catalog.ts'
import { type ManifestV3, parseManifestV3 } from '../../images/manifest.ts'
import { type AlbumEntry, indexById, type PhotoEntry } from '../../portfolio/publication.ts'
import type { GalleryBuildContext } from './build-data.ts'
import type { ImageSetsConfig } from './image-sets.ts'

// every embeddable photo gets both the `grid` (cell) and `viewer` (lightbox) roles; the data
// mirrors the content shape, not real content

const HEX = 'a'.repeat(64)

type Dim = { width: number; height: number }

function photoManifest(id: string, dim: Dim) {
	return {
		masterSha256: HEX,
		sourceWidth: dim.width,
		sourceHeight: dim.height,
		orientation: 1,
		dominantColor: '#161a20',
		rightsId: 'demo-rights',
		derivatives: [800, dim.width].flatMap((width) =>
			(['avif', 'webp'] as const).map((format) => ({
				width,
				height: Math.round((dim.height * width) / dim.width),
				format,
				objectKey: `${id}/${width}w-${HEX}.${format}`,
				sha256: HEX,
				byteSize: 100,
				rightsEmbedded: true,
				privacyChecked: true,
				watermarkProfile: width > 800 ? 'watermark' : 'none',
			})),
		),
	}
}

// p-land/p-land2 are landscape (1.5), p-square is below 4:3 (1), p-tall is portrait (≈0.667) and
// p-orphan is a square outside every published album
export const DIMS: Record<string, Dim> = {
	'p-land': { width: 1500, height: 1000 },
	'p-land2': { width: 1600, height: 1067 },
	'p-square': { width: 1000, height: 1000 },
	'p-tall': { width: 900, height: 1350 },
	'p-orphan': { width: 1200, height: 1200 },
}

export const manifest: ManifestV3 = parseManifestV3({
	schemaVersion: 3,
	configDigest: HEX,
	photos: Object.fromEntries(
		Object.entries(DIMS).map(([id, dim]) => [id, photoManifest(id, dim)]),
	),
})

export const catalog: ImageCatalog = {
	manifest,
	originBase: 'https://img.example.com',
	copyright: '© Test',
	credit: 'Test',
}

export const places: Place[] = [
	{ id: 'northland', kind: 'country', name: { en: 'Northland', ru: 'Северный край' } },
]

function photo(id: string, data: Partial<PhotoData> = {}): PhotoEntry {
	return {
		id,
		data: {
			title: { en: `Title ${id}`, ru: `Заголовок ${id}` },
			status: 'published',
			placeId: 'northland',
			favorite: false,
			tags: [],
			...data,
		} as PhotoData,
	}
}

export const photos: PhotoEntry[] = [
	photo('p-land', { publishedAt: '2020-01-01', capturedAt: '2019-08' }),
	photo('p-land2', { favorite: true, publishedAt: '2022-05-05', capturedAt: '2011' }),
	photo('p-square', {
		publishedAt: '2019-03-03',
		caption: { en: 'Square caption', ru: 'Квадратная подпись' },
	}),
	photo('p-tall', {
		favorite: true,
		publishedAt: '2021-07-07',
		capturedAt: '2015-02',
		focalPoint: { x: 42.5, y: 30 },
	}),
	photo('p-orphan', { publishedAt: '2018-06-06' }),
	// a draft is not embeddable, so the manifest has no entry for it
	photo('p-draft', { status: 'draft' }),
]

export const photosById = indexById(photos)

function album(
	id: string,
	photoIds: string[],
	status: 'published' | 'draft' = 'published',
): AlbumEntry {
	return {
		id,
		data: {
			title: { en: id, ru: id },
			description: { en: id, ru: id },
			slug: id,
			category: 'places',
			coverId: photoIds[0]!,
			photoIds,
			status,
		} as unknown as AlbumData,
	}
}

// p-square is shared by al-a and al-b to exercise deduplication
export const albums: AlbumEntry[] = [
	album('al-a', ['p-land', 'p-square']),
	album('al-b', ['p-square', 'p-tall']),
	album('al-orphan', ['p-orphan'], 'draft'),
]

export const imageSets: ImageSetsConfig = {
	'set-main': {
		albumIds: ['al-a'],
		photoIds: ['p-tall', 'p-land2'],
		priorityPhotoIds: ['p-tall'],
		order: 'favorites-first',
	},
}

export function galleryContext(overrides: Partial<GalleryBuildContext> = {}): GalleryBuildContext {
	return { catalog, photos, photosById, albums, places, locale: 'en', imageSets, ...overrides }
}
