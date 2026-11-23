import { CONTENT_GAPS, type ContentGap } from '../content-gap.ts'
import type { DirectiveAttributeSpec } from '../directives.ts'

// author contract from docs/blocks/links.md; an unknown parameter or value fails the build instead
// of silently falling back to a default, so a typo cannot change rendering unnoticed

export const LINKS_SIZES = ['sm', 'base', 'lg'] as const
export const LINKS_WIDTHS = ['content', 'compact', 'full'] as const
export const LINKS_ALIGNS = ['left', 'center', 'right'] as const
export const LINKS_ICONS = ['none', 'each', 'heading'] as const

export type LinksSize = (typeof LINKS_SIZES)[number]
export type LinksWidth = (typeof LINKS_WIDTHS)[number]
export type LinksAlign = (typeof LINKS_ALIGNS)[number]
export type LinksIcon = (typeof LINKS_ICONS)[number]

export type LinksModel = {
	size: LinksSize
	// the shared spacing scale, not a block-private one
	gap: ContentGap
	width: LinksWidth
	align: LinksAlign
	// picks where the decorative icon goes, not which glyph: each place has a fixed one
	icon: LinksIcon
	notitle: boolean
	// rendered as escaped text, never raw HTML
	title?: string
}

// carries no location; the plugin prefixes the file path and position
export class LinksValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'LinksValidationError'
	}
}

export const LINKS_ATTRIBUTES = {
	title: { required: false },
	notitle: { required: false },
	size: { required: false, values: LINKS_SIZES },
	gap: { required: false, values: CONTENT_GAPS },
	width: { required: false, values: LINKS_WIDTHS },
	align: { required: false, values: LINKS_ALIGNS },
	icon: { required: false, values: LINKS_ICONS },
} as const satisfies DirectiveAttributeSpec

const ALLOWED_KEYS = Object.keys(LINKS_ATTRIBUTES)

// remark-directive maps `.class` to `class`, `#id` to `id` and a bare flag to `''`
export type DirectiveAttributes = Record<string, string | null | undefined>

function enumValue<T extends string>(values: readonly T[], raw: string, key: string): T {
	if ((values as readonly string[]).includes(raw)) return raw as T
	throw new LinksValidationError(`unknown ${key} "${raw}"; allowed: ${values.join(', ')}`)
}

export function parseLinksAttributes(
	attributes: DirectiveAttributes | null | undefined,
): LinksModel {
	const attrs = attributes ?? {}

	for (const key of Object.keys(attrs)) {
		if (key === 'class' || key === 'id') {
			throw new LinksValidationError(
				'directive shortcut classes and ids (.class / #id) are not allowed',
			)
		}
		if (!Object.hasOwn(LINKS_ATTRIBUTES, key)) {
			throw new LinksValidationError(
				`unknown parameter "${key}"; allowed: ${ALLOWED_KEYS.join(', ')}`,
			)
		}
	}

	const size =
		attrs.size == null ? 'sm' : enumValue(LINKS_ATTRIBUTES.size.values, attrs.size, 'size')
	const gap =
		attrs.gap == null ? 'tiny' : enumValue(LINKS_ATTRIBUTES.gap.values, attrs.gap, 'gap')
	const width =
		attrs.width == null
			? 'content'
			: enumValue(LINKS_ATTRIBUTES.width.values, attrs.width, 'width')
	const align =
		attrs.align == null
			? 'right'
			: enumValue(LINKS_ATTRIBUTES.align.values, attrs.align, 'align')
	const icon =
		attrs.icon == null ? 'heading' : enumValue(LINKS_ATTRIBUTES.icon.values, attrs.icon, 'icon')

	// only the bare flag is canonical; `notitle="true"` is rejected
	let notitle = false
	if ('notitle' in attrs && attrs.notitle != null) {
		if (attrs.notitle !== '') {
			throw new LinksValidationError(
				'notitle is a bare flag; do not assign it a value (write `notitle`, not `notitle="true"`)',
			)
		}
		notitle = true
	}

	let title: string | undefined
	if ('title' in attrs && attrs.title != null) {
		if (attrs.title.trim() === '') {
			throw new LinksValidationError('title must be a non-empty string')
		}
		title = attrs.title
	}

	if (title !== undefined && notitle) {
		throw new LinksValidationError(
			'title and notitle are mutually exclusive; use one or the other',
		)
	}

	return title === undefined
		? { size, gap, width, align, icon, notitle }
		: { size, gap, width, align, icon, notitle, title }
}
