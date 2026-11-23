import { directiveFromMarkdown } from 'mdast-util-directive'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { mdxFromMarkdown } from 'mdast-util-mdx'
import { directive } from 'micromark-extension-directive'
import { mdxjs } from 'micromark-extension-mdxjs'

import { parseGalleryProps } from '../blocks/gallery/schema.ts'
import { type GallerySourceContext, resolveGallerySource } from '../blocks/gallery/source.ts'
import { parseWrapAroundProps } from '../blocks/wrap-around/schema.ts'

// portfolio photos a `.mdx` body can show through blocks, so the footer promo can exclude everything
// the page already shows. A `<Gallery>` counts its whole source pool: a dynamic one (`randomCount`)
// picks its visible photos in the browser, so at build time any photo it can show counts as shown.
// Props go through the blocks' own schemas and source resolver, so the pool matches the render.
//
// same JSX + directive grammar as the build (see mdx-structure.ts). Expression attributes are
// evaluated only as literals: blocks are authored with literals, and a non-literal expression fails
// the build instead of silently dropping a photo

type EstreeNode = {
	type: string
	value?: unknown
	operator?: string
	argument?: EstreeNode
	elements?: (EstreeNode | null)[]
	properties?: EstreeNode[]
	key?: EstreeNode
	name?: string
	computed?: boolean
	kind?: string
	expressions?: EstreeNode[]
	quasis?: { value: { cooked?: string | null } }[]
	expression?: EstreeNode
	body?: EstreeNode[]
}

type MdastNode = {
	type: string
	name?: string | null
	attributes?: {
		type: string
		name?: string
		value?: string | null | { value: string; data?: { estree?: EstreeNode } }
	}[]
	children?: MdastNode[]
}

const BLOCKS = new Set(['WrapAround', 'Gallery'])

export function extractBlockPhotoIds(body: string, ctx: GallerySourceContext): string[] {
	const tree = fromMarkdown(body, {
		extensions: [mdxjs(), directive()],
		mdastExtensions: [mdxFromMarkdown(), directiveFromMarkdown()],
	}) as unknown as MdastNode

	const ids: string[] = []
	const visit = (node: MdastNode): void => {
		if (
			(node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
			node.name &&
			BLOCKS.has(node.name)
		) {
			const props = readProps(node)
			if (node.name === 'WrapAround') {
				ids.push(...parseWrapAroundProps(props).images.map((image) => image.imageId))
			} else {
				ids.push(...resolveGallerySource(parseGalleryProps(props), ctx).poolIds)
			}
		}
		node.children?.forEach(visit)
	}
	visit(tree)
	return [...new Set(ids)]
}

function readProps(node: MdastNode): Record<string, unknown> {
	const props: Record<string, unknown> = {}
	for (const attribute of node.attributes ?? []) {
		if (attribute.type !== 'mdxJsxAttribute' || !attribute.name) {
			throw new Error(`${node.name}: spread attributes are not supported in content blocks`)
		}
		const { value } = attribute
		if (value === null || value === undefined) {
			props[attribute.name] = true
		} else if (typeof value === 'string') {
			props[attribute.name] = value
		} else {
			const program = value.data?.estree
			const statement = program?.body?.[0]
			if (program?.body?.length !== 1 || statement?.type !== 'ExpressionStatement') {
				throw new Error(`${node.name}: attribute "${attribute.name}" must be a literal`)
			}
			props[attribute.name] = evaluateLiteral(
				statement.expression!,
				node.name!,
				attribute.name,
			)
		}
	}
	return props
}

function evaluateLiteral(node: EstreeNode, block: string, attribute: string): unknown {
	const fail = (): never => {
		throw new Error(`${block}: attribute "${attribute}" must be a literal (got ${node.type})`)
	}
	switch (node.type) {
		case 'Literal':
			return node.value
		case 'UnaryExpression': {
			const argument = evaluateLiteral(node.argument!, block, attribute)
			if (typeof argument !== 'number') return fail()
			if (node.operator === '-') return -argument
			if (node.operator === '+') return argument
			return fail()
		}
		case 'TemplateLiteral':
			if (node.expressions?.length) return fail()
			return node.quasis?.[0]?.value.cooked ?? ''
		case 'ArrayExpression':
			return (node.elements ?? []).map((element) =>
				element ? evaluateLiteral(element, block, attribute) : fail(),
			)
		case 'ObjectExpression': {
			const object: Record<string, unknown> = {}
			for (const property of node.properties ?? []) {
				if (property.type !== 'Property' || property.computed || property.kind !== 'init') {
					return fail()
				}
				const key =
					property.key?.type === 'Identifier'
						? property.key.name
						: property.key?.type === 'Literal'
							? String(property.key.value)
							: fail()
				object[key!] = evaluateLiteral(property.value as EstreeNode, block, attribute)
			}
			return object
		}
		default:
			return fail()
	}
}
