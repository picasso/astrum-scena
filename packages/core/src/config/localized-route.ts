import { z } from 'astro/zod'

import type { Locale } from './locale-schema.ts'

export const localizedRouteTemplateSchema = z.string().regex(/^\/\{lang\}\//)

export function isLocalizedRouteTemplate(value: string): boolean {
	return localizedRouteTemplateSchema.safeParse(value).success
}

export function resolveLocalizedRoute(template: string, locale: Locale): string {
	return template.replace('{lang}', locale)
}
