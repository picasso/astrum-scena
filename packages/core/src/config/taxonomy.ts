import { z } from 'astro/zod'

import { KEBAB_CASE_PATTERN } from './kebab-case.ts'
import { localizedLabelSchema } from './localized-label.ts'

// the site's taxonomy enumerations, site.yaml `content.taxonomy`: the album categories (the categories
// dictionary labels exactly these), the place kinds from the root of the hierarchy down (a kind's rank
// is its position, the first kind has no parent), the tag kinds and the dimensions, flat dictionaries
// of their own (`src/content/config/<id>.yaml`) that a photo refers to by `dimensions.<id>`. The lock
// holds the effective lists, which every schema and helper of the content reads.

// the core's defaults, the first site's taxonomy; consumers read the effective lists from the config
export const DEFAULT_TAXONOMY = {
	categories: ['series', 'places'],
	placeKinds: ['country', 'region', 'locality'],
	tagKinds: ['subject', 'condition', 'motif', 'moment', 'technique'],
} as const satisfies Record<string, readonly string[]>

// the other files of `src/content/config/`, whose names a dimension's dictionary would take; a test
// ties them to the paths their loaders read
export const RESERVED_DIMENSION_IDS = [
	'categories',
	'places',
	'tags',
	'image-sets',
	'place-gps-bounds',
] as const

const taxonomyIdSchema = z.string().regex(KEBAB_CASE_PATTERN, {
	message: 'expected a kebab-case id such as `series`',
})

const enumerationSchema = (defaults: readonly string[]) =>
	z
		.array(taxonomyIdSchema)
		.min(1, { message: 'must list at least one id' })
		.superRefine((ids, context) => {
			ids.forEach((id, index) => {
				if (ids.indexOf(id) !== index)
					context.addIssue({ code: 'custom', path: [index], message: `repeats "${id}"` })
			})
		})
		.default(() => [...defaults])

// `label` names the dimension in each locale of `content.locales` (checked at the site level); `icon`
// is a Lucide icon name, which the core finds in its `lucide-static` (config/lucide-icons.ts)
const dimensionSchema = z
	.object({
		label: localizedLabelSchema,
		icon: z
			.string()
			.regex(KEBAB_CASE_PATTERN, {
				message: 'expected a Lucide icon name such as `calendar-days`',
			})
			.optional(),
	})
	.strict()

const dimensionsSchema = z
	.record(taxonomyIdSchema, dimensionSchema)
	.superRefine((dimensions, context) => {
		for (const id of Object.keys(dimensions))
			if ((RESERVED_DIMENSION_IDS as readonly string[]).includes(id))
				context.addIssue({
					code: 'custom',
					path: [id],
					message: `"${id}" names another file of src/content/config [${RESERVED_DIMENSION_IDS.join(', ')}]`,
				})
	})
	.default({})

export const taxonomyConfigSchema = z
	.object({
		categories: enumerationSchema(DEFAULT_TAXONOMY.categories),
		placeKinds: enumerationSchema(DEFAULT_TAXONOMY.placeKinds),
		tagKinds: enumerationSchema(DEFAULT_TAXONOMY.tagKinds),
		dimensions: dimensionsSchema,
	})
	.strict()
	.prefault({})

export type TaxonomyConfig = z.infer<typeof taxonomyConfigSchema>
export type DimensionConfig = z.infer<typeof dimensionSchema>
