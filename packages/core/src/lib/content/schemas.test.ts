import { describe, expect, it } from 'vitest'

import { ALBUM_LAYOUTS } from '../../config/variants.ts'
import {
	albumSchemaFor,
	articleSchema,
	categoriesConfigSchemaFor,
	featuredConfigSchemaFor,
	featuredItemSchemaFor,
	isoDateSchema,
	mediaDescriptorSchema,
	pageSchema,
	partialCapturedAtSchema,
	photoSchemaFor,
	placesConfigSchemaFor,
	tagsConfigSchemaFor,
} from './schemas'

const albumSchema = albumSchemaFor(['en', 'ru'])
const featuredItemSchema = featuredItemSchemaFor(['en', 'ru'])
const photoSchema = photoSchemaFor(['en', 'ru'])

const localized = { en: 'Title', ru: 'Название' }

const issuesOf = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
	result.error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)

describe('localized data shapes from content.locales', () => {
	const album = {
		category: 'series',
		description: { en: '' },
		status: 'draft',
		coverId: 'one',
		photoIds: ['one'],
	}

	it('accepts a text per locale of a two-locale and of a one-locale site', () => {
		expect(photoSchema.parse({ title: localized, status: 'draft' }).title).toEqual(localized)
		expect(
			photoSchemaFor(['en']).parse({ title: { en: 'Title' }, status: 'draft' }).title,
		).toEqual({ en: 'Title' })
		expect(albumSchemaFor(['en']).safeParse({ ...album, title: { en: 'Album' } }).success).toBe(
			true,
		)
	})

	it('rejects a locale outside content.locales, naming the field and the locale', () => {
		const result = photoSchemaFor(['en']).safeParse({ title: localized, status: 'draft' })
		expect(issuesOf(result)).toEqual(['title.ru: not one of content.locales [en]'])
	})

	it('rejects an active locale without its text, naming the field and the locale', () => {
		const result = photoSchema.safeParse({
			title: localized,
			alt: { en: 'Alt' },
			status: 'draft',
		})
		expect(issuesOf(result)).toEqual([
			'alt.ru: missing the "ru" text required by content.locales',
		])
	})

	it('keeps an optional field optional on a one-locale site', () => {
		const photo = photoSchemaFor(['en']).parse({ title: { en: 'Title' }, status: 'draft' })
		expect(photo.alt).toBeUndefined()
	})

	it('rejects a blank title in any active locale and allows an empty description', () => {
		const result = photoSchema.safeParse({ title: { en: 'Title', ru: ' ' }, status: 'draft' })
		expect(issuesOf(result)).toEqual(['title.ru: the "ru" text must not be empty'])
		expect(albumSchemaFor(['en']).safeParse({ ...album, title: { en: '' } }).success).toBe(
			false,
		)
		expect(
			albumSchemaFor(['en']).parse({ ...album, title: { en: 'Album' } }).description,
		).toEqual({ en: '' })
	})

	it('builds the taxonomy and featured files at version 2 from the locales', () => {
		const label = { en: 'Series' }
		expect(
			categoriesConfigSchemaFor(['en']).safeParse({
				schemaVersion: 2,
				categories: [{ id: 'series', label }],
			}).success,
		).toBe(true)
		expect(
			issuesOf(
				placesConfigSchemaFor(['en']).safeParse({
					schemaVersion: 2,
					places: [
						{ id: 'harbor', name: { en: 'Harbor', ru: 'Гавань' }, kind: 'locality' },
					],
				}),
			),
		).toEqual(['places.0.name.ru: not one of content.locales [en]'])
		expect(tagsConfigSchemaFor(['en']).safeParse({ schemaVersion: 1, tags: [] }).success).toBe(
			false,
		)
		const slide = {
			id: 'slide',
			align: 'left',
			target: { collection: 'albums', slug: 'album', linkKind: 'album' },
			copySource: 'inline',
			copy: { title: { en: 'Title' }, description: { en: '' } },
			mediaSource: 'target',
		}
		expect(
			featuredConfigSchemaFor(['en']).safeParse({ schemaVersion: 2, slides: [slide] })
				.success,
		).toBe(true)
		expect(
			issuesOf(
				featuredConfigSchemaFor(['en', 'ru']).safeParse({
					schemaVersion: 2,
					slides: [slide],
				}),
			),
		).toEqual([
			'slides.0.copy.title.ru: missing the "ru" text required by content.locales',
			'slides.0.copy.description.ru: missing the "ru" text required by content.locales',
		])
	})
})

