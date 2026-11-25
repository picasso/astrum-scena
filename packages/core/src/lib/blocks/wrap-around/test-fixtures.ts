import type { AlbumData, PhotoData, Place } from '../../content/schemas.ts'
import type { ImageCatalog } from '../../images/catalog.ts'
import { type ManifestV3, parseManifestV3 } from '../../images/manifest.ts'
import { type AlbumEntry, indexById, type PhotoEntry } from '../../portfolio/publication.ts'

// synthetic, independent of real content: only the shape the view-model and photo-route need

const HEX = 'a'.repeat(64)

type Dim = { width: number; height: number }

function imageManifest(id: string, { width, height }: Dim) {
	const derivative = (derivativeWidth: number, format: 'webp' | 'avif') => ({
		width: derivativeWidth,
		height: Math.round((height * derivativeWidth) / width),
		format,
		objectKey: `${id}/${derivativeWidth}w-${HEX}.${format}`,
		sha256: HEX,
		byteSize: 100,
		rightsEmbedded: true,
		privacyChecked: true,
		watermarkProfile: derivativeWidth > 800 ? 'watermark' : 'none',
	})
	return {
		masterSha256: HEX,
		sourceWidth: width,
		sourceHeight: height,
		orientation: 1,
		dominantColor: '#161a20',
		rightsId: 'demo-rights',
		derivatives: [400, 800, width].flatMap((itemWidth) =>
			(['avif', 'webp'] as const).map((format) => derivative(itemWidth, format)),
		),
	}
}

// portrait-a is vertical (R=0.75), portrait-b landscape (R≈1.5), orphan a square outside albums
export const DIMS: Record<string, Dim> = {
	'portrait-a': { width: 900, height: 1200 },
	'portrait-b': { width: 1600, height: 1067 },
	orphan: { width: 1000, height: 1000 },
}

export const manifest: ManifestV3 = parseManifestV3({
	schemaVersion: 3,
	configDigest: HEX,
	photos: {
		'portrait-a': imageManifest('portrait-a', DIMS['portrait-a']!),
		'portrait-b': imageManifest('portrait-b', DIMS['portrait-b']!),
		orphan: imageManifest('orphan', DIMS.orphan!),
	},
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
			capturedAt: '2019-08',
			...data,
		} as PhotoData,
	}
}

export const photos: PhotoEntry[] = [
	photo('portrait-a'),
	photo('portrait-b', { caption: { en: 'Ridge at dawn', ru: 'Хребет на рассвете' } }),
	photo('orphan'),
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
			publishedAt: status === 'published' ? '2020-01-01' : undefined,
		} as unknown as AlbumData,
	}
}

// portrait-b is in one published album, portrait-a in two (ambiguous), orphan only in a draft one
export const albums: AlbumEntry[] = [
	album('northland', ['portrait-b']),
	album('faves', ['portrait-a']),
	album('extra', ['portrait-a']),
	album('hidden', ['orphan'], 'draft'),
]

export const wrapContext = {
	catalog,
	photos,
	albums,
	photosById,
	places,
	locale: 'en' as const,
}
