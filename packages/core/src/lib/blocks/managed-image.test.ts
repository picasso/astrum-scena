import { describe, expect, it } from 'vitest'

import type { PhotoData, Place } from '../content/schemas.ts'
import type { ImageCatalog } from '../images/catalog.ts'
import { type ManifestV3, parseManifestV3 } from '../images/manifest.ts'
import type { PhotoEntry } from '../portfolio/publication.ts'
import { resolveManagedImage } from './managed-image.ts'

const HEX = 'a'.repeat(64)
const PHOTO_ID = 'morning-ridge'

const manifest: ManifestV3 = parseManifestV3({
	schemaVersion: 3,
	configDigest: HEX,
	photos: {
		[PHOTO_ID]: {
			masterSha256: HEX,
			sourceWidth: 1600,
			sourceHeight: 1067,
			orientation: 1,
			dominantColor: '#161a20',
			rightsId: 'demo-rights',
			derivatives: [
				{
					width: 800,
					height: 534,
					format: 'avif',
					objectKey: `${PHOTO_ID}/800w-${HEX}.avif`,
					sha256: HEX,
					byteSize: 100,
					rightsEmbedded: true,
					privacyChecked: true,
					watermarkProfile: 'none',
				},
				{
					width: 800,
					height: 534,
					format: 'webp',
					objectKey: `${PHOTO_ID}/800w-${HEX}.webp`,
					sha256: HEX,
					byteSize: 90,
					rightsEmbedded: true,
					privacyChecked: true,
					watermarkProfile: 'none',
				},
			],
		},
	},
})

const catalog: ImageCatalog = {
	manifest,
	originBase: 'https://img.example.com',
	copyright: '© Test',
	credit: 'Test',
}

const places: Place[] = [
	{ id: 'northland', name: { en: 'Northland', ru: 'Северный край' } } as Place,
]

function photoEntry(data: Partial<PhotoData> = {}): PhotoEntry {
	return {
		id: PHOTO_ID,
		data: {
			title: { en: 'Good morning, ridge', ru: 'Доброе утро, хребет' },
			status: 'published',
			placeId: 'northland',
			capturedAt: '2019-08',
			...data,
		} as PhotoData,
	}
}

const input = {
	catalog,
	photos: [photoEntry()],
	places,
	imageId: PHOTO_ID,
	surface: 'galleryCell' as const,
	locale: 'en' as const,
	sizes: '(max-width: 640px) 100vw, 400px',
}

describe('resolveManagedImage', () => {
	it('builds the picture model from the managed catalog only', () => {
		const image = resolveManagedImage(input)
		expect(image.model.sources.map((source) => source.type)).toEqual([
			'image/avif',
			'image/webp',
		])
		expect(image.model.sources[0]!.srcset).toBe(
			`https://img.example.com/${PHOTO_ID}/800w-${HEX}.avif 800w`,
		)
		expect(image.model.fallback.src).toBe(
			`https://img.example.com/${PHOTO_ID}/800w-${HEX}.webp`,
		)
		expect(image.model.style).toContain('aspect-ratio: 800 / 534')
		expect(image.model.sizes).toBe(input.sizes)
	})

	// texts must match the portfolio: alt per ADR-0009 and the authored or computed "Place, YYYY"
	// caption in the same locale
	it('resolves alt and caption through the shared photo-text rules', () => {
		const image = resolveManagedImage(input)
		expect(image.alt).toBe('Good morning, ridge')
		expect(image.model.alt).toBe(image.alt)
		expect(image.caption).toBe('Northland, 2019')

		const russian = resolveManagedImage({ ...input, locale: 'ru' })
		expect(russian.alt).toBe('Доброе утро, хребет')
		expect(russian.caption).toBe('Северный край, 2019')
	})

	it('prefers an authored caption over the computed place and year', () => {
		const image = resolveManagedImage({
			...input,
			photos: [photoEntry({ caption: { en: 'Sunrise over the ridge', ru: 'Рассвет' } })],
		})
		expect(image.caption).toBe('Sunrise over the ridge')
	})

	it('leaves the caption undefined when there is nothing to show', () => {
		const image = resolveManagedImage({
			...input,
			photos: [photoEntry({ placeId: undefined, capturedAt: undefined })],
		})
		expect(image.caption).toBeUndefined()
	})

	// a block cannot point at an arbitrary file: an unknown id or a role without
	// derivatives fails the build
	it('fails on an image outside the photo catalog', () => {
		expect(() => resolveManagedImage({ ...input, imageId: 'nope' })).toThrow(
			/managed image "nope" is not in the photo catalog/,
		)
	})

	it('rejects a surface when its width cap has no derivative', () => {
		expect(() => resolveManagedImage({ ...input, surface: 'footerThumb' })).toThrow(
			/no derivative within maxWidth 400/,
		)
	})
})
