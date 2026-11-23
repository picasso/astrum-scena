import { z } from 'astro/zod'

// content container widths (ADR-0008); the CSS token generator and the site both read them through
// src/config/loader.ts. The bounds are fail-closed, and prose ≤ medium ≤ standard ≤ gallery keeps
// each tier meaningful: the narrow reading column must not outgrow the document or index widths
export const layoutSchema = z
	.object({
		prose: z.number().int().min(320).max(1200).default(680),
		medium: z.number().int().min(600).max(1400).default(960),
		standard: z.number().int().min(600).max(1600).default(1200),
		gallery: z.number().int().min(600).max(2560).default(1440),
	})
	.strict()
	.superRefine((value, context) => {
		if (value.prose > value.medium) {
			context.addIssue({
				code: 'custom',
				message: 'layout.prose must not exceed layout.medium',
				path: ['prose'],
			})
		}
		if (value.medium > value.standard) {
			context.addIssue({
				code: 'custom',
				message: 'layout.medium must not exceed layout.standard',
				path: ['medium'],
			})
		}
		if (value.standard > value.gallery) {
			context.addIssue({
				code: 'custom',
				message: 'layout.standard must not exceed layout.gallery',
				path: ['standard'],
			})
		}
	})
	.prefault({})

export type LayoutConfig = z.infer<typeof layoutSchema>
