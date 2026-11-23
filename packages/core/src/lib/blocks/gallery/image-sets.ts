import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'astro/zod'
import { parse as parseYaml } from 'yaml'

import { assertSchemaVersion, SCHEMA_VERSION_KEY } from '../../../config/schema-version.ts'
import { kebabIdSchema } from '../../content/schemas.ts'

// named image sets (docs/blocks/gallery.md) are internal pools, not public albums, so they have no
// page, title, cover or localization; this schema checks only shape, while existence, publication
// and priority membership need the collections and are checked by the gallery source resolver

export const IMAGE_SET_ORDERS = [
	'source',
	'favorites-first',
	'published-newest',
	'published-oldest',
	'captured-newest',
	'captured-oldest',
] as const

export const imageSetOrderSchema = z.enum(IMAGE_SET_ORDERS)

export type ImageSetOrder = z.infer<typeof imageSetOrderSchema>

function uniqueList(context: z.RefinementCtx, ids: string[] | undefined, field: string): void {
	if (ids && new Set(ids).size !== ids.length) {
		context.addIssue({
			code: 'custom',
			message: `Image set ${field} must contain unique IDs`,
			path: [field],
		})
	}
}

export const imageSetSchema = z
	.object({
		albumIds: z.array(kebabIdSchema).optional(),
		photoIds: z.array(kebabIdSchema).optional(),
		priorityPhotoIds: z.array(kebabIdSchema).optional(),
		order: imageSetOrderSchema.optional(),
	})
	.strict()
	.superRefine((value, context) => {
		const hasAlbums = (value.albumIds?.length ?? 0) > 0
		const hasPhotos = (value.photoIds?.length ?? 0) > 0
		if (!hasAlbums && !hasPhotos) {
			context.addIssue({
				code: 'custom',
				message: 'Image set requires a non-empty albumIds or photoIds',
				path: [],
			})
		}
		uniqueList(context, value.albumIds, 'albumIds')
		uniqueList(context, value.photoIds, 'photoIds')
		uniqueList(context, value.priorityPhotoIds, 'priorityPhotoIds')
	})

export type ImageSet = z.infer<typeof imageSetSchema>

export type ImageSetsConfig = Record<string, ImageSet>

// the sets sit at the top level of the file, keyed by their IDs, beside its schemaVersion
export const imageSetsFileSchema = z
	.object({ schemaVersion: z.literal(1) })
	.catchall(imageSetSchema)
	.superRefine((value, context) => {
		for (const id of Object.keys(value)) {
			if (id !== SCHEMA_VERSION_KEY && !kebabIdSchema.safeParse(id).success) {
				context.addIssue({
					code: 'custom',
					message: 'Image set IDs must be kebab-case',
					path: [id],
				})
			}
		}
	})

export const IMAGE_SETS_CONFIG_PATH = 'src/content/config/image-sets.yaml'

// a file with no sets is valid, since image sets are optional, but it still declares its version
export function parseImageSetsConfig(
	raw: unknown,
	filePath = IMAGE_SETS_CONFIG_PATH,
): ImageSetsConfig {
	assertSchemaVersion(raw, filePath, imageSetsFileSchema)
	return Object.fromEntries(
		Object.entries(imageSetsFileSchema.parse(raw)).filter(([id]) => id !== SCHEMA_VERSION_KEY),
	) as ImageSetsConfig
}

// a site without the file has no image sets; a file that exists, even empty, declares its version
export async function loadImageSets(root: string): Promise<ImageSetsConfig> {
	let raw: string
	try {
		raw = await readFile(path.join(root, IMAGE_SETS_CONFIG_PATH), 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
		throw error
	}
	return parseImageSetsConfig(parseYaml(raw))
}
