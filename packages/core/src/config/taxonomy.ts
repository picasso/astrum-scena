import { z } from 'astro/zod'

import { KEBAB_CASE_PATTERN } from './kebab-case.ts'

// the site's taxonomy enumerations, site.yaml `content.taxonomy`: the album categories (the categories
// dictionary labels exactly these), the place kinds from the root of the hierarchy down (a kind's rank
// is its position, the first kind has no parent) and the tag kinds. The lock holds the effective
// lists, which every schema and helper of the content reads.

// the core's defaults, the first site's taxonomy; consumers read the effective lists from the config
export const DEFAULT_TAXONOMY = {
	categories: ['series', 'places'],
	placeKinds: ['country', 'region', 'locality'],
	tagKinds: ['subject', 'condition', 'motif', 'moment', 'technique'],
} as const satisfies Record<string, readonly string[]>

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

export const taxonomyConfigSchema = z
	.object({
		categories: enumerationSchema(DEFAULT_TAXONOMY.categories),
		placeKinds: enumerationSchema(DEFAULT_TAXONOMY.placeKinds),
		tagKinds: enumerationSchema(DEFAULT_TAXONOMY.tagKinds),
	})
	.strict()
	.prefault({})

export type TaxonomyConfig = z.infer<typeof taxonomyConfigSchema>
