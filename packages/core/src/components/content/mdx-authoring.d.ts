import type { GalleryInput } from '../../lib/blocks/gallery/schema.ts'
import type { WrapAroundInput } from '../../lib/blocks/wrap-around/schema.ts'

// editor-only contract of the global MDX components for the MDX language server (`mdx.checkMdx`):
// Astro types an imported `.astro` as `Record<string, any>`, so `typeof MDX_COMPONENTS` would give
// no errors or hints in `.mdx`. Props come from the schemas' Zod input types, not a copy
type MdxComponent<P> = (props: P) => null

declare global {
	type MDXProvidedComponents = {
		Gallery: MdxComponent<GalleryInput>
		WrapAround: MdxComponent<WrapAroundInput>
		PrivacyController: MdxComponent<Record<string, never>>
	}
}
