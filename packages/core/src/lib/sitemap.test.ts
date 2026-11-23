import { describe, expect, it } from 'vitest'

import { courseHref, coursesIndexHref } from '../modules/courses/routes.ts'
import { articleHref, pageHref, RIGHTS_PATH, STATUS_PATH } from './content/routes.ts'
import { canonicalSitemapUrl, createSitemapFilter } from './sitemap.ts'

const SITE_ORIGIN = 'https://site.test'
const absolute = (path: string): string => new URL(path, SITE_ORIGIN).href
const UNLISTED = new Set([
	courseHref('evening-concert', 'en'),
	courseHref('evening-concert', 'ru'),
	'/en/portfolio/hidden-album/',
	'/ru/portfolio/listed-album/hidden-photo/',
])
const filter = createSitemapFilter(UNLISTED)

describe('sitemap filter', () => {
	it('keeps canonical public routes, including the language-neutral rights page', () => {
		expect(filter(absolute(RIGHTS_PATH))).toBe(true)
		expect(filter(absolute(coursesIndexHref('en')))).toBe(true)
		expect(filter(absolute(courseHref('paper-lanterns', 'ru')))).toBe(true)
		expect(filter(absolute(articleHref('glass-and-light', 'en')))).toBe(true)
		expect(filter(absolute(pageHref('about', 'ru')))).toBe(true)
	})

	it('drops the language-neutral status page (unlinked, noindex)', () => {
		expect(filter(absolute(STATUS_PATH))).toBe(false)
		expect(filter(`${SITE_ORIGIN}/status`)).toBe(false)
	})

	it('drops unlisted documents, albums and photos, with or without a trailing slash', () => {
		for (const path of UNLISTED) expect(filter(absolute(path))).toBe(false)
		expect(filter(`${SITE_ORIGIN}/en/portfolio/hidden-album`)).toBe(false)
		expect(filter(absolute('/en/portfolio/listed-album/'))).toBe(true)
		expect(filter(absolute('/ru/portfolio/listed-album/other-photo/'))).toBe(true)
	})
})

describe('sitemap serialization', () => {
	it('normalizes every entry to a single trailing slash', () => {
		expect(canonicalSitemapUrl(`${SITE_ORIGIN}/en/courses/paper-lanterns`)).toBe(
			absolute(courseHref('paper-lanterns', 'en')),
		)
		expect(canonicalSitemapUrl(absolute(RIGHTS_PATH))).toBe(absolute(RIGHTS_PATH))
		expect(canonicalSitemapUrl(SITE_ORIGIN)).toBe(`${SITE_ORIGIN}/`)
	})
})
