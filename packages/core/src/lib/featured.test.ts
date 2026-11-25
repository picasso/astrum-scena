import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import type { CourseData } from '../modules/courses/schema.ts'
import type { ContentEntry, ContentSnapshot } from './content/model'
import {
	type ArticleData,
	type FeaturedConfig,
	featuredConfigSchemaFor,
	type Locale,
	type PageData,
} from './content/schemas'
import {
	type FeaturedExcerptResolver,
	type ResolveFeaturedOptions,
	resolveFeaturedSlides,
} from './featured'
import { parseManifest } from './images/manifest'
import { resolvePhotoMedia } from './images/media'

const REFERENCE: Locale = 'ru'
const LOCALES: Locale[] = ['en', 'ru']
const featuredConfigSchema = featuredConfigSchemaFor(LOCALES)

const readFixture = (name: string) =>
	readFileSync(new URL(`./content/__fixtures__/${name}`, import.meta.url), 'utf8')

const manifest = parseManifest(JSON.parse(readFixture('featured-images-ladder.json')))
const fixtureConfig: FeaturedConfig = featuredConfigSchema.parse(
	parseYaml(readFixture('featured-home.yaml')),
)

const labelProvider = (kind: 'album' | 'page', locale: Locale) => `${kind}-${locale}`

// stands in for deriveExcerpt in the Astro adapter, which has the document body
const excerpt: FeaturedExcerptResolver = (target, locale) => `${target.slug} excerpt ${locale}`

const options: ResolveFeaturedOptions = {
	resolvePhotoMedia: (photoId) => resolvePhotoMedia(manifest, photoId),
	resolveDocumentExcerpt: excerpt,
	referenceLocale: REFERENCE,
	genericAlt: 'Generic photo',
}

// only the reference-locale entry carries Tier-1 fields such as `coverId` (ADR-0013)
function documentPair<T extends ArticleData | PageData | CourseData>(
	slug: string,
	reference: Partial<T>,
): ContentEntry<T>[] {
	return LOCALES.map((locale) => ({
		id: `${slug}-${locale}`,
		data: {
			translationKey: slug,
			locale,
			slug,
			title: `${slug} ${locale}`,
			status: 'published',
			...(locale === REFERENCE ? reference : {}),
		} as T,
	}))
}

function snapshot(): ContentSnapshot {
	const photo = (id: string, title: string, description?: string) => ({
		id,
		data: {
			title: { en: title, ru: `${title} ru` },
			...(description ? { description: { en: description, ru: `${description} ru` } } : {}),
			status: 'published' as const,
			publishedAt: '2026-01-01',
			favorite: false,
			tags: [],
		},
	})
	const album = (id: string, coverId: string, photoIds: string[]) => ({
		id,
		data: {
			category: 'series' as const,
			title: { en: id, ru: `${id} ru` },
			description: { en: `${id} about`, ru: `${id} описание` },
			status: 'published' as const,
			coverId,
			photoIds,
		},
	})
	return {
		albums: [
			album('northland', 'morning-ridge', ['morning-ridge', 'still-symmetry']),
			album('sunrises', 'morning-ridge', ['morning-ridge', 'still-symmetry']),
		],
		photos: [
			photo('morning-ridge', 'Morning Ridge'),
			photo('still-symmetry', 'Still Symmetry', 'Two shapes in still water.'),
			// published but absent from the fixture manifest
			photo('unsliced-dawn', 'Unsliced Dawn'),
		],
		articles: [
			...documentPair<ArticleData>('field-notes', { coverId: 'still-symmetry' }),
			...documentPair<ArticleData>('no-cover', {}),
		],
		pages: [...documentPair<PageData>('about-light', { coverId: 'morning-ridge' })],
		courses: [
			...documentPair<CourseData>('course-light', {
				coverId: 'morning-ridge',
				courseStatus: 'current',
			}),
		],
		categories: [],
		places: [],
		tags: [],
	}
}

function documentSlide(
	collection: 'articles' | 'pages',
	slug: string,
	mediaSource: FeaturedConfig['slides'][number]['mediaSource'],
): FeaturedConfig {
	return {
		schemaVersion: 2,
		slides: [
			{
				id: `${slug}-slide`,
				align: 'right',
				target: { collection, slug, linkKind: 'page' },
				copySource: 'target',
				mediaSource,
			},
		],
	}
}

