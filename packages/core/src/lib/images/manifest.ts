import { z } from 'astro/zod'

import { KEBAB_CASE_PATTERN } from '../../config/kebab-case.ts'
import { sha256HexSchema } from '../../config/sha256-schema.ts'
import { canonicalStringifyPretty } from './canonical.ts'

// manifest is the canonical runtime media metadata source.

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

const kebabSchema = z.string().regex(KEBAB_CASE_PATTERN)

export const derivativeSchema = z
	.object({
		width: z.number().int().positive(),
		height: z.number().int().positive(),
		format: z.enum(['avif', 'webp']),
		objectKey: z.string().min(1),
		sha256: sha256HexSchema,
		byteSize: z.number().int().positive(),
		rightsEmbedded: z.boolean(),
		privacyChecked: z.boolean(),
	})
	.strict()

const entryBase = {
	masterSha256: sha256HexSchema,
	sourceWidth: z.number().int().positive(),
	sourceHeight: z.number().int().positive(),
	orientation: z.number().int().min(1).max(8),
	dominantColor: z.string().regex(HEX_COLOR_PATTERN),
	rightsId: z.string().min(1),
}

export const ladderDerivativeSchema = derivativeSchema.extend({
	watermarkProfile: z.union([z.literal('none'), kebabSchema]),
})

export const photoManifestEntrySchemaV3 = z
	.object({ ...entryBase, derivatives: z.array(ladderDerivativeSchema).min(1) })
	.strict()

export const manifestSchemaV3 = z
	.object({
		schemaVersion: z.literal(3),
		configDigest: sha256HexSchema,
		photos: z.record(kebabSchema, photoManifestEntrySchemaV3),
	})
	.strict()
	.superRefine((manifest, context) => {
		for (const [photoId, photo] of Object.entries(manifest.photos)) {
			const formatsByWidth = new Map<number, Set<string>>()
			let previousWidth = 0
			let previousFormat = ''
			for (const [index, derivative] of photo.derivatives.entries()) {
				const issue = (message: string) =>
					context.addIssue({
						code: 'custom',
						message,
						path: ['photos', photoId, 'derivatives', index],
					})
				if (derivative.width > photo.sourceWidth) issue('derivative exceeds source width')
				if (
					Math.abs(
						derivative.height -
							Math.round((derivative.width * photo.sourceHeight) / photo.sourceWidth),
					) > 1
				) {
					issue('derivative height does not match source aspect ratio')
				}
				if (
					derivative.width < previousWidth ||
					(derivative.width === previousWidth && derivative.format <= previousFormat)
				) {
					issue('derivatives must be unique and sorted by width and format')
				}
				previousWidth = derivative.width
				previousFormat = derivative.format
				const formats = formatsByWidth.get(derivative.width) ?? new Set<string>()
				if (formats.has(derivative.format)) issue('duplicate width and format')
				formats.add(derivative.format)
				formatsByWidth.set(derivative.width, formats)
				if (
					derivative.objectKey !==
					`${photoId}/${derivative.width}w-${derivative.sha256}.${derivative.format}`
				) {
					issue('object key does not match derivative metadata')
				}
			}
			const formatSets = [...formatsByWidth.values()].map((formats) =>
				[...formats].sort().join(','),
			)
			if (new Set(formatSets).size !== 1) {
				context.addIssue({
					code: 'custom',
					message: 'each width must have the same formats',
					path: ['photos', photoId, 'derivatives'],
				})
			}
		}
	})

export const manifestSchema = manifestSchemaV3

export type Derivative = z.infer<typeof derivativeSchema>
export type PhotoManifestEntry = z.infer<typeof photoManifestEntrySchemaV3>
export type ManifestV3 = z.infer<typeof manifestSchemaV3>
export type Manifest = z.infer<typeof manifestSchema>

export function parseManifest(raw: unknown): Manifest {
	return manifestSchema.parse(raw)
}

export function parseManifestV3(raw: unknown): ManifestV3 {
	return manifestSchemaV3.parse(raw)
}

export function serializeManifest(manifest: Manifest): string {
	return canonicalStringifyPretty(manifest)
}

export function buildEmptyManifest(configDigest: string): Manifest {
	return { schemaVersion: 3, configDigest, photos: {} }
}
