import { describe, expect, it } from 'vitest'

import { loadSiteSection } from '../../config/loader.ts'
import { siteRoot } from '../../config/site-root.ts'
import { defaultLocale } from '../../config/site-schema.ts'
import { DEFAULT_TAXONOMY } from '../../config/taxonomy.ts'
import { coursesModule } from '../../modules/courses/manifest.ts'
import { courseSchema } from '../../modules/courses/schema.ts'
import { loadContentSnapshot, lockedModules } from '../content/files.ts'
import type { ContentSnapshot } from '../content/model.ts'
import { albumSchemaFor, articleSchema, pageSchema, photoSchemaFor } from '../content/schemas.ts'
import { withRootRedirect } from '../site-files.ts'
import { buildRedirectRouteSets, validateRedirects } from './contract.ts'

const routes = {
	locales: ['en', 'ru'] as const,
	published: new Set([
		'/',
		'/en/',
		'/en/portfolio/',
		'/en/articles/',
		'/en/courses/',
		'/en/articles/known/',
		'/en/articles/:slug/',
		'/en/portfolio/known/',
		'/owner-route/',
		'https://example.com/en/',
		'/rights/',
		'/status/',
	]),
	unlisted: new Set(['/en/articles/hidden/']),
}

describe('Cloudflare Pages redirect contract', () => {
	it('accepts exact one-hop rules to published routes', () => {
		expect(
			validateRedirects(
				'/articles/ /en/articles/ 301\n/articles/known/ /en/articles/known/ 301',
				routes,
			),
		).toEqual([])
	})

	it.each([
		[
			'duplicate source',
			'/old/ /en/articles/ 301\n/old/ /en/portfolio/ 301',
			'duplicate source',
		],
		['redirect chain', '/old/ /next/ 301\n/next/ /en/articles/ 301', 'chain or loop'],
		['loop', '/old/ /next/ 301\n/next/ /old/ 301', 'chain or loop'],
		['wildcard', '/old/*/ /en/articles/ 301', 'without query, fragment, or wildcard'],
		['named placeholder source', '/portfolio/:album/ /en/portfolio/ 301', 'named placeholder'],
		['named placeholder target', '/old/ /en/articles/:slug/ 301', 'named placeholder'],
		[
			'query string',
			'/old/?lang=ru/ /en/articles/ 301',
			'without query, fragment, or wildcard',
		],
		['absolute URL', '/old/ https://example.com/en/ 301', 'target must be an exact local path'],
		['wrong status', '/old/ /en/articles/ 302', 'only status 301'],
		['missing source slash', '/old /en/articles/ 301', 'source must end with a slash'],
		['missing target slash', '/old/ /en/articles 301', 'target must end with a slash'],
		['wrong field count', '/old/ /en/articles/ 301 extra', 'expected exactly'],
		['unpublished target', '/old/ /en/articles/draft/ 301', 'is not a published route'],
		['protected route collision', '/api/contact/ /en/articles/ 301', 'protected route'],
		['active locale prefix', '/ru/not-a-document/ /en/articles/known/ 301', 'protected route'],
		[
			'existing content route collision',
			'/owner-route/ /en/articles/ 301',
			'existing content route',
		],
	])('rejects %s', (_name, fixture, expectedError) => {
		expect(
			validateRedirects(fixture, routes).some((error) => error.includes(expectedError)),
		).toBe(true)
	})

	it('requires explicit approval before redirecting to an unlisted route', () => {
		expect(validateRedirects('/old/ /en/articles/hidden/ 301', routes)).not.toEqual([])
		expect(
			validateRedirects('# owner-approved-unlisted\n/old/ /en/articles/hidden/ 301', routes),
		).toEqual([])
	})

	// the demo ships no public/_redirects, so the deployed file is the root rule alone
	it("accepts the root rule the build derives for the demo site's routes", async () => {
		const content = loadSiteSection(siteRoot, 'content')
		const routeSets = buildRedirectRouteSets(
			await loadContentSnapshot(siteRoot),
			content,
			lockedModules(siteRoot),
		)
		const redirects = withRootRedirect('', defaultLocale({ content }))

		expect(redirects.trim()).toBe(`/ /${defaultLocale({ content })}/ 301`)
		expect(validateRedirects(redirects, routeSets)).toEqual([])
	})

	it('builds route sets from published, unlisted, and correctly classified content', () => {
		const page = (
			translationKey: string,
			locale: 'en' | 'ru',
			slug: string,
			status: 'draft' | 'published',
		) => ({
			id: `${translationKey}-${locale}`,
			data: pageSchema.parse({ translationKey, locale, slug, title: translationKey, status }),
		})
		const course = (
			translationKey: string,
			locale: 'en' | 'ru',
			status: 'draft' | 'published',
			fields: Record<string, unknown> = {},
		) => ({
			id: `${translationKey}-${locale}`,
			data: courseSchema.parse({
				translationKey,
				locale,
				slug: translationKey,
				title: translationKey,
				status,
				...fields,
			}),
		})
		const article = (
			translationKey: string,
			locale: 'en' | 'ru',
			slug: string,
			status: 'draft' | 'published',
		) => ({
			id: `${translationKey}-${locale}`,
			data: articleSchema.parse({
				translationKey,
				locale,
				slug,
				title: translationKey,
				status,
			}),
		})
		const album = albumSchemaFor(['en', 'ru'], DEFAULT_TAXONOMY.categories).parse({
			category: 'series',
			title: { en: 'Album', ru: 'Альбом' },
			description: { en: '', ru: '' },
			status: 'published',
			coverId: 'featured-photo',
			photoIds: ['featured-photo'],
		})
		const unlistedAlbum = albumSchemaFor(['en', 'ru'], DEFAULT_TAXONOMY.categories).parse({
			category: 'series',
			title: { en: 'Hidden album', ru: 'Скрытый альбом' },
			description: { en: '', ru: '' },
			status: 'published',
			coverId: 'unlisted-album-photo',
			photoIds: ['unlisted-album-photo'],
			unlisted: true,
		})
		const photo = photoSchemaFor(['en', 'ru']).parse({
			title: { en: 'Photo', ru: 'Фото' },
			status: 'published',
			publishedAt: '2026-01-01',
			unlisted: true,
		})
		const albumPhoto = photoSchemaFor(['en', 'ru']).parse({
			title: { en: 'Album photo', ru: 'Фото альбома' },
			status: 'published',
			publishedAt: '2026-01-01',
		})
		const snapshot: ContentSnapshot = {
			articles: [
				article('visible-article', 'en', 'visible-article', 'published'),
				article('visible-article', 'ru', 'visible-article', 'published'),
			],
			pages: [
				page('about', 'en', 'about', 'published'),
				page('about', 'ru', 'about', 'published'),
				page('home', 'en', 'home', 'published'),
				page('home', 'ru', 'home', 'published'),
			],
			courses: [
				course('course', 'en', 'published'),
				course('course', 'ru', 'published', { courseStatus: 'current', unlisted: true }),
				course('draft-course', 'en', 'draft'),
				course('draft-course', 'ru', 'draft', { courseStatus: 'current' }),
			],
			albums: [
				{ id: 'album', data: album },
				{ id: 'unlisted-album', data: unlistedAlbum },
			],
			photos: [
				{ id: 'featured-photo', data: photo },
				{ id: 'unlisted-album-photo', data: albumPhoto },
			],
			categories: [],
			places: [],
			tags: [],
		}
		const content = { locales: ['en', 'ru'] as const, referenceLocale: 'ru' as const }
		const routeSets = buildRedirectRouteSets(snapshot, content, [coursesModule])
		const withoutModule = buildRedirectRouteSets({ ...snapshot, courses: [] }, content, [])

		for (const locale of ['en', 'ru'] as const) {
			expect(routeSets.published).toContain(`/${locale}/articles/visible-article/`)
			expect(routeSets.published).toContain(`/${locale}/about/`)
			expect(routeSets.published).toContain(`/${locale}/portfolio/album/`)
			expect(routeSets.published).not.toContain(`/${locale}/course/`)
			expect(routeSets.published).not.toContain(`/${locale}/courses/course/`)
			expect(routeSets.published).not.toContain(`/${locale}/courses/draft-course/`)
			expect(routeSets.published).not.toContain(`/${locale}/home/`)
			expect(routeSets.unlisted).not.toContain(`/${locale}/courses/draft-course/`)
			expect(routeSets.unlisted).not.toContain(`/${locale}/home/`)
			expect(routeSets.unlisted).toContain(`/${locale}/courses/course/`)
			expect(routeSets.published).toContain(`/${locale}/courses/`)
			expect(withoutModule.published).not.toContain(`/${locale}/courses/`)
			expect(routeSets.unlisted).toContain(`/${locale}/portfolio/album/featured-photo/`)
			expect(routeSets.unlisted).toContain(`/${locale}/portfolio/unlisted-album/`)
			expect(routeSets.unlisted).toContain(
				`/${locale}/portfolio/unlisted-album/unlisted-album-photo/`,
			)
		}
	})
})
