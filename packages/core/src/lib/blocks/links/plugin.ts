import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { type Locale, LOCALE_FILE_PATTERN } from '../../../config/locale-schema.ts'
import { DIRECTIVES } from '../directives.ts'
import { resolveSafeLink } from '../safe-link.ts'
import { linksIconHtml } from './icons.ts'
import { type LinksModel, LinksValidationError, parseLinksAttributes } from './schema.ts'
import { collectLinks, type MdastLike } from './validate-children.ts'

// renders `:::links` as static HTML with no island; like callout/note, the carrier is a blockquote
// node retagged via `data.hName`. The title must stay an mdast `text` node so the serializer
// escapes it: interpolating it into an `html` node would allow stored HTML/JS injection

const LINKS_DEFAULT_TITLE = {
	ru: 'Ссылки',
	en: 'Links',
} as const satisfies Record<Locale, string>

type LinksLocale = Locale

type LinksDirectiveNode = {
	name?: string
	attributes?: Record<string, string | null | undefined> | null
	position?: { start?: { line?: number; column?: number } | null } | null
	children?: readonly MdastLike[]
}

// satteri's MdastVisitorContext is a transitive dependency that src cannot import; astro.config
// type-checks the full plugin shape when passing it to `mdastPlugins`
type LinksVisitorContext = {
	fileURL?: URL
	replaceNode(node: object, newNode: object): void
}

// satteri exposes `node.children` as read-only stubs with no setter, so the list subtree is cloned
// into plain objects before it is annotated
type MutableNode = {
	type: string
	url?: string
	title?: string
	value?: string
	ordered?: boolean
	spread?: boolean
	children?: MutableNode[]
	data?: { hName?: string; hProperties?: Record<string, unknown> }
}

// copies only what the list render needs; `spread` must survive or mdast-util-to-hast wraps `<li>`
// content in an extra `<p>`
function cloneNode(node: MdastLike): MutableNode {
	const out: MutableNode = { type: node.type }
	if (typeof node.value === 'string') out.value = node.value
	if (typeof node.url === 'string') out.url = node.url
	// keeps the author's `[label](url "title")` tooltip
	if (typeof node.title === 'string') out.title = node.title
	if (typeof node.ordered === 'boolean') out.ordered = node.ordered
	if (typeof node.spread === 'boolean') out.spread = node.spread
	if (node.children) out.children = node.children.map(cloneNode)
	return out
}

function locationPrefix(ctx: LinksVisitorContext, node: LinksDirectiveNode): string {
	const file = ctx.fileURL ? fileURLToPath(ctx.fileURL) : '<unknown>'
	const start = node.position?.start
	const line = start?.line ?? 0
	const column = start?.column ?? 0
	return `${file}:${line}:${column}`
}

// the file name is the only locale source the satteri context offers (no frontmatter), so an
// unrecognized locale fails the build instead of silently defaulting to RU
function detectLocale(ctx: LinksVisitorContext): LinksLocale | null {
	const url = ctx.fileURL
	if (!url) return null
	const match = LOCALE_FILE_PATTERN.exec(path.basename(fileURLToPath(url)))
	return (match?.[2] as Locale | undefined) ?? null
}

// any scheme outside the `resolveSafeLink` allowlist fails the build; internal links keep the tab
function annotateLink(link: MutableNode, model: LinksModel): void {
	const resolved = resolveSafeLink(link.url ?? '', { newTab: true })
	if (!resolved) {
		throw new LinksValidationError(
			`disallowed link: unsafe or unsupported URL "${(link.url ?? '').trim()}"`,
		)
	}
	if (!resolved.external) return
	link.data = {
		...link.data,
		hProperties: { ...link.data?.hProperties, target: '_blank', rel: 'noopener noreferrer' },
	}
	if (model.icon === 'each') {
		// the leading ↗ replaces the bullet as the item marker
		link.children = [{ type: 'html', value: linksIconHtml('each') }, ...(link.children ?? [])]
	}
}

// one semantic list whatever the input form (list, lines or a single run); `spread: false` keeps
// mdast-util-to-hast from wrapping item content in an extra `<p>`
function buildList(links: readonly MdastLike[], model: LinksModel): MutableNode {
	const items: MutableNode[] = links.map((original) => {
		const link = cloneNode(original)
		annotateLink(link, model)
		return {
			type: 'listItem',
			spread: false,
			children: [{ type: 'paragraph', children: [link] }],
		}
	})
	return {
		type: 'list',
		ordered: false,
		spread: false,
		data: { hProperties: { className: ['links__list'] } },
		children: items,
	}
}

function buildReplacement(model: LinksModel, titleText: string | null, list: MutableNode): object {
	const className = [
		'links',
		`links--${model.size}`,
		`links--gap-${model.gap}`,
		`links--w-${model.width}`,
		`links--${model.align}`,
		`links--icon-${model.icon}`,
	]

	const parts: object[] = []
	if (titleText !== null) {
		const titleChildren: object[] = []
		if (model.icon === 'heading') {
			titleChildren.push({ type: 'html', value: linksIconHtml('heading') })
		}
		titleChildren.push({ type: 'text', value: titleText })
		parts.push({
			type: 'paragraph',
			data: { hName: 'p', hProperties: { className: ['links__title'] } },
			children: titleChildren,
		})
	}
	parts.push(list)

	return {
		type: 'blockquote',
		data: { hName: 'div', hProperties: { className } },
		children: parts,
	}
}

export const linksMdastPlugin = {
	name: 'astrum-scena-links',
	containerDirective(node: LinksDirectiveNode, ctx: LinksVisitorContext): void {
		if (node.name !== DIRECTIVES.links) return

		const children = (node.children ?? []) as MdastLike[]
		let model: LinksModel
		let links: MdastLike[]
		try {
			model = parseLinksAttributes(node.attributes)
			links = collectLinks(children)
		} catch (error) {
			if (error instanceof LinksValidationError) {
				throw new Error(`${locationPrefix(ctx, node)} links: ${error.message}`)
			}
			throw error
		}

		let titleText: string | null = null
		if (!model.notitle) {
			if (model.title !== undefined) {
				titleText = model.title
			} else {
				const locale = detectLocale(ctx)
				if (locale === null) {
					throw new Error(
						`${locationPrefix(ctx, node)} links: cannot determine the document locale for the default title; name the file *.ru.md(x) or *.en.md(x), or pass an explicit title="…"`,
					)
				}
				titleText = LINKS_DEFAULT_TITLE[locale]
			}
		}

		let list: MutableNode
		try {
			list = buildList(links, model)
		} catch (error) {
			if (error instanceof LinksValidationError) {
				throw new Error(`${locationPrefix(ctx, node)} links: ${error.message}`)
			}
			throw error
		}

		ctx.replaceNode(node, buildReplacement(model, titleText, list))
	},
}
