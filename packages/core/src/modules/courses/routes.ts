import type { Locale } from '../../config/locale-schema.ts'
import { COURSES_SEGMENT } from './manifest.ts'

// always locale-prefixed with one trailing slash, like the core's routes (lib/content/routes.ts)

export function coursesIndexHref(locale: Locale): string {
	return `/${locale}/${COURSES_SEGMENT}/`
}

export function courseHref(slug: string, locale: Locale): string {
	return `/${locale}/${COURSES_SEGMENT}/${slug}/`
}
