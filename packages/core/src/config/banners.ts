import { z } from 'astro/zod'

// banner photos for surfaces without a document of their own (section indexes, Contacts). Only the
// photo id lives here: dimensions, dominant color, derivatives and alt resolve from the image
// manifest and the `photos` collection, so there is no second source of truth for media. The
// assignment is fixed rather than a random pick, otherwise visual baselines would be unstable.
// Albums and documents carry their cover in content (ADR-0013), so they are not listed here.

const photoIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

// `off` renders the text header instead of a photo; YAML 1.2 reads a bare `off` as a string
export const surfaceBannerSchema = z.union([z.literal('off'), photoIdSchema]).default('off')

const surfaceBannersSchema = z
	.object({
		portfolioIndex: surfaceBannerSchema,
		articlesIndex: surfaceBannerSchema,
		contacts: surfaceBannerSchema,
	})
	.strict()
	.prefault({})

export const bannersSchema = z
	.object({
		surfaces: surfaceBannersSchema,
	})
	.strict()
	.prefault({})

export type BannersConfig = z.infer<typeof bannersSchema>
export type BannerSurface = keyof BannersConfig['surfaces']
