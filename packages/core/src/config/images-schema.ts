import path from 'node:path'

import { z } from 'astro/zod'

import { type ImageLocation, imageLocationShape, refineImageLocation } from './image-location.ts'
import { KEBAB_CASE_PATTERN } from './kebab-case.ts'
import { RIGHTS_PATH } from './rights.ts'
import { sha256HexSchema } from './sha256-schema.ts'

// the `images` section of the site's `site.yaml`, fail-closed: the schema rejects dangling
// references, duplicate ids, unordered widths and any `.jpg` output format. It has no version of its
// own: the file's schemaVersion covers it. The site's own data (`rights`, `watermark`) is required,
// but for the two rights fields derived from the site's origin; the rest has the core's defaults

const HTTPS_URL_PATTERN = /^https:\/\//

export const IMAGE_FORMATS = ['avif', 'webp'] as const

export type ImageFormat = (typeof IMAGE_FORMATS)[number]

export const WATERMARK_POSITIONS = [
	'center',
	'bottom-right',
	'bottom-left',
	'top-right',
	'top-left',
	'focal-safe',
] as const

export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number]

// the config may extend this denylist but never drop an entry from it
export const REQUIRED_DENIED_FIELDS = [
	'GPSLatitude',
	'GPSLongitude',
	'GPSPosition',
	'SerialNumber',
	'SerialNumberFormat',
	'OwnerName',
	'CameraOwnerName',
	'LensSerialNumber',
	'InternalSerialNumber',
	// local source paths
	'PreservedFileName',
	'RawFileName',
	'OriginalRawFileName',
	'DocumentAncestors',
	'History',
	// client and editorial notes
	'Instructions',
	'SpecialInstructions',
	'UserComment',
	'XPComment',
] as const

const kebabSchema = z.string().regex(KEBAB_CASE_PATTERN)
const formatSchema = z.enum(IMAGE_FORMATS)
const qualitySchema = z.number().int().min(1).max(100)

// JSON Schema keyword of a field the core derives when the site leaves it out; the lock, which holds
// the effective config, requires it like a defaulted one
export const DERIVED_FROM_KEYWORD = 'x-derived-from'

const derivedFromOrigin = { [DERIVED_FROM_KEYWORD]: 'origin' }

const rightsSchema = z
	.object({
		copyright: z.string().min(1),
		credit: z.string().min(1),
		licensor: z.string().min(1),
		source: z.string().min(1).optional().meta(derivedFromOrigin),
		webStatement: z
			.url()
			.regex(HTTPS_URL_PATTERN, 'webStatement must be an https URL')
			.optional()
			.meta(derivedFromOrigin),
		imageId: z.string().min(1),
	})
	.strict()

type ImageRightsInput = z.infer<typeof rightsSchema>

export type ImageRights = Required<ImageRightsInput>

// the XMP of the derivatives names the site's own origin, so a domain is written once; a written
// value overrides the derivation, e.g. to keep the old URL in the XMP after a move instead of
// re-encoding every derivative
export function deriveImageRights(rights: ImageRightsInput, origin: string): ImageRights {
	return {
		...rights,
		source: rights.source ?? new URL(origin).host,
		webStatement: rights.webStatement ?? new URL(RIGHTS_PATH, origin).href,
	}
}

// the required tags plus GPSAltitude, in the order the digest of today's derivatives was taken
const DEFAULT_DENIED_FIELDS = [
	'GPSLatitude',
	'GPSLongitude',
	'GPSPosition',
	'GPSAltitude',
	...REQUIRED_DENIED_FIELDS.slice(3),
]

const privacySchema = z
	.object({
		// a written list replaces the default whole, so it repeats the required tags
		deniedFields: z
			.array(z.string().min(1))
			.min(1)
			.default(() => [...DEFAULT_DENIED_FIELDS]),
	})
	.strict()
	.superRefine((value, context) => {
		const present = new Set(value.deniedFields)
		for (const required of REQUIRED_DENIED_FIELDS) {
			if (!present.has(required)) {
				context.addIssue({
					code: 'custom',
					message: `privacy.deniedFields must include required tag "${required}"`,
					path: ['deniedFields'],
				})
			}
		}
	})
	.prefault({})

const watermarkAssetSchema = z
	.object({
		id: kebabSchema,
		file: z
			.string()
			.min(1)
			.refine(
				(value) => !path.isAbsolute(value),
				'Watermark file path must be relative to the site root',
			)
			.refine(
				(value) => !value.split(/[\\/]/).includes('..'),
				'Watermark file path must not contain ".." segments',
			),
		sha256: sha256HexSchema,
	})
	.strict()

// reading the external year-organized archive, where a folder gives a master its year
const archiveSchema = z
	.object({
		// directory names matched at any depth under the archive root: a copy inside one never
		// decides the year, which keeps non-authoritative export and cache folders out. Each entry
		// is a single name with no separators or surrounding spaces, or it would never match
		ignoreDirs: z
			.array(
				z
					.string()
					.min(1)
					.refine(
						(name) =>
							name === name.trim() &&
							!name.includes('/') &&
							!name.includes('\\') &&
							name !== '.' &&
							name !== '..',
						{
							message:
								'archive.ignoreDirs entries must be a single directory name (no path separators, no surrounding whitespace, not "." or "..")',
						},
					),
			)
			.default([]),
	})
	.strict()
	.default({ ignoreDirs: [] })

