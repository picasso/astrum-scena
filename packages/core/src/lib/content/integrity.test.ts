import { describe, expect, it } from 'vitest'

import { validateContentSnapshot } from './integrity'
import type { ContentSnapshot } from './model'
import type { Locale } from './schemas'

// reference locale of these tests (ADR-0013): Tier-1 document fields live only on the ru entry
const REFERENCE: Locale = 'ru'
const validate = (value: ContentSnapshot) => validateContentSnapshot(value, REFERENCE, ['en', 'ru'])

function snapshot(): ContentSnapshot {
	return {
		albums: [
			{
				id: 'album',
				data: {
					category: 'series',
					title: { en: 'Album', ru: 'Альбом' },
					description: { en: '', ru: '' },
					status: 'draft',
					coverId: 'photo',
					photoIds: ['photo'],
				},
			},
		],
		photos: [
			{
				id: 'photo',
				data: {
					title: { en: 'Photo', ru: 'Фото' },
					status: 'draft',
					favorite: false,
					tags: [],
				},
			},
		],
		articles: [],
		pages: [],
		courses: [],
		categories: [
			{ id: 'series', label: { en: 'Series', ru: 'Серии' } },
			{ id: 'places', label: { en: 'Places', ru: 'Места' } },
		],
		places: [],
		tags: [],
	}
}

