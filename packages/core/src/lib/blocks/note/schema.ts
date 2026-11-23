import type { DirectiveAttributeSpec } from '../directives.ts'
import { NOTE_CLAIM_PATTERN } from './claim.ts'

// author contract from docs/blocks/note.md; unknown parameters or values fail the build instead of
// falling back to a default, and `claim` is required because a note without it is not
// machine-readable

export const NOTE_TONES = ['outdated', 'info', 'alert'] as const
export const NOTE_ICONS = ['history'] as const

export type NoteTone = (typeof NOTE_TONES)[number]
export type NoteIcon = (typeof NOTE_ICONS)[number]

export type NoteModel = {
	claim: string
	tone: NoteTone
	icon: NoteIcon
	notitle: boolean
	// rendered as escaped text, never raw HTML
	title?: string
}

// carries no location; the plugin prefixes the file path and position
export class NoteValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'NoteValidationError'
	}
}

export const NOTE_ATTRIBUTES = {
	claim: { required: true },
	title: { required: false },
	notitle: { required: false },
	tone: { required: false, values: NOTE_TONES },
	icon: { required: false, values: NOTE_ICONS },
} as const satisfies DirectiveAttributeSpec

const ALLOWED_KEYS = Object.keys(NOTE_ATTRIBUTES)

const REQUIRED_HINTS: Partial<Record<keyof typeof NOTE_ATTRIBUTES, string>> = {
	claim: ' (write claim="findingId:digest8")',
}

// remark-directive maps `.class` to `class`, `#id` to `id` and a bare flag to `''`
export type DirectiveAttributes = Record<string, string | null | undefined>

function enumValue<T extends string>(values: readonly T[], raw: string, key: string): T {
	if ((values as readonly string[]).includes(raw)) return raw as T
	throw new NoteValidationError(`unknown ${key} "${raw}"; allowed: ${values.join(', ')}`)
}

export function parseNoteAttributes(attributes: DirectiveAttributes | null | undefined): NoteModel {
	const attrs = attributes ?? {}

	for (const key of Object.keys(attrs)) {
		if (key === 'class' || key === 'id') {
			throw new NoteValidationError(
				'directive shortcut classes and ids (.class / #id) are not allowed',
			)
		}
		if (!Object.hasOwn(NOTE_ATTRIBUTES, key)) {
			throw new NoteValidationError(
				`unknown parameter "${key}"; allowed: ${ALLOWED_KEYS.join(', ')}`,
			)
		}
	}

	for (const [key, { required }] of Object.entries(NOTE_ATTRIBUTES) as [
		keyof typeof NOTE_ATTRIBUTES,
		{ required: boolean },
	][]) {
		if (required && (attrs[key] == null || attrs[key] === ''))
			throw new NoteValidationError(`${key} is required${REQUIRED_HINTS[key] ?? ''}`)
	}

	const claim = attrs.claim!
	if (!NOTE_CLAIM_PATTERN.test(claim)) {
		throw new NoteValidationError(
			`malformed claim "${claim}"; expected "findingId:digest8" with 8 lowercase hex`,
		)
	}

	const tone =
		attrs.tone == null ? 'outdated' : enumValue(NOTE_ATTRIBUTES.tone.values, attrs.tone, 'tone')
	const icon =
		attrs.icon == null ? 'history' : enumValue(NOTE_ATTRIBUTES.icon.values, attrs.icon, 'icon')

	// only the bare flag is canonical; `notitle="true"` is rejected
	let notitle = false
	if ('notitle' in attrs && attrs.notitle != null) {
		if (attrs.notitle !== '') {
			throw new NoteValidationError(
				'notitle is a bare flag; do not assign it a value (write `notitle`, not `notitle="true"`)',
			)
		}
		notitle = true
	}

	let title: string | undefined
	if ('title' in attrs && attrs.title != null) {
		if (attrs.title.trim() === '') {
			throw new NoteValidationError('title must be a non-empty string')
		}
		title = attrs.title
	}

	if (title !== undefined && notitle) {
		throw new NoteValidationError(
			'title and notitle are mutually exclusive; use one or the other',
		)
	}

	return title === undefined
		? { claim, tone, icon, notitle }
		: { claim, tone, icon, notitle, title }
}
