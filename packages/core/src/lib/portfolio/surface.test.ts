import { describe, expect, it } from 'vitest'

import type { ManifestV3 } from '../images/manifest.ts'
import { buildPictureModel } from '../images/media.ts'
import { hasSurfaceMedia, resolveSurfaceMedia, SURFACE_MEDIA } from './surface.ts'

const HEX = 'a'.repeat(64)

describe('SURFACE_MEDIA ladder caps', () => {
	const manifest: ManifestV3 = {
		schemaVersion: 3,
		configDigest: HEX,
		photos: {
			x: {
				masterSha256: HEX,
				sourceWidth: 1200,
				sourceHeight: 900,
				orientation: 1,
				dominantColor: '#123456',
				rightsId: 'r',
				derivatives: [200, 400, 800, 1200].flatMap((width) =>
					(['avif', 'webp'] as const).map((format) => ({
						width,
						height: (width * 3) / 4,
						format,
						objectKey: `x/${width}w-${HEX}.${format}`,
						sha256: HEX,
						byteSize: 100,
						rightsEmbedded: true,
						privacyChecked: true,
						watermarkProfile: width > 800 ? 'watermark' : 'none',
					})),
				),
			},
		},
	}

	it('caps footer at 400, previews at 800 and full surfaces at native width', () => {
		expect(SURFACE_MEDIA.footerThumb.maxWidth).toBe(400)
		expect(resolveSurfaceMedia(manifest, 'x', 'footerThumb').width).toBe(400)
		expect(resolveSurfaceMedia(manifest, 'x', 'footerThumb').surface).toBe('footerThumb')
		expect(resolveSurfaceMedia(manifest, 'x', 'portfolioCard').width).toBe(800)
		expect(resolveSurfaceMedia(manifest, 'x', 'photoswipeSlide').width).toBe(1200)
		const model = buildPictureModel(resolveSurfaceMedia(manifest, 'x', 'portfolioCard'), {
			originBase: 'https://media.example.com',
			alt: 'Photo',
			sizes: '400px',
		})
		expect(model.sources).toHaveLength(2)
		expect(model.sources.every((source) => !source.srcset.includes('1200w'))).toBe(true)
	})

	it('fails on an empty capped selection and softly skips a missing discovery photo', () => {
		const narrow = structuredClone(manifest)
		narrow.photos.x!.derivatives = narrow.photos.x!.derivatives.filter(
			(item) => item.width > 400,
		)
		expect(hasSurfaceMedia(narrow, 'x', 'footerThumb')).toBe(false)
		expect(hasSurfaceMedia(narrow, 'missing', 'footerThumb')).toBe(false)
		expect(() => resolveSurfaceMedia(narrow, 'x', 'footerThumb')).toThrow(/footerThumb/)
	})
})
