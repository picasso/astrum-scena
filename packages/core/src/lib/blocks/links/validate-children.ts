import { LinksValidationError } from './schema.ts'

// authors may write links as a list, as lines or several on one line, and the block builds the
// list itself; the body may hold only links, and labels only inline markup at any depth (anti-XSS).
// URL scheme safety is checked by the plugin via `resolveSafeLink`

export type MdastLike = {
	type: string
	name?: string | null
	value?: string
	url?: string
	title?: string
	ordered?: boolean | null
	spread?: boolean | null
	checked?: boolean | null
	children?: readonly MdastLike[]
}

const ALLOWED_LABEL_TYPES = new Set(['text', 'strong', 'emphasis', 'break'])

// input form (list or plain lines) reduces to walking these containers
const STRUCTURAL_TYPES = new Set(['list', 'listItem', 'paragraph'])

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
			return node.name === 'links' ? 'nested links' : 'nested directive'
		default:
			if (node.type.startsWith('mdx')) return 'MDX expression or component'
			return node.type
	}
}

function textOf(nodes: readonly MdastLike[]): string {
	let out = ''
	for (const node of nodes) {
		if (typeof node.value === 'string') out += node.value
		if (node.children) out += textOf(node.children)
	}
	return out
}

// the walk is recursive: a disallowed node nested deeper (raw `html` inside `***…***`) would
// otherwise render as executable markup; an empty label would yield an inaccessible `<a>`
function walkLabel(node: MdastLike): void {
	for (const child of node.children ?? []) {
		if (!ALLOWED_LABEL_TYPES.has(child.type)) {
			throw new LinksValidationError(
				`disallowed content: ${describe(child)} is not allowed inside a link label`,
			)
		}
		walkLabel(child)
	}
}

function validateLinkLabel(link: MdastLike): void {
	walkLabel(link)
	if (textOf(link.children ?? []).trim() === '') {
		throw new LinksValidationError(
			'link with an empty or formatting-only label; give every link visible text',
		)
	}
}

function isWhitespaceText(node: MdastLike): boolean {
	return node.type === 'text' && (node.value ?? '').trim() === ''
}

function collect(node: MdastLike, out: MdastLike[]): void {
	if (node.type === 'link') {
		validateLinkLabel(node)
		out.push(node)
		return
	}
	if (node.type === 'break' || isWhitespaceText(node)) return
	if (node.type === 'text') {
		throw new LinksValidationError(
			'plain text is not allowed alongside the links; put only links (one set of links) in the block',
		)
	}
	if (STRUCTURAL_TYPES.has(node.type)) {
		// a task-list item's `checked` state would otherwise be dropped silently
		if (node.type === 'listItem' && node.checked != null) {
			throw new LinksValidationError(
				'task-list checkboxes are not allowed; write a plain link, not "- [ ] …"',
			)
		}
		for (const child of node.children ?? []) collect(child, out)
		return
	}
	throw new LinksValidationError(
		`disallowed content: ${describe(node)} is not allowed inside a links block`,
	)
}

export function collectLinks(children: readonly MdastLike[] | null | undefined): MdastLike[] {
	const out: MdastLike[] = []
	for (const child of children ?? []) collect(child, out)
	if (out.length === 0) {
		throw new LinksValidationError('links body is empty; add at least one link')
	}
	return out
}