describe('content integrity', () => {
	it('accepts a valid draft snapshot', () => {
		expect(validate(snapshot())).toEqual({ success: true, errors: [] })
	})

	it('accepts a published pair with reference-only Tier-1 fields', () => {
		const value = snapshot()
		value.articles = [
			{
				id: 'article-en',
				data: {
					translationKey: 'article',
					locale: 'en',
					slug: 'article',
					title: 'Article',
					status: 'published',
				},
			},
			{
				id: 'article-ru',
				data: {
					translationKey: 'article',
					locale: 'ru',
					slug: 'article',
					title: 'Статья',
					status: 'published',
					publishedAt: '2026-01-01',
					legacyId: 'wp:article:1',
				},
			},
		]
		expect(validate(value)).toEqual({ success: true, errors: [] })
	})

	it.each([
		[
			'unknown-reference',
			(value: ContentSnapshot) => {
				value.albums[0]!.data.photoIds = ['lost']
			},
		],
		[
			'dynamic-album',
			(value: ContentSnapshot) => {
				value.albums[0]!.id = 'recent-works'
			},
		],
		[
			'place-cycle',
			(value: ContentSnapshot) =>
				(value.places = [
					{
						id: 'one',
						name: { en: 'One', ru: 'Один' },
						kind: 'country',
						parentId: 'two',
					},
					{
						id: 'two',
						name: { en: 'Two', ru: 'Два' },
						kind: 'region',
						parentId: 'one',
					},
				]),
		],
	] as const)('reports %s with entity context', (code, mutate) => {
		const value = snapshot()
		mutate(value)
		const result = validate(value)
		expect(result.success).toBe(false)
		if (!result.success) expect(result.errors.some((error) => error.code === code)).toBe(true)
	})

	const articleEntry = (locale: Locale, extra: Record<string, unknown> = {}) => ({
		id: `article-${locale}`,
		data: {
			translationKey: 'article',
			locale,
			slug: 'article',
			title: `Article ${locale}`,
			status: 'published' as const,
			...extra,
		},
	})
	const codes = (result: ReturnType<typeof validate>) =>
		result.success ? [] : result.errors.map((error) => error.code)

	it('allows translatedFromDigest only off the configured reference locale', () => {
		const marker = { translatedFromDigest: 'a'.repeat(64) }
		const value = snapshot()
		value.articles = [
			articleEntry('en', marker),
			articleEntry('ru', { publishedAt: '2026-01-01' }),
		]
		expect(validate(value)).toEqual({ success: true, errors: [] })
		value.articles = [
			articleEntry('en'),
			articleEntry('ru', { publishedAt: '2026-01-01', ...marker }),
		]
		expect(codes(validate(value))).toEqual(['reference-marker'])
		value.articles = [
			articleEntry('en', { publishedAt: '2026-01-01', ...marker }),
			articleEntry('ru'),
		]
		expect(codes(validateContentSnapshot(value, 'en', ['en', 'ru']))).toEqual([
			'reference-marker',
		])
	})

	it('validates a one-locale site against its active locale', () => {
		const ruOnly = snapshot()
		ruOnly.articles = [articleEntry('ru', { publishedAt: '2026-01-01' })]
		expect(validateContentSnapshot(ruOnly, 'ru', ['ru'])).toEqual({ success: true, errors: [] })
		expect(codes(validate(ruOnly))).toEqual(['locale-gap'])

		const enOnly = snapshot()
		enOnly.articles = [articleEntry('en', { publishedAt: '2026-01-01' })]
		expect(validateContentSnapshot(enOnly, 'en', ['en'])).toEqual({ success: true, errors: [] })

		ruOnly.articles.push(articleEntry('en'))
		expect(codes(validateContentSnapshot(ruOnly, 'ru', ['ru']))).toEqual(['inactive-locale'])
	})

	it('rejects locale gaps and route collisions', () => {
		const value = snapshot()
		value.articles = [
			{
				id: 'first-en',
				data: {
					translationKey: 'first',
					locale: 'en',
					slug: 'same',
					title: 'First',
					status: 'published',
				},
			},
			{
				id: 'second-en',
				data: {
					translationKey: 'second',
					locale: 'en',
					slug: 'same',
					title: 'Second',
					status: 'draft',
				},
			},
		]
		const result = validate(value)
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.errors.map((error) => error.code)).toEqual(
				expect.arrayContaining(['locale-gap', 'route-collision']),
			)
		}
	})

	// a Tier-1 field on the non-reference (en) locale is `nonreference-field`, not `locale-mismatch`,
	// since Tier-1 fields are no longer compared; slug/status must still match (ADR-0013)
	it('rejects Tier-1 fields present on the non-reference locale', () => {
		const value = snapshot()
		value.articles = [
			{
				id: 'article-en',
				data: {
					translationKey: 'article',
					locale: 'en',
					slug: 'article',
					title: 'Article',
					status: 'published',
					publishedAt: '2026-01-01',
					legacyId: 'wp:article:1',
				},
			},
			{
				id: 'article-ru',
				data: {
					translationKey: 'article',
					locale: 'ru',
					slug: 'article',
					title: 'Статья',
					status: 'published',
					publishedAt: '2026-01-01',
					legacyId: 'wp:article:1',
				},
			},
		]
		const result = validate(value)
		expect(result.success).toBe(false)
		if (!result.success) {
			const codes = result.errors.map((error) => error.code)
			expect(codes).toEqual(
				expect.arrayContaining(['nonreference-field', 'nonreference-field']),
			)
			expect(codes).not.toContain('locale-mismatch')
			// the en entry is the one flagged as carrying the forbidden fields
			expect(
				result.errors.every(
					(error) =>
						error.code !== 'nonreference-field' || error.entityId === 'article-en',
				),
			).toBe(true)
		}
	})

	// `unlisted` is a reference-locale Tier-1 field (ADR-0010) and is rejected on en by the same
	// `nonreference-field` code
	it('accepts reference-only unlisted and rejects it on the non-reference locale', () => {
		const reference = {
			id: 'article-ru',
			data: {
				translationKey: 'article',
				locale: 'ru' as const,
				slug: 'article',
				title: 'Статья',
				status: 'published' as const,
				publishedAt: '2026-01-01',
				unlisted: true,
			},
		}
		const listable = snapshot()
		listable.articles = [
			{
				id: 'article-en',
				data: {
					translationKey: 'article',
					locale: 'en',
					slug: 'article',
					title: 'Article',
					status: 'published',
				},
			},
			reference,
		]
		expect(validate(listable)).toEqual({ success: true, errors: [] })

		const leaked = snapshot()
		leaked.articles = [
			{
				id: 'article-en',
				data: {
					translationKey: 'article',
					locale: 'en',
					slug: 'article',
					title: 'Article',
					status: 'published',
					unlisted: true,
				},
			},
			reference,
		]
		const result = validate(leaked)
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.errors).toContainEqual(
				expect.objectContaining({ code: 'nonreference-field', entityId: 'article-en' }),
			)
		}
	})

	it('still reports a locale mismatch when slug or status disagree', () => {
		const value = snapshot()
		value.articles = [
			{
				id: 'article-en',
				data: {
					translationKey: 'article',
					locale: 'en',
					slug: 'article-en-route',
					title: 'Article',
					status: 'draft',
				},
			},
			{
				id: 'article-ru',
				data: {
					translationKey: 'article',
					locale: 'ru',
					slug: 'article-ru-route',
					title: 'Статья',
					status: 'draft',
				},
			},
		]
		const result = validate(value)
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.errors).toEqual([
				expect.objectContaining({ code: 'locale-mismatch', entityId: 'article-ru' }),
			])
		}
	})

	// courses are the courses module's collection; `courseStatus` is a Tier-1 field of it, rejected on
	// the non-reference locale
	describe('course status', () => {
		function coursePair(ru: Record<string, unknown>, en: Record<string, unknown> = {}) {
			const value = snapshot()
			value.courses = [
				{
					id: 'course-en',
					data: {
						translationKey: 'course',
						locale: 'en',
						slug: 'course',
						title: 'Course',
						status: 'draft',
						...en,
					},
				},
				{
					id: 'course-ru',
					data: {
						translationKey: 'course',
						locale: 'ru',
						slug: 'course',
						title: 'Курс',
						status: 'draft',
						...ru,
					},
				},
			]
			return value
		}

		it.each(['archive', 'current'] as const)(
			'accepts a course with courseStatus %s',
			(status) => {
				expect(validate(coursePair({ courseStatus: status }))).toEqual({
					success: true,
					errors: [],
				})
			},
		)

		it('rejects a course without courseStatus, even as a draft', () => {
			const result = validate(coursePair({}))
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.errors).toEqual([
					expect.objectContaining({
						code: 'missing-course-status',
						entityId: 'course-ru',
						path: 'courses.course-ru.courseStatus',
					}),
				])
			}
		})

		it('rejects courseStatus on the non-reference locale', () => {
			const result = validate(
				coursePair({ courseStatus: 'archive' }, { courseStatus: 'archive' }),
			)
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.errors).toEqual([
					expect.objectContaining({
						code: 'nonreference-field',
						entityId: 'course-en',
						path: 'courses.course-en.courseStatus',
					}),
				])
			}
		})

		// a course and a page live under different segments, so one slug may serve both
		it('lets a course share a slug with a page', () => {
			const value = coursePair({ courseStatus: 'current' })
			value.pages = value.courses.map(({ id, data }) => {
				const { courseStatus: _courseStatus, ...page } = data
				void _courseStatus
				return { id, data: page }
			})
			expect(validate(value)).toEqual({ success: true, errors: [] })
		})
	})

	// published ⇒ publishedAt is checked on the reference (ru) entry (ADR-0013)
	it('rejects a published article missing publishedAt on the reference locale', () => {
		const value = snapshot()
		value.articles = [
			{
				id: 'article-en',
				data: {
					translationKey: 'article',
					locale: 'en',
					slug: 'article',
					title: 'Article',
					status: 'published',
				},
			},
			{
				id: 'article-ru',
				data: {
					translationKey: 'article',
					locale: 'ru',
					slug: 'article',
					title: 'Статья',
					status: 'published',
				},
			},
		]
		const result = validate(value)
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.errors).toEqual([
				expect.objectContaining({ code: 'missing-published-at', entityId: 'article-ru' }),
			])
		}
	})

	it('uses translationKey and locale for document IDs, never the shared route slug', () => {
		const value = snapshot()
		value.pages = [
			{
				id: 'about-page-en',
				data: {
					translationKey: 'about-page',
					locale: 'en',
					slug: 'about',
					title: 'About',
					status: 'draft',
				},
			},
			{
				id: 'about-page-ru',
				data: {
					translationKey: 'about-page',
					locale: 'ru',
					slug: 'about',
					title: 'Обо мне',
					status: 'draft',
				},
			},
		]
		expect(validate(value)).toEqual({ success: true, errors: [] })
	})

	it.each([
		[
			'duplicate-reference',
			(value: ContentSnapshot) => {
				value.albums[0]!.data.photoIds = ['photo', 'photo']
			},
		],
		[
			'published-reference',
			(value: ContentSnapshot) => {
				value.albums[0]!.data.status = 'published'
			},
		],
		[
			'filename-mismatch',
			(value: ContentSnapshot) => {
				value.photos[0]!.id = 'Not-Kebab'
			},
		],
	] as const)('covers the %s integrity branch', (code, mutate) => {
		const value = snapshot()
		mutate(value)
		const result = validate(value)
		expect(result.success).toBe(false)
		if (!result.success) expect(result.errors.some((error) => error.code === code)).toBe(true)
	})

	it('caps diagnostics while preserving the total error count', () => {
		const value = snapshot()
		value.photos[0]!.data.tags = Array.from({ length: 120 }, (_, index) => `missing-${index}`)
		const result = validate(value)
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.errors).toHaveLength(100)
			expect(result.totalErrorCount).toBe(120)
		}
	})
})
