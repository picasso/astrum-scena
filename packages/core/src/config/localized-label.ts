import { z } from 'astro/zod'

import { type Locale, localeSchema } from './locale-schema.ts'
import { type LocalizedText, localizedTextIn } from './localized-text.ts'

// a config text per catalog locale; that its keys are exactly the active `content.locales` is checked
// at the site level, where the active set is known (`localeCoverageIssues`)
export const localizedLabelSchema = z.partialRecord(localeSchema, z.string().trim().min(1))

export type LocalizedLabel = LocalizedText

export function localizedLabel(text: LocalizedLabel, locale: Locale): string {
	return localizedTextIn(text, locale)
}
