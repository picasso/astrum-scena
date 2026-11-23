import { describe, expect, it } from 'vitest'

import { parseManifest } from './manifest.ts'
import { buildPictureModel, resolvePhotoMedia } from './media.ts'

const SHA = 'a'.repeat(64)
const PHOTO_ID = 'morning-ridge'
const ORIGIN = 'https://img.example.com'

function manifestWithRights(rightsEmbeddedAt1600 = true) {
	return parseManifest({
		schemaVersion: 3,
		configDigest: SHA,
		photos: {
			[PHOTO_ID]: {
				masterSha256: SHA,
				sourceWidth: 1600,
				sourceHeight: 1067,
				orientation: 1,
				dominantColor: '#161a20',
				rightsId: 'demo-rights',
				derivatives: [400, 800, 1600].flatMap((width) =>
					(['avif', 'webp'] as const).map((format) => ({
						width,
						height: Math.round((1067 * width) / 1600),
						format,
						objectKey: `${PHOTO_ID}/${width}w-${SHA}.${format}`,
						sha256: SHA,
						byteSize: 100,
						rightsEmbedded: width <= 800 || rightsEmbeddedAt1600,
						privacyChecked: true,
						watermarkProfile: width > 800 ? 'watermark' : 'none',
					})),
				),
			},
		},
	})
}

describe('resolvePhotoMedia', () => {
	it('returns the complete sorted ladder and intrinsic size', () => {
		const media = resolvePhotoMedia(manifestWithRights(), PHOTO_ID)
		expect(media.width).toBe(1600)
		expect(media.height).toBe(1067)
		expect(media.dominantColor).toBe('#161a20')
		expect(media.formats).toEqual(['avif', 'webp'])
		expect(media.derivatives.map((item) => item.width)).toEqual([
			400, 400, 800, 800, 1600, 1600,
		])
		expect(media.rightsEmbeddedByFormat).toEqual({ avif: true, webp: true })
	})

	it('caps both formats and excludes rights flags from omitted widths', () => {
		const manifest = manifestWithRights(false)
		const capped = resolvePhotoMedia(manifest, PHOTO_ID, { maxWidth: 800 })
		expect(capped.width).toBe(800)
		expect(capped.derivatives.every((item) => item.width <= 800)).toBe(true)
		expect(capped.rightsEmbeddedByFormat).toEqual({ avif: true, webp: true })
		const full = resolvePhotoMedia(manifest, PHOTO_ID)
		expect(full.rightsEmbeddedByFormat).toEqual({ avif: false, webp: false })
	})

	it('fails closed for absent photos or an empty capped selection', () => {
		expect(() => resolvePhotoMedia(manifestWithRights(), 'missing')).toThrow(/no photo/)
		expect(() => resolvePhotoMedia(manifestWithRights(), PHOTO_ID, { maxWidth: 200 })).toThrow(
			/no derivative within maxWidth 200/,
		)
	})
})

describe('buildPictureModel', () => {
	it('renders avif then webp with explicit sizes, fallback and aspect ratio', () => {
		const media = resolvePhotoMedia(manifestWithRights(), PHOTO_ID, { maxWidth: 800 })
		const model = buildPictureModel(media, {
			originBase: `${ORIGIN}/`,
			alt: 'Photo',
			sizes: '(min-width: 768px) 50vw, 100vw',
		})
		expect(model.sources.map((source) => source.type)).toEqual(['image/avif', 'image/webp'])
		expect(model.sources[0]!.srcset).toContain(`${ORIGIN}/${PHOTO_ID}/800w-${SHA}.avif 800w`)
		expect(model.fallback.src).toBe(`${ORIGIN}/${PHOTO_ID}/800w-${SHA}.webp`)
		expect(model.style).toContain('aspect-ratio: 800 / 534')
		expect(model.sizes).toBe('(min-width: 768px) 50vw, 100vw')
		expect(model.rightsFallbackNeeded).toBe(false)
	})

	it('builds root-relative URLs from a site path', () => {
		const media = resolvePhotoMedia(manifestWithRights(), PHOTO_ID, { maxWidth: 800 })
		const model = buildPictureModel(media, {
			originBase: '/media',
			alt: 'Photo',
			sizes: '100vw',
		})
		expect(model.fallback.src).toBe(`/media/${PHOTO_ID}/800w-${SHA}.webp`)
		expect(model.sources[0]!.srcset).toContain(`/media/${PHOTO_ID}/800w-${SHA}.avif 800w`)
	})

	it('flags the fallback only when selected derivatives lack embedded rights', () => {
		const manifest = manifestWithRights(false)
		const full = buildPictureModel(resolvePhotoMedia(manifest, PHOTO_ID), {
			originBase: ORIGIN,
			alt: 'Photo',
			sizes: '100vw',
		})
		expect(full.rightsFallbackNeeded).toBe(true)
	})
})
