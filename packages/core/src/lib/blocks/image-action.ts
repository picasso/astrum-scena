import { z } from 'astro/zod'

// click action shared by Wrap Around and Gallery (docs/blocks/wrap-around.md,
// docs/blocks/gallery.md); only the shape is checked here, while the album target and custom link
// safety need the catalog and collections and are resolved by each block's view model
export const imageActionSchema = z.union([
	z.literal('none'),
	z.literal('lightbox'),
	z.literal('photo'),
	z.object({ type: z.literal('album'), albumId: z.string().min(1) }).strict(),
	z
		.object({
			type: z.literal('custom'),
			href: z.string().min(1),
			newTab: z.boolean().optional(),
		})
		.strict(),
])

export type ImageAction = z.infer<typeof imageActionSchema>
