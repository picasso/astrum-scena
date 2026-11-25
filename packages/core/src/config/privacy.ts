import { z } from 'astro/zod'

import { localizedLabelSchema } from './localized-label.ts'
import { localizedRouteTemplateSchema } from './localized-route.ts'

export const privacySchema = z
	.object({
		controller: z
			.object({
				name: localizedLabelSchema,
				contact: z
					.object({ kind: z.literal('internal'), href: localizedRouteTemplateSchema })
					.strict(),
			})
			.strict(),
	})
	.strict()
