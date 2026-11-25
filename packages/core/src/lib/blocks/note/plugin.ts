import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { type Locale, LOCALE_FILE_PATTERN } from '../../../config/locale-schema.ts'
import { DIRECTIVES } from '../directives.ts'
import { noteIconHtml } from './icons.ts'
import { type NoteModel, NoteValidationError, parseNoteAttributes } from './schema.ts'
import { type MdastLike, validateNoteChildren } from './validate-children.ts'

// renders `:::note` as a static `<div role="note">` with no island; like callout, the carrier is a
// blockquote node retagged via `data.hName`. The title must stay an mdast `text` node so the
// serializer escapes it: interpolating it into an `html` node would allow stored HTML/JS injection

// the default title is the `note.title` text of the site's dictionary for the document locale
export type NoteDefaultTitle = (locale: Locale) => string | undefined

type NoteLocale = Locale

type NoteDirectiveNode = {
	name?: string
	attributes?: Record<string, string | null | undefined> | null
	position?: { start?: { line?: number; column?: number } | null } | null
	children?: readonly MdastLike[]
}

// satteri's MdastVisitorContext is a transitive dependency that src cannot import; astro.config
// type-checks the full plugin shape when passing it to `mdastPlugins`
type NoteVisitorContext = {
	fileURL?: URL
	replaceNode(node: object, newNode: object): void
}

function locationPrefix(ctx: NoteVisitorContext, node: NoteDirectiveNode): string {
	const file = ctx.fileURL ? fileURLToPath(ctx.fileURL) : '<unknown>'
	const start = node.position?.start
	const line = start?.line ?? 0
	const column = start?.column ?? 0
	return `${file}:${line}:${column}`
}

// the file name is the only locale source the satteri context offers (no frontmatter), so an
// unrecognized locale fails the build instead of silently defaulting to RU
function detectLocale(ctx: NoteVisitorContext): NoteLocale | null {
	const url = ctx.fileURL
	if (!url) return null
	const match = LOCALE_FILE_PATTERN.exec(path.basename(fileURLToPath(url)))
	return (match?.[2] as Locale | undefined) ?? null
}

function buildReplacement(
	model: NoteModel,
	titleText: string | null,
	children: MdastLike[],
): object {
	const content = {
		type: 'blockquote',
		data: { hName: 'div', hProperties: { className: ['note__content'] } },
		children,
	}
	const parts: object[] = []
	if (titleText !== null) {
		parts.push({
			type: 'paragraph',
			data: { hName: 'p', hProperties: { className: ['note__title'] } },
			children: [
				{ type: 'html', value: noteIconHtml(model.icon) },
				{ type: 'text', value: titleText },
			],
		})
	}
	parts.push(content)
	return {
		type: 'blockquote',
		data: {
			hName: 'div',
			hProperties: { className: ['note', `note--${model.tone}`], role: 'note' },
		},
		children: parts,
	}
}

export const noteMdastPlugin = (defaultTitle: NoteDefaultTitle) => ({
	name: 'astrum-scena-note',
	containerDirective(node: NoteDirectiveNode, ctx: NoteVisitorContext): void {
		if (node.name !== DIRECTIVES.note) return

		const children = (node.children ?? []) as MdastLike[]
		let model: NoteModel
		try {
			model = parseNoteAttributes(node.attributes)
			validateNoteChildren(children)
		} catch (error) {
			if (error instanceof NoteValidationError) {
				throw new Error(`${locationPrefix(ctx, node)} note: ${error.message}`)
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
						`${locationPrefix(ctx, node)} note: cannot determine the document locale for the default title; name the file *.<locale>.md(x), or pass an explicit title="…"`,
					)
				}
				const text = defaultTitle(locale)
				if (text === undefined) {
					throw new Error(
						`${locationPrefix(ctx, node)} note: the document locale "${locale}" is not one of content.locales, so it has no default title; pass an explicit title="…"`,
					)
				}
				titleText = text
			}
		}

		ctx.replaceNode(node, buildReplacement(model, titleText, children))
	},
})
