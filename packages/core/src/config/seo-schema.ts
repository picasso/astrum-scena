import { z } from 'astro/zod'

import { localizedLabelSchema } from './localized-label.ts'

const publicImageSchema = z
	.string()
	.regex(/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:avif|jpe?g|png|webp)$/)

export const seoSchema = z
	.object({
		description: localizedLabelSchema,
		socialImage: publicImageSchema.optional(),
	})
	.strict()
