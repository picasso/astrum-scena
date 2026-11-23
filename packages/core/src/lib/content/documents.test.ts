import { describe, expect, it } from 'vitest'

import type { CourseData } from '../../modules/courses/schema.ts'
import {
	collectPublishedDocuments,
	documentCourseStatus,
	type DocumentEntry,
	type DocumentLocales,
	documentStaticPaths,
	findPublishedDocument,
	orderByPublishedAt,
	orderDocuments,
	selectListableDocuments,
} from './documents.ts'
import type { ArticleData, Locale } from './schemas.ts'

// reference-locale fields (ADR-0013) are set on the ru entry of each pair only
const REFERENCE: Locale = 'ru'
const CONTENT: DocumentLocales = { locales: ['en', 'ru'], referenceLocale: REFERENCE }

type ArticleOverrides = Partial<
	Pick<ArticleData, 'slug' | 'status' | 'publishedAt' | 'title' | 'unlisted'>
>
// a page or, with `courseStatus`, a course: both share the localized document shape
type PageOverrides = Partial<
	Pick<CourseData, 'slug' | 'status' | 'courseStatus' | 'title' | 'unlisted'>
>

function article(
	translationKey: string,
	locale: Locale,
	overrides: ArticleOverrides = {},
): DocumentEntry<ArticleData> {
	return {
		id: `${translationKey}-${locale}`,
		data: {
			translationKey,
			locale,
			slug: translationKey,
			title: `${translationKey} ${locale}`,
			status: 'published',
			...overrides,
		},
	}
}

function page(
	translationKey: string,
	locale: Locale,
	overrides: PageOverrides = {},
): DocumentEntry<CourseData> {
	return {
		id: `${translationKey}-${locale}`,
		data: {
			translationKey,
			locale,
			slug: translationKey,
			title: `${translationKey} ${locale}`,
			status: 'published',
			...overrides,
		},
	}
}

function articlePair(
	translationKey: string,
	overrides: ArticleOverrides = {},
): DocumentEntry<ArticleData>[] {
	const { publishedAt = '2020-01-01', unlisted, ...shared } = overrides
	return [
		article(translationKey, 'en', shared),
		article(translationKey, 'ru', {
			...shared,
			...(publishedAt ? { publishedAt } : {}),
			...(unlisted ? { unlisted } : {}),
		}),
	]
}

function pagePair(
	translationKey: string,
	overrides: PageOverrides = {},
): DocumentEntry<CourseData>[] {
	const { courseStatus, unlisted, ...shared } = overrides
	return [
		page(translationKey, 'en', shared),
		page(translationKey, 'ru', {
			...shared,
			...(courseStatus ? { courseStatus } : {}),
			...(unlisted ? { unlisted } : {}),
		}),
	]
}

describe('published document collection', () => {
	it('keeps only complete published pairs and exposes both locales', () => {
		const documents = collectPublishedDocuments(
			[...articlePair('glass-and-light'), ...articlePair('camera-bag', { status: 'draft' })],
			CONTENT,
		)
		expect(documents.map((document) => document.slug)).toEqual(['glass-and-light'])
		expect(documents[0]?.byLocale.en.id).toBe('glass-and-light-en')
		expect(documents[0]?.byLocale.ru.id).toBe('glass-and-light-ru')
	})

	// filtering each entry would drop the en file, which has no reference-only field (ADR-0013)
	it('groups both locales when a reference-only field selects the family', () => {
		const documents = collectPublishedDocuments(
			[...pagePair('paper-lanterns', { courseStatus: 'current' }), ...pagePair('about')],
			CONTENT,
			(data) => 'courseStatus' in data && data.courseStatus !== undefined,
		)
		expect(documents.map((entry) => entry.slug)).toEqual(['paper-lanterns'])
		expect(documents[0]?.byLocale.en.id).toBe('paper-lanterns-en')
		expect(documents[0]?.byLocale.ru.id).toBe('paper-lanterns-ru')
	})

	it('collects a one-locale site from its single active locale', () => {
		const ruOnly = collectPublishedDocuments(
			[article('solo', 'ru', { publishedAt: '2020-01-01' })],
			{
				locales: ['ru'],
				referenceLocale: 'ru',
			},
		)
		expect(ruOnly.map((document) => Object.keys(document.byLocale))).toEqual([['ru']])
		const enOnly = collectPublishedDocuments([page('about', 'en')], {
			locales: ['en'],
			referenceLocale: 'en',
		})
		expect(enOnly[0]?.byLocale.en.id).toBe('about-en')
	})

	it('rejects a published document that exists in one locale only', () => {
		expect(() => collectPublishedDocuments([article('solo', 'en')], CONTENT)).toThrow(
			/missing locale "ru"/,
		)
	})

	it('rejects a pair that is published in one locale and draft in the other', () => {
		expect(() =>
			collectPublishedDocuments(
				[article('half', 'en'), article('half', 'ru', { status: 'draft' })],
				CONTENT,
			),
		).toThrow(/published in one locale but "draft"/)
	})

	it('rejects duplicate locales and locale-specific slugs', () => {
		expect(() =>
			collectPublishedDocuments([article('twice', 'en'), article('twice', 'en')], CONTENT),
		).toThrow(/duplicate locale "en"/)
		expect(() =>
			collectPublishedDocuments(
				[article('drift', 'en'), article('drift', 'ru', { slug: 'drift-ru' })],
				CONTENT,
			),
		).toThrow(/locale-specific slugs/)
	})

	it('rejects two published documents that would claim the same route slug', () => {
		expect(() =>
			collectPublishedDocuments(
				[...articlePair('first'), ...articlePair('second', { slug: 'first' })],
				CONTENT,
			),
		).toThrow(/share the slug "first"/)
	})

	it('ignores drafts when checking slug collisions', () => {
		expect(
			collectPublishedDocuments(
				[
					...articlePair('first'),
					...articlePair('shadow', { slug: 'first', status: 'draft' }),
				],
				CONTENT,
			).map((document) => document.translationKey),
		).toEqual(['first'])
	})
})

