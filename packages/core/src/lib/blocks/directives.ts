import { CALLOUT_ATTRIBUTES } from './callout/schema.ts'
import { LINKS_ATTRIBUTES } from './links/schema.ts'
import { NOTE_ATTRIBUTES } from './note/schema.ts'

// the container directives (`:::name … :::`) a site's Markdown may use: each mdast plugin claims its
// name from here, and the public API snapshot lists the same names with their attributes
export const DIRECTIVES = {
	callout: 'callout',
	links: 'links',
	note: 'note',
} as const

export type DirectiveName = (typeof DIRECTIVES)[keyof typeof DIRECTIVES]

// an attribute without `values` takes any string, or is a bare flag
export type DirectiveAttribute = { readonly required: boolean; readonly values?: readonly string[] }
export type DirectiveAttributeSpec = Readonly<Record<string, DirectiveAttribute>>

// the attributes each parser accepts, declared once by the parser itself
export const DIRECTIVE_ATTRIBUTES = {
	[DIRECTIVES.callout]: CALLOUT_ATTRIBUTES,
	[DIRECTIVES.links]: LINKS_ATTRIBUTES,
	[DIRECTIVES.note]: NOTE_ATTRIBUTES,
} as const satisfies Record<DirectiveName, DirectiveAttributeSpec>