const resolve = (config: FeaturedConfig, locale: Locale) =>
	resolveFeaturedSlides(snapshot(), config, locale, labelProvider, options)

const throwingExcerpt: FeaturedExcerptResolver = () => {
	throw new Error('resolveDocumentExcerpt must not be called')
}

function albumSlide(
	slug: string,
	slide: Partial<FeaturedConfig['slides'][number]> = {},
): FeaturedConfig {
	return {
		schemaVersion: 2,
		slides: [
			{
				id: `${slug}-slide`,
				align: 'left',
				target: { collection: 'albums', slug, linkKind: 'album' },
				copySource: 'target',
				mediaSource: 'target',
				...slide,
			},
		],
	}
}

function articleSlide(
	slug: string,
	slide: Partial<FeaturedConfig['slides'][number]>,
): FeaturedConfig {
	return {
		schemaVersion: 2,
		slides: [
			{
				...documentSlide('articles', slug, 'target').slides[0]!,
				...slide,
			},
		],
	}
}

function northland(data: ContentSnapshot): ContentSnapshot['albums'][number] {
	return data.albums.find((entry) => entry.id === 'northland')!
}

describe('featured resolver', () => {
	it.each(LOCALES)('resolves the fixture slides in %s', (locale) => {
		const [cover, photoCopy, article] = resolve(fixtureConfig, locale)
		expect(cover).toMatchObject({
			accent: 'accent',
			media: { photoId: 'morning-ridge' },
			link: { kind: 'album', href: `/${locale}/portfolio/northland/` },
		})
		expect(photoCopy?.media.photoId).toBe('still-symmetry')
		expect(article).toMatchObject({
			accent: 'alt',
			media: { photoId: 'still-symmetry' },
			title: { clean: `field-notes ${locale}` },
			desc: `field-notes excerpt ${locale}`,
		})
	})

	it.each(LOCALES)('takes document media from the reference-locale coverId in %s', (locale) => {
		expect(
			resolve(documentSlide('articles', 'field-notes', 'target'), locale)[0]?.media,
		).toMatchObject({
			photoId: 'still-symmetry',
		})
		expect(
			resolve(documentSlide('pages', 'about-light', 'target'), locale)[0]?.media,
		).toMatchObject({
			photoId: 'morning-ridge',
		})
	})

	it.each(LOCALES)('names a document without coverId in %s', (locale) => {
		expect(() => resolve(documentSlide('articles', 'no-cover', 'target'), locale)).toThrow(
			/Featured document "no-cover" has no coverId.*mediaSource\.photoSlug/,
		)
	})

	it.each(LOCALES)('keeps an explicit photoSlug over the coverId in %s', (locale) => {
		const config = documentSlide('articles', 'field-notes', { photoSlug: 'morning-ridge' })
		expect(resolve(config, locale)[0]?.media.photoId).toBe('morning-ridge')
		const uncovered = documentSlide('articles', 'no-cover', { photoSlug: 'still-symmetry' })
		expect(resolve(uncovered, locale)[0]?.media.photoId).toBe('still-symmetry')
	})

	// a course is no page (it lives in the courses module's collection), so it cannot be targeted as one
	it('finds no page for a course slug', () => {
		expect(() => resolve(documentSlide('pages', 'course-light', 'target'), 'en')).toThrow(
			'Featured document "course-light" locale "en" not found',
		)
	})

	it.each(LOCALES)('links an album slide with the injected label in %s', (locale) => {
		expect(resolve(albumSlide('northland'), locale)[0]?.link).toEqual({
			kind: 'album',
			href: `/${locale}/portfolio/northland/`,
			label: `album-${locale}`,
		})
	})

	it('gives album slides the albumAccent option and keeps documents on alt', () => {
		const [cover, , article] = resolveFeaturedSlides(
			snapshot(),
			fixtureConfig,
			'en',
			labelProvider,
			{ ...options, albumAccent: 'alt' },
		)
		expect(cover?.accent).toBe('alt')
		expect(article?.accent).toBe('alt')
	})

	it('takes the copy from the photo under copySource:media in both locales', () => {
		const en = resolve(fixtureConfig, 'en')[1]
		const ru = resolve(fixtureConfig, 'ru')[1]
		expect(en?.title.clean).toBe('Still Symmetry')
		expect(ru?.title.clean).toBe('Still Symmetry ru')
		expect(en?.desc).toBe('Two shapes in still water.')
		expect(ru?.desc).toBe('Two shapes in still water. ru')
		expect(en?.link.href).toBe('/en/portfolio/sunrises/')
	})

	it('fails when the photo is absent from the manifest', () => {
		const config = articleSlide('field-notes', {
			copySource: 'media',
			mediaSource: { photoSlug: 'unsliced-dawn' },
		})
		expect(() =>
			resolveFeaturedSlides(snapshot(), config, 'en', labelProvider, {
				...options,
				resolveDocumentExcerpt: throwingExcerpt,
			}),
		).toThrow(/manifest has no photo "unsliced-dawn"/)
	})

	it('uses the injected generic alt when a slide has neither title nor description', () => {
		const data = snapshot()
		northland(data).data.title = { en: '', ru: '' }
		northland(data).data.description = { en: '', ru: '' }
		const [slide] = resolveFeaturedSlides(data, albumSlide('northland'), 'en', labelProvider, {
			...options,
			genericAlt: 'Fallback alt 7f3c',
		})
		expect(slide?.alt).toBe('Fallback alt 7f3c')
	})

	it('preserves an intentionally empty album description', () => {
		const data = snapshot()
		northland(data).data.description = { en: '', ru: '' }
		expect(
			resolveFeaturedSlides(data, albumSlide('northland'), 'en', labelProvider, options)[0]
				?.desc,
		).toBe('')
	})

	it('rejects a target cover outside the album membership', () => {
		const data = snapshot()
		northland(data).data.coverId = 'unsliced-dawn'
		expect(() =>
			resolveFeaturedSlides(data, albumSlide('northland'), 'en', labelProvider, options),
		).toThrow(/"unsliced-dawn" is not in album "northland"/)
	})

	it.each(LOCALES)(
		'resolves a copySource:target document from the excerpt and links it in %s',
		(locale) => {
			const config = articleSlide('field-notes', {
				mediaSource: { photoSlug: 'morning-ridge' },
			})
			expect(resolve(config, locale)[0]).toMatchObject({
				accent: 'alt',
				desc: `field-notes excerpt ${locale}`,
				media: { photoId: 'morning-ridge' },
				link: {
					kind: 'page',
					href: `/${locale}/articles/field-notes/`,
					label: `page-${locale}`,
				},
			})
		},
	)

	it('resolves a copySource:media document from the photo without consulting the excerpt', () => {
		const config = articleSlide('field-notes', {
			copySource: 'media',
			mediaSource: { photoSlug: 'morning-ridge' },
		})
		const [slide] = resolveFeaturedSlides(snapshot(), config, 'en', labelProvider, {
			...options,
			resolveDocumentExcerpt: throwingExcerpt,
		})
		expect(slide?.title.clean).toBe('Morning Ridge')
		expect(slide?.media.photoId).toBe('morning-ridge')
	})

	it('fails a copySource:target document when no excerpt can be derived', () => {
		expect(() =>
			resolveFeaturedSlides(
				snapshot(),
				documentSlide('articles', 'field-notes', 'target'),
				'en',
				labelProvider,
				{ ...options, resolveDocumentExcerpt: () => undefined },
			),
		).toThrow(/"field-notes" \(en\) has no excerpt/)
	})

	it('rejects a draft target', () => {
		const data = snapshot()
		data.pages.find((entry) => entry.id === 'about-light-en')!.data.status = 'draft'
		expect(() =>
			resolveFeaturedSlides(
				data,
				documentSlide('pages', 'about-light', 'target'),
				'en',
				labelProvider,
				options,
			),
		).toThrow(/"about-light" \(en\) is not published/)
	})

	it('rejects a target whose requested locale is missing', () => {
		const data = snapshot()
		data.articles = data.articles.filter((entry) => entry.id !== 'field-notes-en')
		expect(() =>
			resolveFeaturedSlides(
				data,
				documentSlide('articles', 'field-notes', 'target'),
				'en',
				labelProvider,
				options,
			),
		).toThrow(/locale "en" not found/)
	})

	it('uses inline copy over the target and media without consulting the excerpt', () => {
		const config = albumSlide('northland', {
			copySource: 'inline',
			copy: {
				title: { en: 'Northland |Unhurried', ru: 'Северный край |без спешки' },
				description: { en: 'Cold air, long light.', ru: 'Холодный воздух, долгий свет.' },
			},
		})
		const inline = { ...options, resolveDocumentExcerpt: throwingExcerpt }
		const [en] = resolveFeaturedSlides(snapshot(), config, 'en', labelProvider, inline)
		const [ru] = resolveFeaturedSlides(snapshot(), config, 'ru', labelProvider, inline)
		expect(en?.title.clean).toBe('Northland Unhurried')
		expect(en?.desc).toBe('Cold air, long light.')
		expect(ru?.title.clean).toBe('Северный край без спешки')
		expect(ru?.desc).toBe('Холодный воздух, долгий свет.')
		expect(en?.media.photoId).toBe('morning-ridge')
	})

	it('uses inline copy on a document without consulting the excerpt', () => {
		const config = articleSlide('field-notes', {
			copySource: 'inline',
			copy: {
				title: { en: 'Field |Notes', ru: 'Полевые |заметки' },
				description: { en: 'Written on site.', ru: 'Записано на месте.' },
			},
		})
		const inline = { ...options, resolveDocumentExcerpt: throwingExcerpt }
		const [en] = resolveFeaturedSlides(snapshot(), config, 'en', labelProvider, inline)
		const [ru] = resolveFeaturedSlides(snapshot(), config, 'ru', labelProvider, inline)
		expect(en?.title.clean).toBe('Field Notes')
		expect(en?.desc).toBe('Written on site.')
		expect(ru?.title.clean).toBe('Полевые заметки')
		expect(ru?.desc).toBe('Записано на месте.')
		expect(en?.media.photoId).toBe('still-symmetry')
	})
})

