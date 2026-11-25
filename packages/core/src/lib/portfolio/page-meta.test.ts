import { describe, expect, it } from 'vitest'

import { buildLocaleMeta, unlistedRobots } from './page-meta.ts'

const ORIGIN = 'https://site.test'
const BILINGUAL = ['en', 'ru'] as const

describe('buildLocaleMeta', () => {
	it('makes the current route self-canonical (absolute)', () => {
		const meta = buildLocaleMeta('/en/portfolio/sunrises/', ORIGIN, BILINGUAL)
		expect(meta.canonical).toBe('https://site.test/en/portfolio/sunrises/')
	})

	it('emits both locale alternates, preserving the nested album/photo suffix and trailing slash', () => {
		const meta = buildLocaleMeta('/en/portfolio/sunrises/morning-ridge/', ORIGIN, BILINGUAL)
		expect(meta.alternates).toEqual([
			{
				hreflang: 'en',
				href: 'https://site.test/en/portfolio/sunrises/morning-ridge/',
			},
			{
				hreflang: 'ru',
				href: 'https://site.test/ru/portfolio/sunrises/morning-ridge/',
			},
			{
				hreflang: 'x-default',
				href: 'https://site.test/en/portfolio/sunrises/morning-ridge/',
			},
		])
	})

	it('switches only the locale prefix for the ru route', () => {
		const meta = buildLocaleMeta('/ru/portfolio/', ORIGIN, BILINGUAL)
		expect(meta.canonical).toBe('https://site.test/ru/portfolio/')
		expect(meta.alternates.map((alt) => alt.href)).toEqual([
			'https://site.test/en/portfolio/',
			'https://site.test/ru/portfolio/',
			'https://site.test/en/portfolio/',
		])
	})

	it('makes the first active locale x-default', () => {
		const meta = buildLocaleMeta('/en/portfolio/', ORIGIN, ['ru', 'en'])
		expect(meta.alternates.at(-1)).toEqual({
			hreflang: 'x-default',
			href: 'https://site.test/ru/portfolio/',
		})
	})

	it('emits no alternates on a one-locale site and keeps the canonical', () => {
		for (const locale of ['en', 'ru'] as const) {
			const meta = buildLocaleMeta(`/${locale}/portfolio/`, ORIGIN, [locale])
			expect(meta).toEqual({
				canonical: `https://site.test/${locale}/portfolio/`,
				alternates: [],
			})
		}
	})
})

describe('unlistedRobots', () => {
	it('opts unlisted pages out of indexing and leaves listed ones without robots meta', () => {
		expect(unlistedRobots(true)).toBe('noindex,follow')
		expect(unlistedRobots(false)).toBeUndefined()
	})
})
