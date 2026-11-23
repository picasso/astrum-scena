import { describe, expect, it } from 'vitest'

import type { Locale } from '../content/schemas.ts'
import { digestTranslationSource } from '../content/translation-freshness.ts'
import {
	buildSiteStatusModel,
	type SiteStatusInput,
	type StatusDocumentEntry,
} from './build-data.ts'

const CLOCK = new Date('2026-09-06T12:34:56.000Z')
const RU_BODY = 'Русское тело.'

type Meta = {
	status?: 'draft' | 'published'
	title?: string
	slug?: string
	courseStatus?: 'archive' | 'current'
	marker?: 'current' | 'missing' | 'mismatch'
	ruBody?: string
	publishedAt?: string
}

// the entry carries no collection (the articles/pages/courses array decides it), so the helper takes
// none
function pair(key: string, meta: Meta = {}): StatusDocumentEntry[] {
	const ruBody = meta.ruBody ?? RU_BODY
	const status = meta.status ?? 'draft'
	const marker =
		meta.marker === 'current'
			? digestTranslationSource(ruBody)
			: meta.marker === 'mismatch'
				? digestTranslationSource('иное тело')
				: undefined
	const base = {
		translationKey: key,
		slug: meta.slug ?? key,
		title: meta.title ?? `Title ${key}`,
		status,
	}
	// tier-1 fields (`courseStatus`, `publishedAt`) live only on the reference (ru) entry (ADR-0013);
	// EN carries only the display title/slug/status and translatedFromDigest
	const tier1 = {
		...(meta.courseStatus ? { courseStatus: meta.courseStatus } : {}),
		...(meta.publishedAt ? { publishedAt: meta.publishedAt } : {}),
	}
	return [
		{ data: { ...base, locale: 'en', ...(marker ? { translatedFromDigest: marker } : {}) } },
		{ data: { ...base, ...tier1, locale: 'ru' }, body: ruBody },
	]
}

function input(overrides: Partial<SiteStatusInput> = {}): SiteStatusInput {
	return {
		articles: [],
		pages: [],
		publishedPhotos: 0,
		publishedAlbums: 0,
		imageRelease: { active: false, assetCount: 0 },
		content: { locales: ['en', 'ru'], referenceLocale: 'ru' },
		generatedAt: CLOCK,
		version: '9.9.9',
		...overrides,
	}
}

describe('buildSiteStatusModel — translation freshness', () => {
	it('marks a matching marker current and a missing/stale marker needs-review', () => {
		const model = buildSiteStatusModel(
			input({
				articles: [
					...pair('current-one', { status: 'published', marker: 'current' }),
					...pair('missing-one', { status: 'published' }),
					...pair('stale-one', { status: 'published', marker: 'mismatch' }),
				],
			}),
		)
		const byStatus = model.translations.rows.map((r) => r.status)
		expect(byStatus).toContain('current')
		expect(byStatus.filter((s) => s === 'needs-review')).toHaveLength(2)
		expect(model.translations.summary).toEqual({
			totalPairs: 3,
			publishedPairs: 3,
			current: 1,
			needsReview: 2,
		})
	})
})

