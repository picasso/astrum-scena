import { describe, expect, it } from 'vitest'

import {
	collectPublishedDocuments,
	type DocumentEntry,
	type DocumentLocales,
} from '../../lib/content/documents.ts'
import type { Locale } from '../../lib/content/schemas.ts'
import { orderCourses } from './documents.ts'
import type { CourseData, CourseStatus } from './schema.ts'

// `courseStatus` is set on the reference entry of each pair only (ADR-0013)
const REFERENCE: Locale = 'ru'
const CONTENT: DocumentLocales = { locales: ['en', 'ru'], referenceLocale: REFERENCE }

const course = (
	translationKey: string,
	locale: Locale,
	courseStatus?: CourseStatus,
): DocumentEntry<CourseData> => ({
	id: `${translationKey}-${locale}`,
	data: {
		translationKey,
		locale,
		slug: translationKey,
		title: `${translationKey} ${locale}`,
		status: 'published',
		...(courseStatus ? { courseStatus } : {}),
	},
})

const coursePair = (translationKey: string, courseStatus: CourseStatus) => [
	course(translationKey, 'en'),
	course(translationKey, REFERENCE, courseStatus),
]

describe('orderCourses', () => {
	it('orders courses and lifts current ones first when asked', () => {
		const documents = collectPublishedDocuments(
			[
				...coursePair('alpha', 'archive'),
				...coursePair('beta', 'current'),
				...coursePair('gamma', 'archive'),
				...coursePair('delta', 'current'),
			],
			CONTENT,
		)
		const slugs = (currentFirst: 'on' | 'off') =>
			orderCourses(documents, { order: 'title', currentFirst }, 'en', REFERENCE).map(
				(item) => item.slug,
			)
		expect(slugs('off')).toEqual(['alpha', 'beta', 'delta', 'gamma'])
		expect(slugs('on')).toEqual(['beta', 'delta', 'alpha', 'gamma'])
	})
})
