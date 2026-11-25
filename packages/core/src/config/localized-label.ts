import { z } from 'astro/zod'

import { type Locale, localeCodeSchema } from './locale-schema.ts'
import { type LocalizedText, localizedTextIn } from './localized-text.ts'

// a config text per locale code; that its keys are exactly the active `content.locales` is checked
// at the site level, where the active set is known (`localeCoverageIssues`)
export const localizedLabelSchema = z.partialRecord(localeCodeSchema, z.string().trim().min(1))

export type LocalizedLabel = LocalizedText

export function localizedLabel(text: LocalizedLabel, locale: Locale): string {
	return localizedTextIn(text, locale)
}
