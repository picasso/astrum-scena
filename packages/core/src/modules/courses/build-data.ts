import { type CollectionEntry, getCollection } from 'astro:content'

import type { SiteConfig } from '../../config/site-schema.ts'
import { resolvePublished } from '../../lib/content/build-data.ts'
import {
	collectPublishedDocuments,
	documentCourseStatus,
	documentStaticPaths,
	type PublishedDocument,
	selectListableDocuments,
} from '../../lib/content/documents.ts'
import type { Locale } from '../../lib/content/schemas.ts'
import { isModuleEnabled } from '../registry.ts'
import { COURSES_COLLECTION, COURSES_MODULE_ID } from './manifest.ts'
import type { CourseStatus } from './schema.ts'

// the courses collection as the core's document collections are loaded (lib/content/build-data.ts);
// a site without the module has no such collection, so it reads as empty

export type CourseEntry = CollectionEntry<'courses'>

export type CoursesSiteConfig = Pick<SiteConfig, 'content' | 'modules'>

export async function loadPublishedCourses(
	config: CoursesSiteConfig,
): Promise<PublishedDocument<CourseEntry>[]> {
	if (!isModuleEnabled(config, COURSES_MODULE_ID)) return []
	return collectPublishedDocuments(await getCollection(COURSES_COLLECTION), config.content)
}

// published minus `unlisted` (ADR-0010), for the index only
export async function loadListableCourses(
	config: CoursesSiteConfig,
): Promise<PublishedDocument<CourseEntry>[]> {
	return selectListableDocuments(
		await loadPublishedCourses(config),
		config.content.referenceLocale,
	)
}

// for `/{locale}/courses/{slug}/`
export async function courseStaticPaths(
	config: CoursesSiteConfig,
): Promise<{ params: { slug: string } }[]> {
	return documentStaticPaths(await loadPublishedCourses(config))
}

export async function resolvePublishedCourse(
	slug: string,
	locale: Locale,
	config: CoursesSiteConfig,
): Promise<CourseEntry> {
	return resolvePublished(await loadPublishedCourses(config), slug, locale, 'course')
}

// `courseStatus` is a reference-locale Tier-1 field (ADR-0013), so it is read from the pair's
// reference entry; integrity guarantees it for every course
export async function resolvePublishedCourseStatus(
	slug: string,
	config: CoursesSiteConfig,
): Promise<CourseStatus> {
	const reference = await resolvePublishedCourse(slug, config.content.referenceLocale, config)
	const status = documentCourseStatus(reference.data)
	if (!status) throw new Error(`Course "${slug}" has no courseStatus on the reference locale`)
	return status
}
