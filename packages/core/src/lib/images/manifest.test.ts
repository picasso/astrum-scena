import { describe, expect, it } from 'vitest'

import {
	buildEmptyManifest,
	type ManifestV3,
	parseManifest,
	serializeManifest,
} from './manifest.ts'

const DIGEST = 'a'.repeat(64)
const SHA = 'b'.repeat(64)

function manifestWithPhoto(): ManifestV3 {
	return parseManifest({
		schemaVersion: 3,
		configDigest: DIGEST,
		photos: {
			photo: {
				masterSha256: SHA,
				sourceWidth: 400,
				sourceHeight: 300,
				orientation: 1,
				dominantColor: '#101418',
				rightsId: 'demo-rights',
				derivatives: [200, 400].flatMap((width) =>
					(['avif', 'webp'] as const).map((format) => ({
						width,
						height: (width * 3) / 4,
						format,
						objectKey: `photo/${width}w-${SHA}.${format}`,
						sha256: SHA,
						byteSize: 100,
						rightsEmbedded: true,
						privacyChecked: true,
						watermarkProfile: 'none',
					})),
				),
			},
		},
	})
}

describe('manifest v3', () => {
	it('accepts an empty manifest and a photo with one ladder', () => {
		expect(parseManifest(buildEmptyManifest(DIGEST)).photos).toEqual({})
		expect(manifestWithPhoto().photos.photo?.derivatives).toHaveLength(4)
	})

	it('rejects a legacy schema and unknown fields', () => {
		expect(() => parseManifest({ ...buildEmptyManifest(DIGEST), schemaVersion: 2 })).toThrow()
		expect(() =>
			parseManifest({ ...buildEmptyManifest(DIGEST), generatedAt: '2026' }),
		).toThrow()
	})

	it('rejects duplicate width/format pairs and unsorted derivatives', () => {
		const duplicate = structuredClone(manifestWithPhoto())
		duplicate.photos.photo!.derivatives.push(duplicate.photos.photo!.derivatives[0]!)
		expect(() => parseManifest(duplicate)).toThrow(/unique and sorted/)
		const unsorted = structuredClone(manifestWithPhoto())
		unsorted.photos.photo!.derivatives.reverse()
		expect(() => parseManifest(unsorted)).toThrow(/unique and sorted/)
	})

	it('rejects an object key that does not match the width and hash', () => {
		const manifest = structuredClone(manifestWithPhoto())
		manifest.photos.photo!.derivatives[0]!.objectKey = `photo/400w-${SHA}.avif`
		expect(() => parseManifest(manifest)).toThrow()
	})
})

describe('serializeManifest', () => {
	it('serializes canonical empty v3 bytes', () => {
		expect(serializeManifest(buildEmptyManifest(DIGEST))).toBe(
			`{\n\t"configDigest": "${DIGEST}",\n\t"photos": {},\n\t"schemaVersion": 3\n}\n`,
		)
	})

	it('round-trips a ladder manifest byte-identically', () => {
		const first = serializeManifest(manifestWithPhoto())
		expect(serializeManifest(parseManifest(JSON.parse(first)))).toBe(first)
	})
})
