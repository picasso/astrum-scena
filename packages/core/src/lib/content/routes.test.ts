import { existsSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { siteRoot } from '../../config/site-root.ts'
import { CORE_ROOT } from '../../core-root.ts'
import { switchLocalePath } from '../../i18n/ui.ts'
import { courseHref, coursesIndexHref } from '../../modules/courses/routes.ts'
import { loadImageConfig } from '../images/build/config.ts'
import {
	albumHref,
	articleHref,
	articlesIndexHref,
	contentHref,
	localizedStaticPaths,
	pageHref,
	photoHref,
	RIGHTS_PATH,
	STATUS_PATH,
} from './routes.ts'

describe('portfolio href builders', () => {
	it('builds album and photo routes with a single trailing slash under each locale', () => {
		expect(albumHref('sunrises', 'en')).toBe('/en/portfolio/sunrises/')
		expect(albumHref('sunrises', 'ru')).toBe('/ru/portfolio/sunrises/')
		expect(photoHref('sunrises', 'quiet-light', 'en')).toBe(
			'/en/portfolio/sunrises/quiet-light/',
		)
	})

	it('stays consistent with contentHref for albums', () => {
		expect(albumHref('sunrises', 'en')).toBe(
			contentHref({ collection: 'albums', slug: 'sunrises', linkKind: 'album' }, 'en'),
		)
	})
})

describe('document href builders', () => {
	it('builds article and generic page routes under each locale', () => {
		expect(articlesIndexHref('en')).toBe('/en/articles/')
		expect(articleHref('glass-and-light', 'ru')).toBe('/ru/articles/glass-and-light/')
		expect(pageHref('about', 'en')).toBe('/en/about/')
	})

	it('stays consistent with contentHref for articles and generic pages', () => {
		expect(articleHref('glass-and-light', 'en')).toBe(
			contentHref(
				{ collection: 'articles', slug: 'glass-and-light', linkKind: 'page' },
				'en',
			),
		)
		expect(pageHref('about', 'ru')).toBe(
			contentHref({ collection: 'pages', slug: 'about', linkKind: 'page' }, 'ru'),
		)
	})

	it('keeps courses on their own segment instead of a flat page URL', () => {
		expect(coursesIndexHref('en')).toBe('/en/courses/')
		expect(courseHref('paper-lanterns', 'ru')).toBe('/ru/courses/paper-lanterns/')
		// a course is no page, so a flat course URL is a 404 and the two links must differ
		expect(courseHref('paper-lanterns', 'en')).not.toBe(pageHref('paper-lanterns', 'en'))
	})
})

// `/rights/` is no ordinary page: its URL is already embedded in the XMP of published derivatives, so
// the path is pinned here; that the built page actually serves it is covered by e2e
describe('language-neutral rights route', () => {
	it('keeps the exact path embedded into published image metadata', () => {
		expect(RIGHTS_PATH).toBe('/rights/')
		expect(new URL(RIGHTS_PATH, 'https://site.test').href).toBe('https://site.test/rights/')
	})

	it("matches the webStatement URL the site's image config embeds", () => {
		// the path is the code contract; the host is the site's and is not pinned here
		const { webStatement } = loadImageConfig(siteRoot).rights
		expect(new URL(webStatement).pathname).toBe(RIGHTS_PATH)
	})

	it('is served by a language-neutral core page instead of a locale route', () => {
		const pages = path.join(CORE_ROOT, 'src', 'pages')
		expect(existsSync(path.join(pages, 'rights.astro'))).toBe(true)
		expect(existsSync(path.join(pages, '[locale]', 'rights.astro'))).toBe(false)
		expect(existsSync(path.join(pages, '[locale]', 'rights'))).toBe(false)
	})
})

describe('language-neutral status route', () => {
	it('is a single trailing-slash path with no locale prefix', () => {
		expect(STATUS_PATH).toBe('/status/')
		expect(new URL(STATUS_PATH, 'https://site.test').href).toBe('https://site.test/status/')
	})

	it('is served by a language-neutral core page instead of a locale route', () => {
		const pages = path.join(CORE_ROOT, 'src', 'pages')
		expect(existsSync(path.join(pages, 'status.astro'))).toBe(true)
		expect(existsSync(path.join(pages, '[locale]', 'status.astro'))).toBe(false)
		expect(existsSync(path.join(pages, '[locale]', 'status'))).toBe(false)
	})
})

describe('switchLocalePath on nested routes', () => {
	it('preserves the album/photo suffix and a single trailing slash', () => {
		const enPhoto = photoHref('sunrises', 'quiet-light', 'en')
		expect(switchLocalePath(enPhoto, 'ru')).toBe('/ru/portfolio/sunrises/quiet-light/')
		expect(switchLocalePath(albumHref('sunrises', 'ru'), 'en')).toBe('/en/portfolio/sunrises/')
	})

	it('preserves article and course suffixes', () => {
		expect(switchLocalePath(articleHref('glass-and-light', 'en'), 'ru')).toBe(
			articleHref('glass-and-light', 'ru'),
		)
		expect(switchLocalePath(courseHref('paper-lanterns', 'ru'), 'en')).toBe(
			courseHref('paper-lanterns', 'en'),
		)
	})
})

describe('localizedStaticPaths', () => {
	const paths = [{ params: { slug: 'a' } }, { params: { slug: 'b' } }]

	it('crosses every configured locale with the paths, in locale order', () => {
		expect(localizedStaticPaths(['en', 'ru'], paths)).toEqual([
			{ params: { slug: 'a', locale: 'en' }, props: { locale: 'en' } },
			{ params: { slug: 'b', locale: 'en' }, props: { locale: 'en' } },
			{ params: { slug: 'a', locale: 'ru' }, props: { locale: 'ru' } },
			{ params: { slug: 'b', locale: 'ru' }, props: { locale: 'ru' } },
		])
	})

	it('yields only the configured locale on a one-locale site', () => {
		expect(localizedStaticPaths(['ru'], paths).map((p) => p.params.locale)).toEqual([
			'ru',
			'ru',
		])
		expect(localizedStaticPaths(['ru'])).toEqual([
			{ params: { locale: 'ru' }, props: { locale: 'ru' } },
		])
	})

	it('yields one page per locale without paths and none for empty paths', () => {
		expect(localizedStaticPaths(['en', 'ru'])).toHaveLength(2)
		expect(localizedStaticPaths(['en', 'ru'], [])).toEqual([])
	})
})
