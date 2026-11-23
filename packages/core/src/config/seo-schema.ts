import { z } from 'astro/zod'

const publicImageSchema = z
	.string()
	.regex(/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:avif|jpe?g|png|webp)$/)

export const seoSchema = z
	.object({
		description: z
			.object({ en: z.string().trim().min(1), ru: z.string().trim().min(1) })
			.strict(),
		socialImage: publicImageSchema.optional(),
	})
	.strict()