const ladderQualitySchema = z
	.object({
		upTo: z.number().int().positive().optional(),
		avif: qualitySchema,
		webp: qualitySchema,
	})
	.strict()

const ladderSchema = z
	.object({
		widths: z
			.array(z.number().int().positive())
			.min(1)
			.default(() => [200, 400, 800, 1200, 1600]),
		native: z
			.object({
				enabled: z.boolean().default(true),
				maxLongSide: z.number().int().positive().default(2000),
			})
			.strict()
			.prefault({}),
		quality: z
			.array(ladderQualitySchema)
			.min(1)
			.default(() => [
				{ upTo: 800, avif: 50, webp: 72 },
				{ avif: 55, webp: 78 },
			]),
	})
	.strict()
	.prefault({})

const ladderWatermarkProfileSchema = z
	.object({
		// the manifest records `none` for an unmarked derivative
		id: kebabSchema.refine(
			(value) => value !== 'none',
			'watermark profile id "none" is reserved for unmarked derivatives',
		),
		assetId: kebabSchema,
		scale: z.number().gt(0).lte(1),
		minPx: z.number().int().positive(),
		maxPx: z.number().int().positive(),
		position: z.enum(WATERMARK_POSITIONS),
		inset: z.number().int().min(0),
		// composeWatermark scales the mark's alpha by a byte, so an opacity that rounds to 0 hides it
		opacity: z
			.number()
			.max(1)
			.refine(
				(value) => Math.round(value * 255) >= 1,
				'watermark opacity must leave the mark visible',
			),
	})
	.strict()

// derivatives are served by the site itself unless the config names an external origin; the default
// path depends on whether an origin is written, which a field default cannot see. The literal stays
// inside the function: the API snapshot fingerprints a transform by its source
function withDefaultLocation<T extends ImageLocation>(value: T): T {
	return value.publicOrigin === undefined && value.publicPath === undefined
		? { ...value, publicPath: '/media' }
		: value
}

export const imageConfigSchema = z
	.object({
		...imageLocationShape,
		formats: z
			.array(formatSchema)
			.min(1)
			.default((): ImageFormat[] => ['avif', 'webp']),
		ladder: ladderSchema,
		rights: rightsSchema,
		privacy: privacySchema,
		watermark: z
			.object({
				aboveWidth: z.number().int().positive(),
				assets: z.array(watermarkAssetSchema).min(1),
				profile: ladderWatermarkProfileSchema,
			})
			.strict(),
		archive: archiveSchema,
	})
	.strict()
	.transform(withDefaultLocation)
	.superRefine(refineImageLocation)
	.superRefine((value, context) => {
		const { widths, native, quality } = value.ladder
		if (new Set(value.formats).size !== value.formats.length) {
			context.addIssue({
				code: 'custom',
				message: 'formats must be unique',
				path: ['formats'],
			})
		}
		for (let index = 1; index < widths.length; index += 1) {
			if (widths[index]! <= widths[index - 1]!) {
				context.addIssue({
					code: 'custom',
					message: 'ladder.widths must be strictly ascending and unique',
					path: ['ladder', 'widths'],
				})
				break
			}
		}
		if (native.maxLongSide < widths[widths.length - 1]!) {
			context.addIssue({
				code: 'custom',
				message: 'ladder.native.maxLongSide must cover the largest width',
				path: ['ladder', 'native', 'maxLongSide'],
			})
		}
		for (let index = 0; index < quality.length; index += 1) {
			const band = quality[index]!
			if (index === quality.length - 1 ? band.upTo !== undefined : band.upTo === undefined) {
				context.addIssue({
					code: 'custom',
					message: 'only the final quality band must omit upTo',
					path: ['ladder', 'quality', index, 'upTo'],
				})
			}
			if (index > 0 && band.upTo !== undefined && band.upTo <= quality[index - 1]!.upTo!) {
				context.addIssue({
					code: 'custom',
					message: 'quality bands must be strictly ascending',
					path: ['ladder', 'quality', index, 'upTo'],
				})
			}
		}
		const assetIds = value.watermark.assets.map((asset) => asset.id)
		if (
			new Set(assetIds).size !== assetIds.length ||
			assetIds.length !== 1 ||
			assetIds[0] !== value.watermark.profile.assetId
		) {
			context.addIssue({
				code: 'custom',
				message: 'watermark must have exactly one referenced asset',
				path: ['watermark', 'assets'],
			})
		}
		if (value.watermark.profile.maxPx < value.watermark.profile.minPx) {
			context.addIssue({
				code: 'custom',
				message: 'watermark.profile.maxPx must be >= minPx',
				path: ['watermark', 'profile', 'maxPx'],
			})
		}
		if (
			Math.max(...widths, ...(native.enabled ? [native.maxLongSide] : [])) <=
			value.watermark.aboveWidth
		) {
			context.addIssue({
				code: 'custom',
				message: 'watermark threshold is unreachable',
				path: ['watermark', 'aboveWidth'],
			})
		}
	})

// the effective config, its rights derived (the root of siteSchema derives them from `origin`)
export type ImageConfig = Omit<z.infer<typeof imageConfigSchema>, 'rights'> & {
	rights: ImageRights
}