describe('featuredConfigSchemaFor', () => {
	const item = {
		id: 'item',
		align: 'left' as const,
		target: { collection: 'albums' as const, slug: 'northland', linkKind: 'album' as const },
		copySource: 'target' as const,
		mediaSource: 'target' as const,
	}
	const inline = {
		...item,
		copySource: 'inline' as const,
		copy: {
			title: { en: 'Title', ru: 'Заголовок' },
			description: { en: '', ru: '' },
		},
	}

	it('accepts inline copy on any target and rejects it otherwise', () => {
		expect(() =>
			featuredConfigSchema.parse({ schemaVersion: 2, slides: [inline] }),
		).not.toThrow()
		expect(() =>
			featuredConfigSchema.parse({
				schemaVersion: 2,
				slides: [{ ...item, copySource: 'inline' }],
			}),
		).toThrow()
		// a copy block without copySource:inline
		expect(() =>
			featuredConfigSchema.parse({
				schemaVersion: 2,
				slides: [{ ...inline, copySource: 'target' }],
			}),
		).toThrow()
		// the inline title is required in both locales
		expect(() =>
			featuredConfigSchema.parse({
				schemaVersion: 2,
				slides: [
					{
						...inline,
						copy: { title: { en: 'x', ru: '' }, description: { en: '', ru: '' } },
					},
				],
			}),
		).toThrow()
	})

	it('accepts a document with copySource:media and an explicit photoSlug', () => {
		expect(() =>
			featuredConfigSchema.parse({
				schemaVersion: 2,
				slides: [
					{
						id: 'doc-media',
						align: 'left',
						target: { collection: 'pages', slug: 'about-light', linkKind: 'page' },
						copySource: 'media',
						mediaSource: { photoSlug: 'morning-ridge' },
					},
				],
			}),
		).not.toThrow()
	})

	it('rejects duplicate slide ids', () => {
		expect(() =>
			featuredConfigSchema.parse({ schemaVersion: 2, slides: [item, item] }),
		).toThrow(/Featured slide IDs must be unique/)
	})
})
