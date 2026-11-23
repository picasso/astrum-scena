import { describe, expect, it } from 'vitest'

import { digestTranslationSource } from '../content/translation-freshness.ts'
import {
	computeConfigDigest,
	deriveImageRights,
	IMAGE_DIGEST_VERSION,
	imageConfigSchema,
} from './build/config.ts'
import { ladderObjectKey, sha256Bytes } from './build/hashing.ts'
import { parseManifest } from './manifest.ts'

// the byte contract of the core: a site's derivatives are reused, and its translations stay current, only
// while these values keep every byte for the same input. A literal that changes here makes every
// site re-encode its derivatives or re-review its translations, so the release is breaking and
// needs an entry in UPGRADING.md; update a literal only together with that entry. The configDigest
// literal is that of IMAGE_DIGEST_VERSION, which changes together with it.

const CONFIG = {
	publicPath: '/media',
	formats: ['avif', 'webp'],
	archive: { ignoreDirs: [] },
	rights: {
		copyright: '© The Astrum Scena authors. CC0 1.0.',
		credit: 'The Astrum Scena authors',
		licensor: 'The Astrum Scena authors',
		source: 'demo.example.com',
		webStatement: 'https://demo.example.com/rights/',
		imageId: 'astrum-scena-demo',
	},
	privacy: {
		deniedFields: [
			'GPSLatitude',
			'GPSLongitude',
			'GPSPosition',
			'GPSAltitude',
			'SerialNumber',
			'SerialNumberFormat',
			'OwnerName',
			'CameraOwnerName',
			'LensSerialNumber',
			'InternalSerialNumber',
			'PreservedFileName',
			'RawFileName',
			'OriginalRawFileName',
			'DocumentAncestors',
			'History',
			'Instructions',
			'SpecialInstructions',
			'UserComment',
			'XPComment',
		],
	},
	watermark: {
		aboveWidth: 800,
		assets: [
			{
				id: 'astrum-scena-mark',
				file: 'src/assets/images/watermarks/astrum-scena-mark.png',
				sha256: '3c20009eba427f50b87157de6f5916243e9332095a425bee3ce346cd3ed08642',
			},
		],
		profile: {
			id: 'watermark',
			assetId: 'astrum-scena-mark',
			scale: 0.17,
			minPx: 96,
			maxPx: 384,
			position: 'bottom-right',
			inset: 24,
			opacity: 0.8,
		},
	},
	ladder: {
		widths: [200, 400, 800],
		native: { enabled: true, maxLongSide: 2000 },
		quality: [
			{ upTo: 400, avif: 50, webp: 72 },
			{ avif: 55, webp: 78 },
		],
	},
}

// CONFIG writes both rights fields that the core derives from the origin, so deriving changes nothing
const configDigest = () => {
	const config = imageConfigSchema.parse(CONFIG)
	return computeConfigDigest({
		...config,
		rights: deriveImageRights(config.rights, 'https://demo.example.com'),
	})
}

const DERIVATIVE_BYTES = Buffer.from('a derivative after resize, watermark, encode and rights')
const DERIVATIVE_SHA = '0abba498a4f9ac3253df877e545736cf9db52388951caa3c89c5980800c450c3'
const OBJECT_KEY =
	'alpine-lake/800w-0abba498a4f9ac3253df877e545736cf9db52388951caa3c89c5980800c450c3.avif'

const manifestWithKey = (objectKey: string) =>
	parseManifest({
		schemaVersion: 3,
		configDigest: configDigest(),
		photos: {
			'alpine-lake': {
				masterSha256: 'b'.repeat(64),
				sourceWidth: 1600,
				sourceHeight: 1200,
				orientation: 1,
				dominantColor: '#101418',
				rightsId: 'demo-rights',
				derivatives: [
					{
						width: 800,
						height: 600,
						format: 'avif',
						objectKey,
						sha256: DERIVATIVE_SHA,
						byteSize: 100,
						rightsEmbedded: true,
						privacyChecked: true,
						watermarkProfile: 'none',
					},
				],
			},
		},
	})

describe('byte contract of hashes and addresses (AD-7)', () => {
	it('keeps the configDigest of the image config', () => {
		expect(IMAGE_DIGEST_VERSION).toBe(1)
		expect(configDigest()).toBe(
			'80d0daa239c753f896b3e49edacd4623c13dff407478eb9458844b18f65710e7',
		)
	})

	it('keeps the object key of a derivative and its sha256', () => {
		expect(sha256Bytes(DERIVATIVE_BYTES)).toBe(DERIVATIVE_SHA)
		expect(ladderObjectKey('alpine-lake', 800, 'avif', DERIVATIVE_SHA)).toBe(OBJECT_KEY)
	})

	it('accepts in the manifest only the object key of that form', () => {
		expect(manifestWithKey(OBJECT_KEY).photos['alpine-lake']?.derivatives[0]?.objectKey).toBe(
			OBJECT_KEY,
		)
		expect(() => manifestWithKey(`alpine-lake/800-${DERIVATIVE_SHA}.avif`)).toThrow(
			/object key does not match/,
		)
	})

	it('keeps the translatedFromDigest of a reference body', () => {
		const body =
			'\r\n# Title\r\n\r\nThe body of the reference article.\r\n\r\n:::note{claim="demo:aaaaaaaa"}\nAn errata note.\n:::\n'
		expect(digestTranslationSource(body)).toBe(
			'c993aacb7fee1781a25a6ab08ac28c98521535f722533488870e1b705f86c7b3',
		)
	})
})
