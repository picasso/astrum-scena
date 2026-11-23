import { z } from 'astro/zod'

import { focalPointSchema } from '../../content/schemas.ts'
import { CONTENT_GAPS, type ContentGap } from '../content-gap.ts'
import { imageActionSchema } from '../image-action.ts'

// public Gallery contract (docs/blocks/gallery.md); only the shape of authored props is checked
// here, while source existence, publication, source priority and album expansion need the catalog
// and collections and belong to the source and build resolvers

const galleryGap = z.enum(CONTENT_GAPS as unknown as [ContentGap, ...ContentGap[]])
const galleryLayout = z.enum(['rect', 'square', 'justified'])
// a literal union instead of `z.number().min(1).max(5)` keeps the inferred type `1 | 2 | 3 | 4 | 5`
// rather than `number`
const galleryColumns = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(4),
	z.literal(5),
])
const imageFrame = z.enum(['none', 'thin', 'medium', 'thick'])
const imageFrameColor = z.enum(['default', 'alt'])
const lightboxScope = z.enum(['block', 'page'])

// `alt=""` marks a deliberately decorative image, `caption: false` suppresses the caption, and a
// `focalPoint` override matters only when cropping; `.strict()` rejects an external `src`,
// ready-made srcset/sizes and other technical or legacy fields
const galleryImageOverrides = z
	.object({
		imageId: z.string().min(1),
		alt: z.string().optional(),
		caption: z.union([z.string(), z.literal(false)]).optional(),
		action: imageActionSchema.optional(),
		focalPoint: focalPointSchema.optional(),
	})
	.strict()

// normalizing the string shorthand before validation keeps field errors at their exact
// `images.N.<field>` path instead of a generic union message
const galleryImage = z.preprocess(
	(value) => (typeof value === 'string' ? { imageId: value } : value),
	galleryImageOverrides,
)

export type GalleryImageOverrides = z.output<typeof galleryImageOverrides>
// declared explicitly because `z.preprocess` infers its input as `unknown`, which would weaken
// `GalleryInput.images` to `unknown[]`
export type GalleryImageInput = string | z.input<typeof galleryImageOverrides>

export const galleryPropsSchema = z
	.object({
		imageSetId: z.string().min(1).optional(),
		albumId: z.string().min(1).optional(),
		images: z.array(galleryImage).min(1).optional(),
		exclude: z.array(z.string().min(1)).default([]),
		// absent means the whole pool is shown without random sampling
		randomCount: z.number().int().positive().optional(),
		layout: galleryLayout.default('rect'),
		columns: galleryColumns.default(3),
		// symmetric breakout from the prose on each side, in percent of the prose width; CSS also
		// caps it to the safe viewport space and drops it on mobile
		outside: z.number().int().min(0).max(60).default(0),
		mobileFirstOnly: z.boolean().default(true),
		gap: galleryGap.default('small'),
		frame: imageFrame.default('thin'),
		frameColor: imageFrameColor.default('default'),
		action: imageActionSchema.default('lightbox'),
		inlineCaption: z.boolean().default(false),
		lightboxCaption: z.boolean().default(true),
		lightboxScope: lightboxScope.default('page'),
	})
	.strict()
	.superRefine((value, context) => {
		// several valid sources are allowed: the resolver picks one by strict priority and reports
		// the ignored ones
		if (
			value.imageSetId === undefined &&
			value.albumId === undefined &&
			value.images === undefined
		) {
			context.addIssue({
				code: 'custom',
				message: 'Gallery requires at least one of imageSetId, albumId or images',
				path: [],
			})
		}
		// authored duplicates are an error; only image set expansion deduplicates silently
		if (value.images) {
			const ids = value.images.map((image) => image.imageId)
			if (new Set(ids).size !== ids.length) {
				context.addIssue({
					code: 'custom',
					message: 'Gallery images must not repeat the same imageId',
					path: ['images'],
				})
			}
		}
		if (new Set(value.exclude).size !== value.exclude.length) {
			context.addIssue({
				code: 'custom',
				message: 'Gallery exclude must not contain duplicate IDs',
				path: ['exclude'],
			})
		}
	})

// `images` is overridden because `z.preprocess` would infer `unknown[]`
export type GalleryInput = Omit<z.input<typeof galleryPropsSchema>, 'images'> & {
	images?: GalleryImageInput[]
}
export type GalleryProps = z.output<typeof galleryPropsSchema>

export function parseGalleryProps(input: unknown): GalleryProps {
	const result = galleryPropsSchema.safeParse(input)
	if (!result.success) {
		const issue = result.error.issues[0]
		const path = issue?.path.join('.') || '(root)'
		throw new Error(`Gallery: invalid props at ${path}: ${issue?.message}`)
	}
	return result.data
}
