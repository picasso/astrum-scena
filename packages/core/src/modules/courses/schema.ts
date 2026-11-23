import { z } from 'astro/zod'

import { surfaceBannerSchema } from '../../config/banners.ts'
import {
	articlesOrderSchema,
	documentSurfaceSchema,
	moreDocsConfigSchema,
} from '../../config/document-schemas.ts'
import {
	isoDateSchema,
	localizedDocumentBaseSchema,
	refineSourceIdentity,
} from '../../lib/content/schemas.ts'

export const COURSE_STATUSES = ['archive', 'current'] as const
export type CourseStatus = (typeof COURSE_STATUSES)[number]

// `src/content/courses/<translation-key>.<locale>.md`. `courseStatus` and `publishedAt` are Tier-1
// fields (ADR-0013): only the reference-locale file carries them, and pair-level integrity requires
// `courseStatus` there, since a per-file schema cannot see the pair
export const courseSchema = localizedDocumentBaseSchema
	.extend({
		// courses use it for their newest-first order
		publishedAt: isoDateSchema.optional(),
		courseStatus: z.enum(COURSE_STATUSES).optional(),
	})
	.strict()
	.superRefine(refineSourceIdentity)

export type CourseData = z.infer<typeof courseSchema>

// `modules.courses`: the index takes the articles order, optionally with current courses first; the
// moreDocs block of a course, the index surface and its banner are the module's, not top-level sections
export const coursesConfigSchema = z
	.object({
		order: articlesOrderSchema.default('title'),
		currentFirst: z.enum(['on', 'off']).default('on'),
		// written whole, like a `moreDocs.<kind>` block of the core
		moreDocs: moreDocsConfigSchema.default({
			source: 'siblings',
			layout: 'list',
			width: 'medium',
			heading: 'on',
			media: 'on',
			excerpt: 'on',
			card: 'details',
			ratio: 'vista',
			order: 'title',
			limit: 'all',
		}),
		surface: documentSurfaceSchema({ width: 'standard', kind: 'list', ratio: 'vista' }),
		banner: surfaceBannerSchema,
	})
	.strict()
	.superRefine((value, context) => {
		// course cards show no date, so a list of them is not ordered by one (more-docs/registry.ts)
		if (value.moreDocs.order === 'newest')
			context.addIssue({
				code: 'custom',
				path: ['moreDocs', 'order'],
				message: 'course does not support newest order',
			})
	})

export type CoursesConfig = z.infer<typeof coursesConfigSchema>
