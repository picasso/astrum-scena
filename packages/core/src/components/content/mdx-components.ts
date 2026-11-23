// components available to MDX documents without an import in the document: `document-body.astro`
// passes this registry to `<Content components={…} />`, so a new block registers here, with its props
// schema in `mdx-component-props.ts`, and touches nothing else in the render path

import Gallery from '../blocks/gallery.astro'
import WrapAround from '../blocks/wrap-around.astro'
import type { MdxComponentName } from './mdx-component-props.ts'
import PrivacyController from './privacy-controller.astro'

// exactly the names of `MDX_COMPONENT_PROPS`: a missing or an extra key fails the typecheck
export type MdxComponentRegistry = Record<MdxComponentName, unknown>

export const MDX_COMPONENTS = {
	Gallery,
	WrapAround,
	PrivacyController,
} satisfies MdxComponentRegistry

// names must match `MDXProvidedComponents` in `mdx-authoring.d.ts`: Astro's component types are
// useless to the MDX language server, so the editor contract lives separately