describe('buildSiteStatusModel — locales from config', () => {
	const entry = (locale: 'en' | 'ru', extra: Record<string, unknown> = {}) => ({
		data: {
			translationKey: 'solo',
			locale,
			slug: 'solo',
			title: `Title ${locale}`,
			status: 'published' as const,
			publishedAt: '2020-01-01',
			...extra,
		},
		body: `Body ${locale}.`,
	})

	it.each(['ru', 'en'] as const)('builds rows and links in the single locale %s', (locale) => {
		const model = buildSiteStatusModel(
			input({
				articles: [entry(locale)],
				content: { locales: [locale], referenceLocale: locale },
			}),
		)
		expect(model.translations.rows).toEqual([
			expect.objectContaining({
				title: `Title ${locale}`,
				routeHref: `/${locale}/articles/solo/`,
				status: 'current',
			}),
		])
	})

	it.each([
		{ locales: ['en', 'ru'], referenceLocale: 'ru', translated: ['en'] },
		{ locales: ['en', 'ru'], referenceLocale: 'en', translated: ['ru'] },
		{ locales: ['en', 'ru', 'de'], referenceLocale: 'ru', translated: ['en', 'de'] },
		{ locales: ['ru'], referenceLocale: 'ru', translated: [] },
	])(
		'lists translated locales $translated in config order for reference $referenceLocale',
		({ locales, referenceLocale, translated }) => {
			const model = buildSiteStatusModel(
				input({
					content: {
						locales: locales as [Locale, ...Locale[]],
						referenceLocale: referenceLocale as Locale,
					},
				}),
			)
			expect(model.translations.locales).toEqual(translated)
		},
	)

	it('a document is outdated when any translation is stale, even if another is current', () => {
		const [en, ru] = pair('multi', { status: 'published', marker: 'current' })
		const de = {
			data: {
				...en!.data,
				locale: 'de' as Locale,
				translatedFromDigest: digestTranslationSource('иное тело'),
			},
		}
		const model = buildSiteStatusModel(
			input({
				articles: [en!, ru!, de],
				content: { locales: ['en', 'ru', 'de' as Locale], referenceLocale: 'ru' },
			}),
		)
		expect(model.translations.rows).toEqual([
			expect.objectContaining({ status: 'needs-review', translation: 'outdated' }),
		])
		expect(model.translations.summary.needsReview).toBe(1)
	})

	it('exposes the display locale as the title locale', () => {
		const model = buildSiteStatusModel(
			input({ content: { locales: ['ru', 'en'], referenceLocale: 'ru' } }),
		)
		expect(model.translations.titleLocale).toBe('ru')
	})

	it('computes freshness from the EN reference body against the RU marker', () => {
		const run = (marker: string) =>
			buildSiteStatusModel(
				input({
					articles: [
						entry('en'),
						{ ...entry('ru', { translatedFromDigest: marker }), body: 'Тело.' },
					],
					content: { locales: ['en', 'ru'], referenceLocale: 'en' },
				}),
			).translations.rows[0]!.status
		expect(run(digestTranslationSource('Body en.'))).toBe('current')
		expect(run(digestTranslationSource('Тело.'))).toBe('needs-review')
	})
})

describe('buildSiteStatusModel — publication and route links', () => {
	it('published article rows expose EN title, route link and publishedAt', () => {
		const model = buildSiteStatusModel(
			input({
				articles: [
					...pair('sketchbook', {
						status: 'published',
						slug: 'sketchbook',
						publishedAt: '2017-07-16',
					}),
				],
			}),
		)
		expect(model.translations.rows[0]).toMatchObject({
			section: 'articles',
			published: true,
			title: 'Title sketchbook',
			routeHref: '/en/articles/sketchbook/',
			publishedAt: '2017-07-16',
		})
	})

	it('does not expose publishedAt for drafts or for published pages', () => {
		const model = buildSiteStatusModel(
			input({
				articles: [...pair('draft-a', { status: 'draft', publishedAt: '2019-01-01' })],
				pages: [...pair('a-page', { status: 'published', slug: 'a-page' })],
			}),
		)
		for (const row of model.translations.rows) {
			expect(row.publishedAt).toBeUndefined()
		}
	})

	it('published home page has a title but no document route link', () => {
		const model = buildSiteStatusModel(
			input({ pages: [...pair('home', { status: 'published', slug: 'home' })] }),
		)
		expect(model.translations.rows[0]!.title).toBe('Title home')
		expect(model.translations.rows[0]!.routeHref).toBeUndefined()
	})

	it('privacy page is listed without a route link', () => {
		const model = buildSiteStatusModel(
			input({ pages: [...pair('privacy', { status: 'published', slug: 'privacy' })] }),
		)
		expect(model.translations.rows[0]!.title).toBe('Title privacy')
		expect(model.translations.rows[0]!.routeHref).toBeUndefined()
	})

	it('course page uses the course route', () => {
		const model = buildSiteStatusModel(
			input({ courses: [...pair('courses', { status: 'published', slug: 'courses' })] }),
		)
		expect(model.translations.rows[0]!.routeHref).toBe('/en/courses/courses/')
	})

	it('draft rows carry a title but no route link', () => {
		const model = buildSiteStatusModel(
			input({ articles: [...pair('a-draft', { status: 'draft', title: 'Draft title' })] }),
		)
		const row = model.translations.rows[0]!
		expect(row).toEqual({
			section: 'articles',
			published: false,
			status: 'needs-review',
			translation: 'unverified',
			title: 'Draft title',
		})
		expect(row.routeHref).toBeUndefined()
	})

	// matching marker is Up to date, a changed RU body is Outdated, no marker is Unverified, for
	// published documents too
	it('maps translation freshness to up-to-date / outdated / unverified', () => {
		const model = buildSiteStatusModel(
			input({
				articles: [
					...pair('a', { status: 'published', marker: 'current' }),
					...pair('b', { status: 'published', marker: 'mismatch' }),
					...pair('c', { status: 'published' }),
				],
			}),
		)
		expect(model.translations.rows.map((r) => r.translation)).toEqual([
			'up-to-date',
			'outdated',
			'unverified',
		])
	})
})

