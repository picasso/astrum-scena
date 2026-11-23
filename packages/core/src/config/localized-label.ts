import { z } from 'astro/zod'

import { type Locale, localeSchema } from './locale-schema.ts'

// a config text per catalog locale; that it covers every active `content.locales` entry is checked
// at the site level, where the active set is known
export const localizedLabelSchema = z.partialRecord(localeSchema, z.string().trim().min(1))

export type LocalizedLabel = z.infer<typeof localizedLabelSchema>

export function localizedLabel(text: LocalizedLabel, locale: Locale): string {
	const value = text[locale]
	if (value === undefined) throw new Error(`no "${locale}" text in ${JSON.stringify(text)}`)
	return value
}
