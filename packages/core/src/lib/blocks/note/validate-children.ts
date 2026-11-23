import { NoteValidationError } from './schema.ts'

// a note is an errata annotation, not a general container, so it allows the same narrow node set
// as callout and anything else, or an empty body, fails the build

export type MdastLike = {
	type: string
	name?: string
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

// satteri does not sanitize href, so `[x](javascript:…)` would render executable. This is a
// denylist rather than safe-link because prose legitimately uses mailto/tel/anchors, which
// safe-link rejects; browsers ignore whitespace and control chars inside a scheme, so they are
// stripped first
const DANGEROUS_LINK_SCHEME = /^(?:javascript|data|vbscript):/
const LINK_NOISE = /[\p{Cc}\s]/gu

function assertSafeLink(node: MdastLike): void {
	const url = node.url
	if (typeof url !== 'string') return
	const normalized = url.replace(LINK_NOISE, '').toLowerCase()
	if (DANGEROUS_LINK_SCHEME.test(normalized)) {
		throw new NoteValidationError(`disallowed link: unsafe URL scheme in "${url.trim()}"`)
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
			// its `[id]: url` target may live outside the block, so its URL cannot be checked here
			return 'reference-style link (use an inline link instead)'
		case 'containerDirective':
		case 'leafDirective':
		case 'textDirective':
			return node.name === 'note' ? 'nested note' : 'nested directive'
		default:
			if (node.type.startsWith('mdx')) return 'MDX expression or component'
			return node.type
	}
}

function walk(node: MdastLike): void {
	if (!ALLOWED_TYPES.has(node.type)) {
		throw new NoteValidationError(
			`disallowed content: ${describe(node)} is not allowed inside a note`,
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

export function validateNoteChildren(children: readonly MdastLike[] | null | undefined): void {
	const nodes = children ?? []
	// structure first: for a text-less disallowed node such as an image, naming its type helps more
	// than a generic empty-body error
	for (const child of nodes) walk(child)
	if (nodes.length === 0 || textOf(nodes).trim() === '') {
		throw new NoteValidationError('note body is empty; add at least one non-empty paragraph')
	}
}
