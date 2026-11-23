import type { DirectiveAttributeSpec } from '../directives.ts'

// authoring contract from docs/blocks/callout.md; an unknown parameter or value fails instead of
// silently falling back to a default

export const CALLOUT_VARIANTS = ['block', 'line'] as const
export const CALLOUT_TONES = ['default', 'accent', 'alt'] as const
export const CALLOUT_ICONS = [
	'home',
	'image',
	'video',
	'calendar',
	'bookmark',
	'mail',
	'person',
	'text',
] as const

export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number]
export type CalloutTone = (typeof CALLOUT_TONES)[number]
export type CalloutIcon = (typeof CALLOUT_ICONS)[number]

export type CalloutModel = {
	variant: CalloutVariant
	tone: CalloutTone
	icon?: CalloutIcon
	transparent: boolean
}

// carries no location: the remark plugin prefixes the document path and position
export class CalloutValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'CalloutValidationError'
	}
}

export const CALLOUT_ATTRIBUTES = {
	variant: { required: false, values: CALLOUT_VARIANTS },
	tone: { required: false, values: CALLOUT_TONES },
	icon: { required: false, values: CALLOUT_ICONS },
	transparent: { required: false },
} as const satisfies DirectiveAttributeSpec

const ALLOWED_KEYS = Object.keys(CALLOUT_ATTRIBUTES)

// remark-directive maps `.class` to `class`, `#id` to `id` and a bare flag to `''`
export type DirectiveAttributes = Record<string, string | null | undefined>

function enumValue<T extends string>(values: readonly T[], raw: string, key: string): T {
	if ((values as readonly string[]).includes(raw)) return raw as T
	throw new CalloutValidationError(`unknown ${key} "${raw}"; allowed: ${values.join(', ')}`)
}

export function parseCalloutAttributes(
	attributes: DirectiveAttributes | null | undefined,
): CalloutModel {
	const attrs = attributes ?? {}

	for (const key of Object.keys(attrs)) {
		if (key === 'class' || key === 'id') {
			throw new CalloutValidationError(
				'directive shortcut classes and ids (.class / #id) are not allowed',
			)
		}
		if (!Object.hasOwn(CALLOUT_ATTRIBUTES, key)) {
			throw new CalloutValidationError(
				`unknown parameter "${key}"; allowed: ${ALLOWED_KEYS.join(', ')}`,
			)
		}
	}

	const variant =
		attrs.variant == null
			? 'block'
			: enumValue(CALLOUT_ATTRIBUTES.variant.values, attrs.variant, 'variant')
	const tone =
		attrs.tone == null
			? 'default'
			: enumValue(CALLOUT_ATTRIBUTES.tone.values, attrs.tone, 'tone')
	const icon =
		attrs.icon == null
			? undefined
			: enumValue(CALLOUT_ATTRIBUTES.icon.values, attrs.icon, 'icon')

	// only the bare flag is canonical; `transparent="false"` would otherwise read as enabled
	let transparent = false
	if ('transparent' in attrs && attrs.transparent != null) {
		if (attrs.transparent !== '') {
			throw new CalloutValidationError(
				'transparent is a bare flag; do not assign it a value (write `transparent`, not `transparent="true"`)',
			)
		}
		transparent = true
	}

	return icon === undefined
		? { variant, tone, transparent }
		: { variant, tone, icon, transparent }
}
