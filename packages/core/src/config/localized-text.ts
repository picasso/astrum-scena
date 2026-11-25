import { z } from 'astro/zod'

import { type Locale, localeCodeSchema } from './locale-schema.ts'

// a site text per locale: its keys are exactly the active `content.locales`, so a one-locale
// site writes one text and a site never carries dead text of a locale it does not build. Reading
// a locale the record lacks is an error, never a fallback to another locale.
export type LocalizedText = Partial<Record<Locale, string>>

export type LocaleIssue = { path: [string]; message: string }

// a key outside the active locales, then an active locale without its text
export function localeCoverageIssues(
	text: Readonly<Record<string, unknown>>,
	locales: readonly Locale[],
): LocaleIssue[] {
	const extra = Object.keys(text)
		.filter((key) => !(locales as readonly string[]).includes(key))
		.map((key): LocaleIssue => ({
			path: [key],
			message: `not one of content.locales [${locales.join(', ')}]`,
		}))
	const missing = locales
		.filter((locale) => text[locale] === undefined)
		.map((locale): LocaleIssue => ({
			path: [locale],
			message: `missing the "${locale}" text required by content.locales`,
		}))
	return [...extra, ...missing]
}

// a content text per active locale; `required` rejects a blank text in any of them (a title), the
// others may be empty (a description not written yet)
export const localizedText = (locales: readonly Locale[], { required = false } = {}) =>
	z.partialRecord(localeCodeSchema, z.string()).superRefine((value, context) => {
		for (const issue of localeCoverageIssues(value, locales))
			context.addIssue({ code: 'custom', ...issue })
		if (required)
			for (const locale of locales)
				if (value[locale]?.trim() === '')
					context.addIssue({
						code: 'custom',
						path: [locale],
						message: `the "${locale}" text must not be empty`,
					})
	})

export function localizedTextIn(text: LocalizedText, locale: Locale): string {
	const value = text[locale]
	if (value === undefined) throw new Error(`no "${locale}" text in ${JSON.stringify(text)}`)
	return value
}
