import { fileURLToPath } from 'node:url'

import { DIRECTIVES } from '../directives.ts'
import { calloutIconHtml } from './icons.ts'
import { type CalloutModel, CalloutValidationError, parseCalloutAttributes } from './schema.ts'
import { type MdastLike, validateCalloutChildren } from './validate-children.ts'

// replaces `:::callout` with a static `<div>`, no island. The satteri op-stream cannot encode a
// bare `<div>` node, so a blockquote node is retagged via `data.hName`/`hProperties`; the icon is
// an encodable `html` node because the `{rawHtml}` escape hatch cannot be mixed with child nodes

// only the fields the plugin reads
type CalloutDirectiveNode = {
	name?: string
	attributes?: Record<string, string | null | undefined> | null
	position?: { start?: { line?: number; column?: number } | null } | null
	children?: readonly MdastLike[]
}

// structural subset of satteri's MdastVisitorContext: the package is transitive, so its type cannot
// be imported from src; astro.config checks the full plugin shape when passing it to `mdastPlugins`
type CalloutVisitorContext = {
	fileURL?: URL
	replaceNode(node: object, newNode: object): void
}

function locationPrefix(ctx: CalloutVisitorContext, node: CalloutDirectiveNode): string {
	const file = ctx.fileURL ? fileURLToPath(ctx.fileURL) : '<unknown>'
	const start = node.position?.start
	const line = start?.line ?? 0
	const column = start?.column ?? 0
	return `${file}:${line}:${column}`
}

function classNames(model: CalloutModel): string[] {
	const classes = ['callout', `callout--${model.variant}`, `callout--${model.tone}`]
	if (model.icon) classes.push('callout--with-icon')
	if (model.transparent) classes.push('callout--transparent')
	return classes
}

function buildReplacement(model: CalloutModel, children: MdastLike[]): object {
	const content = {
		type: 'blockquote',
		data: { hName: 'div', hProperties: { className: ['callout__content'] } },
		children,
	}
	const parts: object[] = []
	if (model.icon) parts.push({ type: 'html', value: calloutIconHtml(model.icon) })
	parts.push(content)
	return {
		type: 'blockquote',
		data: { hName: 'div', hProperties: { className: classNames(model) } },
		children: parts,
	}
}

export const calloutMdastPlugin = {
	name: 'astrum-scena-callout',
	containerDirective(node: CalloutDirectiveNode, ctx: CalloutVisitorContext): void {
		if (node.name !== DIRECTIVES.callout) return

		const children = (node.children ?? []) as MdastLike[]
		let model: CalloutModel
		try {
			model = parseCalloutAttributes(node.attributes)
			validateCalloutChildren(children)
		} catch (error) {
			if (error instanceof CalloutValidationError) {
				throw new Error(`${locationPrefix(ctx, node)} callout: ${error.message}`)
			}
			throw error
		}

		ctx.replaceNode(node, buildReplacement(model, children))
	},
}
