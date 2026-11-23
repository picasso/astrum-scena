import { z } from 'astro/zod'

import { galleryPropsSchema } from '../../lib/blocks/gallery/schema.ts'
import { wrapAroundPropsSchema } from '../../lib/blocks/wrap-around/schema.ts'

// the props schema of each global MDX component, without the `.astro` components themselves, so plain
// Node (the public API snapshot) reads the names and props; `MDX_COMPONENTS` must have the same keys
export const MDX_COMPONENT_PROPS = {
	Gallery: galleryPropsSchema,
	WrapAround: wrapAroundPropsSchema,
	PrivacyController: z.object({}).strict(),
} as const

export type MdxComponentName = keyof typeof MDX_COMPONENT_PROPS