describe('buildSiteStatusModel — deterministic ordering', () => {
	it('sorts by collection, published-first, then key regardless of input order', () => {
		const model = buildSiteStatusModel(
			input({
				pages: [
					...pair('p-draft', { status: 'draft' }),
					...pair('p-pub', { status: 'published' }),
				],
				articles: [
					...pair('a-zed', { status: 'published' }),
					...pair('a-alpha', { status: 'published' }),
					...pair('a-draft', { status: 'draft' }),
				],
			}),
		)
		const shape = model.translations.rows.map((r) => `${r.section}:${r.published}`)
		expect(shape).toEqual([
			'articles:true',
			'articles:true',
			'articles:false',
			'pages:true',
			'pages:false',
		])
		// published article titles are alphabetical by key (a-alpha before a-zed)
		const publishedArticleTitles = model.translations.rows
			.filter((r) => r.section === 'articles' && r.published)
			.map((r) => r.title)
		expect(publishedArticleTitles).toEqual(['Title a-alpha', 'Title a-zed'])
	})
})

// courses (the courses module's collection) get their own `/status/` section: row label, count and
// `/courses/` link; ordinary pages stay in `pages`
describe('buildSiteStatusModel — courses section', () => {
	it('puts courses into their own section, count and route', () => {
		const model = buildSiteStatusModel(
			input({
				articles: [],
				pages: [...pair('about', { status: 'published' })],
				courses: [
					...pair('tour', {
						status: 'published',
						courseStatus: 'current',
						publishedAt: '2018-05-09',
					}),
					...pair('draft-tour', { courseStatus: 'archive' }),
				],
			}),
		)
		expect(model.translations.rows.map((r) => `${r.section}:${r.published}`)).toEqual([
			'courses:true',
			'courses:false',
			'pages:true',
		])
		expect(model.translations.rows[0]?.routeHref).toBe('/en/courses/tour/')
		// a course shows its status (Open), not a date, like every course
		expect(model.translations.rows[0]?.courseStatus).toBe('current')
		expect(model.translations.rows[0]?.publishedAt).toBeUndefined()
		expect(model.content.publishedCoursePairs).toBe(1)
		expect(model.content.publishedPagePairs).toBe(1)
		expect(model.translations.summary.publishedPairs).toBe(2)
	})

	it('has no courses count while the module is disabled', () => {
		const model = buildSiteStatusModel(
			input({ pages: [...pair('about', { status: 'published' })] }),
		)
		expect(model.content).not.toHaveProperty('publishedCoursePairs')
		expect(model.translations.rows.map((row) => row.section)).toEqual(['pages'])
	})
})

describe('buildSiteStatusModel — aggregates and injected clock', () => {
	it('passes through published photo/album counts and image release', () => {
		const model = buildSiteStatusModel(
			input({
				articles: [...pair('a', { status: 'published' })],
				pages: [...pair('b', { status: 'draft' })],
				courses: [],
				publishedPhotos: 17,
				publishedAlbums: 4,
				imageRelease: { active: true, assetCount: 17 },
			}),
		)
		expect(model.content).toEqual({
			publishedArticlePairs: 1,
			publishedCoursePairs: 0,
			publishedPagePairs: 0,
			publishedPhotos: 17,
			publishedAlbums: 4,
		})
		expect(model.imageRelease).toEqual({ active: true, assetCount: 17 })
		expect(model.generatedAt).toBe('2026-09-06T12:34:56.000Z')
		expect(model.version).toBe('9.9.9')
	})

	it('reports an inactive zero release without leaking descriptor internals', () => {
		const model = buildSiteStatusModel(
			input({ imageRelease: { active: false, assetCount: 0 } }),
		)
		expect(model.imageRelease).toEqual({ active: false, assetCount: 0 })
		// safe summary only: no configDigest, sha, origin or manifest keys anywhere in the model
		const serialized = JSON.stringify(model)
		expect(serialized).not.toMatch(/configDigest|sha256|[0-9a-f]{64}|https?:\/\//)
	})
})

describe('buildSiteStatusModel — fail-closed pairing', () => {
	it('throws on a missing locale', () => {
		const [en] = pair('lonely', { status: 'published' })
		expect(() => buildSiteStatusModel(input({ articles: [en!] }))).toThrow(
			/missing locale "ru"/,
		)
	})

	it('throws on a duplicate locale', () => {
		const [en] = pair('dupe', { status: 'published' })
		expect(() => buildSiteStatusModel(input({ articles: [en!, en!] }))).toThrow(
			/duplicate locale "en"/,
		)
	})
})