describe('listable document selection', () => {
	it('drops documents marked unlisted on the reference locale', () => {
		const documents = collectPublishedDocuments(
			[
				...articlePair('visible', { publishedAt: '2021-01-01' }),
				...articlePair('hidden', { publishedAt: '2022-01-01', unlisted: true }),
			],
			CONTENT,
		)
		expect(
			selectListableDocuments(documents, REFERENCE).map((document) => document.slug),
		).toEqual(['visible'])
	})

	it('keeps unlisted documents in the published set that backs routes', () => {
		const documents = collectPublishedDocuments(
			[...articlePair('hidden', { unlisted: true })],
			CONTENT,
		)
		expect(documents.map((document) => document.slug)).toEqual(['hidden'])
		expect(selectListableDocuments(documents, REFERENCE)).toEqual([])
	})
})

describe('published document ordering and lookup', () => {
	it('orders articles by publishedAt descending with a deterministic slug tie-break', () => {
		const documents = orderByPublishedAt(
			collectPublishedDocuments(
				[
					...articlePair('older', { publishedAt: '2017-07-16' }),
					...articlePair('newer', { publishedAt: '2021-03-01' }),
					...articlePair('same-day-b', { publishedAt: '2021-03-01' }),
				],
				CONTENT,
			),
			REFERENCE,
		)
		expect(documents.map((document) => document.slug)).toEqual(['newer', 'same-day-b', 'older'])
	})

	// `title` follows the current locale's title, so the EN and RU orders legitimately differ
	it('applies the configured index order per locale', () => {
		const documents = collectPublishedDocuments(
			[
				article('beta', 'en', { title: 'Beta' }),
				article('beta', 'ru', { title: 'Абрикос', publishedAt: '2021-03-01' }),
				article('alpha', 'en', { title: 'Alpha' }),
				article('alpha', 'ru', { title: 'Ястреб', publishedAt: '2017-07-16' }),
			],
			CONTENT,
		)
		expect(
			orderDocuments(documents, 'newest', 'en', REFERENCE).map((item) => item.slug),
		).toEqual(['beta', 'alpha'])
		expect(
			orderDocuments(documents, 'title', 'en', REFERENCE).map((item) => item.slug),
		).toEqual(['alpha', 'beta'])
		expect(
			orderDocuments(documents, 'title', 'ru', REFERENCE).map((item) => item.slug),
		).toEqual(['beta', 'alpha'])
	})

	it('resolves a published slug and stays closed for drafts and forged slugs', () => {
		const documents = collectPublishedDocuments(
			[...articlePair('glass-and-light'), ...articlePair('camera-bag', { status: 'draft' })],
			CONTENT,
		)
		expect(findPublishedDocument(documents, 'glass-and-light')?.translationKey).toBe(
			'glass-and-light',
		)
		expect(findPublishedDocument(documents, 'camera-bag')).toBeUndefined()
		expect(findPublishedDocument(documents, 'forged')).toBeUndefined()
	})

	it('emits static paths only for published slugs', () => {
		const documents = collectPublishedDocuments(
			[...pagePair('paper-lanterns'), ...pagePair('secret-course', { status: 'draft' })],
			CONTENT,
		)
		expect(documentStaticPaths(documents)).toEqual([{ params: { slug: 'paper-lanterns' } }])
	})
})

describe('course status reader', () => {
	it('reads courseStatus from the entry and is undefined for articles and generic pages', () => {
		const [en, ru] = pagePair('paper-lanterns', { courseStatus: 'current' })
		expect(documentCourseStatus(ru!.data)).toBe('current')
		expect(documentCourseStatus(en!.data)).toBeUndefined()
		expect(documentCourseStatus(pagePair('about')[1]!.data)).toBeUndefined()
		expect(documentCourseStatus(article('post', REFERENCE).data)).toBeUndefined()
	})
})
