import { z } from 'astro/zod'

import { CONTENT_GAPS, type ContentGap } from '../content-gap.ts'
import { imageActionSchema } from '../image-action.ts'

// public contract from docs/blocks/wrap-around.md; checks only the shape of authored props, while
// target existence and image resolution need the catalog and collections and live in the view-model

const wrapGap = z.enum(CONTENT_GAPS as unknown as [ContentGap, ...ContentGap[]])

const imageAction = imageActionSchema

export type { ImageAction } from '../image-action.ts'

// only managed images: `.strict()` rejects an external `src`, ready-made srcset/sizes and legacy
// fields. `alt=""` is a deliberate decorative image; `caption: false` suppresses the caption
const wrapAroundImage = z
	.object({
		imageId: z.string().min(1),
		alt: z.string().optional(),
		caption: z.union([z.string(), z.literal(false)]).optional(),
		action: imageAction.optional(),
	})
	.strict()

export type WrapAroundImage = z.infer<typeof wrapAroundImage>

const commonProps = {
	position: z.enum(['left', 'right']).default('left'),
	// omitted means the width is picked automatically (width.ts)
	width: z.number().int().min(20).max(80).optional(),
	outside: z.number().int().min(0).max(60).default(0),
	textGap: wrapGap.default('small'),
	imageGap: wrapGap.default('small'),
	frame: z.enum(['none', 'thin', 'medium', 'thick']).default('thick'),
	frameColor: z.enum(['default', 'alt']).default('default'),
	action: imageAction.default('lightbox'),
	inlineCaption: z.boolean().default(false),
	lightboxCaption: z.boolean().default(true),
	lightboxScope: z.enum(['block', 'page']).default('page'),
} as const

// `imageId` is a shorthand for a single image without per-image overrides. A refine rather than a
// union keeps precise error paths for the other props; the output always carries `images`
export const wrapAroundPropsSchema = z
	.object({
		imageId: z.string().min(1).optional(),
		images: z.array(wrapAroundImage).min(1).optional(),
		...commonProps,
	})
	.strict()
	.superRefine((props, ctx) => {
		const hasImageId = props.imageId !== undefined
		const hasImages = props.images !== undefined
		if (hasImageId === hasImages) {
			ctx.addIssue({
				code: 'custom',
				path: hasImageId ? ['images'] : ['imageId'],
				message: 'provide exactly one of imageId or images',
			})
		}
		if (props.outside > 0 && props.width === undefined) {
			ctx.addIssue({
				code: 'custom',
				path: ['outside'],
				message: 'requires an explicit width',
			})
		}
		if (props.width !== undefined && props.outside > props.width - 20) {
			ctx.addIssue({
				code: 'custom',
				path: ['outside'],
				message: 'must leave at least 20 percentage points for the float slot',
			})
		}
	})
	.transform((props) => {
		if (props.images) {
			const normalized = { ...props }
			delete normalized.imageId
			return { ...normalized, images: props.images }
		}
		const { imageId, ...rest } = props
		return { ...rest, images: [{ imageId: imageId! }] }
	})

type WrapAroundCommonInput = Omit<z.input<typeof wrapAroundPropsSchema>, 'imageId' | 'images'>
export type WrapAroundInput = WrapAroundCommonInput &
	({ imageId: string; images?: never } | { images: WrapAroundImage[]; imageId?: never })
export type WrapAroundProps = z.output<typeof wrapAroundPropsSchema>

export function parseWrapAroundProps(input: unknown): WrapAroundProps {
	const result = wrapAroundPropsSchema.safeParse(input)
	if (!result.success) {
		const issue = result.error.issues[0]
		const path = issue?.path.join('.') || '(root)'
		throw new Error(`WrapAround: invalid props at ${path}: ${issue?.message}`)
	}
	return result.data
}
