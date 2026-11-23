import { CalloutValidationError } from './schema.ts'

// an allowlist because a callout is a text highlight, not a general container
// (docs/blocks/callout.md); the node type is minimal so validation does not depend on a parser

export type MdastLike = {
	type: string
	name?: string | null
	value?: string
	url?: string
	children?: readonly MdastLike[]
}

const ALLOWED_TYPES = new Set([
	'paragraph',
	'list',
	'listItem',
	'text',
	'strong',
	'emphasis',
	'link',
	'break',
])

// satteri does not sanitize href, so `[x](javascript:alert(1))` would render executable. A
// denylist rather than safe-link, which would reject the mailto/tel/anchor links legitimate in
// prose. Browsers ignore whitespace and control characters inside a scheme (`java\nscript:`)
const DANGEROUS_LINK_SCHEME = /^(?:javascript|data|vbscript):/

function assertSafeLink(node: MdastLike): void {
	const url = node.url
	if (typeof url !== 'string') return
	const normalized = url.replace(/[\u0000-\u0020]/g, '').toLowerCase()
	if (DANGEROUS_LINK_SCHEME.test(normalized)) {
		throw new CalloutValidationError(`disallowed link: unsafe URL scheme in "${url.trim()}"`)
	}
}

function describe(node: MdastLike): string {
	switch (node.type) {
		case 'heading':
			return 'heading'
		case 'image':
		case 'imageReference':
			return 'image'
		case 'table':
		case 'tableRow':
		case 'tableCell':
			return 'table'
		case 'code':
		case 'inlineCode':
			return 'code'
		case 'html':
			return 'raw HTML'
		case 'blockquote':
			return 'blockquote'
		case 'thematicBreak':
			return 'thematic break'
		case 'linkReference':
		case 'definition':
			// the `[id]: url` definition may live outside the block, so its URL is uncheckable
			return 'reference-style link (use an inline link instead)'
		case 'containerDirective':
		case 'leafDirective':
		case 'textDirective':
			return node.name === 'callout' ? 'nested callout' : 'nested directive'
		default:
			if (node.type.startsWith('mdx')) return 'MDX expression or component'
			return node.type
	}
}

function walk(node: MdastLike): void {
	if (!ALLOWED_TYPES.has(node.type)) {
		throw new CalloutValidationError(
			`disallowed content: ${describe(node)} is not allowed inside a callout`,
		)
	}
	if (node.type === 'link') assertSafeLink(node)
	for (const child of node.children ?? []) walk(child)
}

function textOf(nodes: readonly MdastLike[]): string {
	let out = ''
	for (const node of nodes) {
		if (typeof node.value === 'string') out += node.value
		if (node.children) out += textOf(node.children)
	}
	return out
}

export function validateCalloutChildren(children: readonly MdastLike[] | null | undefined): void {
	const nodes = children ?? []
	// structure first: for a textless forbidden node such as an image, naming its type helps more
	// than a generic "body is empty"
	for (const child of nodes) walk(child)
	if (nodes.length === 0 || textOf(nodes).trim() === '') {
		throw new CalloutValidationError(
			'callout body is empty; add at least one non-empty paragraph',
		)
	}
}