describe('content schemas', () => {
	it('applies conservative photo defaults', () => {
		const result = photoSchema.parse({ title: localized, status: 'draft' })
		expect(result).toMatchObject({ favorite: false, tags: [] })
	})

	it('requires publishedAt for a published photo', () => {
		const input = { title: localized, status: 'published', publishedAt: '2026-07-26' }
		delete (input as { publishedAt?: string }).publishedAt
		expect(() => photoSchema.parse(input)).toThrow()
	})

	it('allows a published photo without colorMode', () => {
		expect(() =>
			photoSchema.parse({ title: localized, status: 'published', publishedAt: '2026-07-26' }),
		).not.toThrow()
	})

	it('rejects persisted derived fields', () => {
		expect(() =>
			photoSchema.parse({ title: localized, status: 'draft', year: 2026, albumIds: [] }),
		).toThrow()
	})

	it('requires album cover membership and unique photo order', () => {
		const base = {
			category: 'series',
			title: localized,
			description: { en: '', ru: '' },
			status: 'draft',
			coverId: 'one',
			photoIds: ['two'],
		}
		expect(() => albumSchema.parse(base)).toThrow()
		expect(() => albumSchema.parse({ ...base, photoIds: ['one', 'one'] })).toThrow()
	})

	it('accepts an optional per-album layout from the implemented modes only', () => {
		const base = {
			category: 'series',
			title: localized,
			description: { en: '', ru: '' },
			status: 'draft',
			coverId: 'one',
			photoIds: ['one'],
		}
		expect(albumSchema.parse(base).layout).toBeUndefined()
		for (const layout of ALBUM_LAYOUTS) {
			expect(albumSchema.parse({ ...base, layout }).layout).toBe(layout)
		}
		const result = albumSchema.safeParse({ ...base, layout: 'carousel' })
		expect(result.success).toBe(false)
		expect(result.error?.issues[0]?.path).toEqual(['layout'])
	})

	it('accepts an optional localized album excerpt and rejects a partial one', () => {
		const base = {
			category: 'series',
			title: localized,
			description: { en: '', ru: '' },
			status: 'draft',
			coverId: 'one',
			photoIds: ['one'],
		}
		expect(albumSchema.parse(base).excerpt).toBeUndefined()
		expect(albumSchema.parse({ ...base, excerpt: { en: 'Own.', ru: '' } }).excerpt).toEqual({
			en: 'Own.',
			ru: '',
		})
		expect(() => albumSchema.parse({ ...base, excerpt: { en: 'Own.' } })).toThrow()
		expect(() => albumSchema.parse({ ...base, excerpt: 'Own.' })).toThrow()
	})

	// courses moved to the courses module's own collection, so a page has neither field any more
	it('rejects the page kind and the course status of the earlier course pages', () => {
		const base = {
			translationKey: 'about',
			locale: 'en',
			slug: 'about',
			title: 'About',
			status: 'draft',
		}
		expect(pageSchema.safeParse(base).success).toBe(true)
		expect(() => pageSchema.parse({ ...base, kind: 'course' })).toThrow(/kind/)
		expect(() => pageSchema.parse({ ...base, courseStatus: 'archive' })).toThrow(/courseStatus/)
		expect(() => articleSchema.parse({ ...base, courseStatus: 'archive' })).toThrow()
	})

	// reference-locale rules for both fields live in pair-level integrity (ADR-0013)
	it('accepts an optional document coverId and no longer requires article publishedAt', () => {
		const base = {
			translationKey: 'about',
			locale: 'ru' as const,
			slug: 'about',
			title: 'About',
			status: 'published' as const,
		}
		expect(pageSchema.parse({ ...base, coverId: 'quiet-light' }).coverId).toBe('quiet-light')
		expect(articleSchema.parse({ ...base, coverId: 'quiet-light' }).coverId).toBe('quiet-light')
		expect(pageSchema.parse(base).coverId).toBeUndefined()
		expect(() => articleSchema.parse(base)).not.toThrow()
	})

	it('validates MoreDocuments frontmatter as off or a non-empty unique managed list', () => {
		const base = {
			translationKey: 'article',
			locale: 'en',
			slug: 'article',
			title: 'Article',
			status: 'draft',
		}
		expect(articleSchema.parse({ ...base, moreDocs: 'off' }).moreDocs).toBe('off')
		expect(
			articleSchema.parse({ ...base, moreDocs: { docs: [{ kind: 'page', slug: 'about' }] } })
				.moreDocs,
		).toBeDefined()
		expect(() => articleSchema.parse({ ...base, moreDocs: { docs: [] } })).toThrow()
		expect(() =>
			articleSchema.parse({
				...base,
				moreDocs: {
					docs: [
						{ kind: 'page', slug: 'about' },
						{ kind: 'page', slug: 'about' },
					],
				},
			}),
		).toThrow()
		expect(() =>
			articleSchema.parse({
				...base,
				moreDocs: { docs: [{ kind: 'unknown', slug: 'about' }] },
			}),
		).toThrow()
	})

	it('accepts translatedFromDigest only on EN documents and only as a sha256 hex', () => {
		const digest = 'a'.repeat(64)
		const enBase = {
			translationKey: 'about',
			locale: 'en',
			slug: 'about',
			title: 'About',
			status: 'draft',
		}
		// EN document: a well-formed digest is accepted and round-trips.
		expect(
			pageSchema.parse({ ...enBase, translatedFromDigest: digest }).translatedFromDigest,
		).toBe(digest)
		expect(
			articleSchema.parse({ ...enBase, translatedFromDigest: digest }).translatedFromDigest,
		).toBe(digest)
		// absent field stays optional (never emitted onto documents without it).
		expect(pageSchema.parse(enBase).translatedFromDigest).toBeUndefined()
		// which locale may carry it depends on content.referenceLocale, so integrity checks that
		// malformed digests (wrong length, uppercase) are rejected even on EN.
		expect(() => pageSchema.parse({ ...enBase, translatedFromDigest: 'abc' })).toThrow()
		expect(() =>
			pageSchema.parse({ ...enBase, translatedFromDigest: 'A'.repeat(64) }),
		).toThrow()
	})

	it('accepts either a migrated (legacyId) or a new (sha256+master) origin, both flat', () => {
		const sha = 'a'.repeat(64)
		const photo = { title: localized, status: 'draft' as const }
		const migrated = photoSchema.parse({ ...photo, legacyId: 'wp:attachment:1' })
		expect(migrated.legacyId).toBe('wp:attachment:1')
		expect(migrated.sha256).toBeUndefined()
		const fresh = photoSchema.parse({ ...photo, sha256: sha, master: 'golden-rays.jpg' })
		expect(fresh.sha256).toBe(sha)
		expect(fresh.master).toBe('golden-rays.jpg')
		expect(fresh.legacyId).toBeUndefined()
		// mixed / malformed origins are rejected: legacyId is mutually exclusive with sha256/master,
		// sha256 must be valid hex, and sha256/master must appear together.
		expect(() => photoSchema.parse({ ...photo, legacyId: 'x', sha256: sha })).toThrow()
		expect(() => photoSchema.parse({ ...photo, sha256: 'nothex', master: 'a.jpg' })).toThrow()
		expect(() => photoSchema.parse({ ...photo, sha256: sha })).toThrow()
	})

	it('validates transitional media ordering', () => {
		expect(() =>
			mediaDescriptorSchema.parse({
				assetKey: 'photo',
				width: 1000,
				height: 500,
				dominantColor: '#abcdef',
				derivatives: { widths: [800, 640], formats: ['webp'] },
			}),
		).toThrow()
	})

	it.each(['2026-02-29', '2026-13-01', '2026-01-01T24:00:00Z'])(
		'rejects calendar-invalid ISO value %s',
		(value) => {
			expect(() => isoDateSchema.parse(value)).toThrow()
		},
	)

	it('normalizes equivalent ISO datetimes', () => {
		expect(isoDateSchema.parse('2026-07-26T12:00:00Z')).toBe('2026-07-26T12:00:00.000Z')
	})

	it('accepts a Date from the Astro loader and normalizes to a date-only string', () => {
		// js-yaml in the Astro loader yields `YYYY-MM-DD` as a Date at UTC midnight
		expect(isoDateSchema.parse(new Date('2017-03-17T00:00:00.000Z'))).toBe('2017-03-17')
		expect(isoDateSchema.parse(new Date('2017-03-17T12:34:56.000Z'))).toBe(
			'2017-03-17T12:34:56.000Z',
		)
		expect(() => isoDateSchema.parse(new Date('invalid'))).toThrow()
	})

	it.each(['2019', '2019-07', '2019-01', '2019-12'])(
		'partialCapturedAtSchema accepts partial date %s',
		(value) => {
			expect(partialCapturedAtSchema.parse(value)).toBe(value)
		},
	)

	it.each([
		'2019-07-01',
		'2019-13',
		'2019-00',
		'2019-7',
		'19',
		'2019-07-15T08:00:00Z',
		'2019/07',
	])('partialCapturedAtSchema rejects non-partial value %s', (value) => {
		expect(() => partialCapturedAtSchema.parse(value)).toThrow()
	})

	it('wires the partial schema onto photo capturedAt only', () => {
		expect(
			photoSchema.parse({ title: localized, status: 'draft', capturedAt: '2019-07' })
				.capturedAt,
		).toBe('2019-07')
		expect(() =>
			photoSchema.parse({ title: localized, status: 'draft', capturedAt: '2019-07-15' }),
		).toThrow()
	})

	it.each([
		['articles', 'target'],
		['pages', 'target'],
		['articles', { photoSlug: 'photo' }],
		['pages', { photoSlug: 'photo' }],
	] as const)('accepts a %s slide with mediaSource %j', (collection, mediaSource) => {
		expect(
			featuredItemSchema.safeParse({
				id: 'slide',
				align: 'left',
				target: { collection, slug: 'document', linkKind: 'page' },
				copySource: 'target',
				mediaSource,
			}).success,
		).toBe(true)
	})

	it.each(['2019', '2019-07'])('publishedAt still rejects partial date %s', (value) => {
		expect(() => isoDateSchema.parse(value)).toThrow()
		expect(() =>
			photoSchema.parse({
				title: localized,
				status: 'published',
				publishedAt: value,
				colorMode: 'color',
			}),
		).toThrow()
	})
})
