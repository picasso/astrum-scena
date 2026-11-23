import { z } from 'astro/zod'

import { localizedRouteTemplateSchema } from './localized-route.ts'

export const privacySchema = z
	.object({
		controller: z
			.object({
				name: z
					.object({ en: z.string().trim().min(1), ru: z.string().trim().min(1) })
					.strict(),
				contact: z
					.object({ kind: z.literal('internal'), href: localizedRouteTemplateSchema })
					.strict(),
			})
			.strict(),
	})
	.strict()
