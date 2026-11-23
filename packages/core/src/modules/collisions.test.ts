import { z } from 'astro/zod'
import { describe, expect, it } from 'vitest'

import { COLLECTION_SOURCES } from '../config/collection-sources.ts'
import { coreSegments } from '../integration-parts.ts'
import { type CoreNames, coreNames, moduleCollisions, slugCollisions } from './collisions.ts'
import { coursesModule } from './courses/manifest.ts'
import { defineModule, type ModuleManifest } from './manifest.ts'
import { MODULES } from './registry.ts'

// a fixture module that owns nothing but its id, its segment and its namespace unless told otherwise
const fixtureModule = (id: string, fields: Partial<ModuleManifest> = {}): ModuleManifest =>
	defineModule({
		id,
		collections: {},
		pagesDir: '/nowhere',
		segments: [id],
		config: z.object({}).strict(),
		i18n: { namespace: id, dictionaries: { en: { [`${id}.title`]: 'Title' } } },
		mdx: [],
		directives: [],
		tokens: [],
		menu: [id],
		dependsOn: [],
		moreDocsKinds: [],
		...fields,
	})

const collection = (base: string) => ({
	source: { base, pattern: '**/*.md' },
	schema: z.object({}),
	versions: [1] as const,
})

// the core's names as a fixture, so a check does not depend on today's core
const CORE: CoreNames = {
	collections: {
		albums: { base: './src/content/albums' },
		pages: { base: './src/content/pages' },
	},
	segments: ['portfolio', 'articles'],
	mdx: ['Gallery'],
	directives: ['callout'],
	tokens: ['--color-accent'],
	namespaces: ['nav', 'footer'],
}

const collisions = (...modules: ModuleManifest[]) => moduleCollisions(modules, CORE)

describe('the core and its modules', () => {
	it('have no collision between the core and the modules of the registry', () => {
		expect(moduleCollisions(MODULES)).toEqual([])
	})

	it('read the core names from the sources the core reads', () => {
		const names = coreNames()
		expect(names.collections).toBe(COLLECTION_SOURCES)
		expect(names.segments).toEqual(coreSegments())
		expect(names.segments).toContain('articles')
		expect(names.mdx).toContain('Gallery')
		expect(names.directives).toContain('callout')
		expect(names.tokens).toContain('--color-accent')
		expect(names.namespaces).toContain('nav')
		expect(names.namespaces).not.toContain('courses')
	})
})

describe('moduleCollisions', () => {
	it('passes modules whose names are their own', () => {
		expect(
			collisions(
				fixtureModule('tours', {
					collections: { tours: collection('./src/content/tours') },
				}),
				fixtureModule('guides'),
			),
		).toEqual([])
	})

	it('names a module id declared twice', () => {
		expect(collisions(fixtureModule('courses'), fixtureModule('courses'))).toEqual([
			'module id "courses" is declared twice',
		])
	})

	it("names a collection of the core's", () => {
		expect(
			collisions(
				fixtureModule('x', { collections: { albums: collection('./src/content/x') } }),
			),
		).toEqual(['module "x": collection "albums" is the core\'s'])
	})

	it('names a source equal to, inside or around the source of a core collection', () => {
		expect(
			collisions(
				fixtureModule('x', {
					collections: {
						a: collection('./src/content/pages/x'),
						b: collection('src/content/albums/'),
						c: collection('./src/content'),
					},
				}),
			),
		).toEqual([
			'module "x": collection "a" source "./src/content/pages/x" is inside the core collection "pages"',
			'module "x": collection "b" source "src/content/albums/" is the source of the core collection "albums"',
			'module "x": collection "c" source "./src/content" contains the core collection "albums"',
		])
	})

	it('names a collection and a source of an earlier module', () => {
		expect(
			collisions(
				fixtureModule('a', { collections: { tours: collection('./src/content/tours') } }),
				fixtureModule('b', { collections: { tours: collection('./src/content/tours') } }),
			),
		).toEqual([
			'module "b": collection "tours" is module "a"\'s',
			'module "b": collection "tours" source "./src/content/tours" is the source of collection "tours" of module "a"',
		])
	})

	it('names two collections of one module that read the same files', () => {
		expect(
			collisions(
				fixtureModule('x', {
					collections: {
						a: collection('./src/content/x'),
						b: collection('./src/content/x/'),
						c: collection('./src/content/x/deep'),
					},
				}),
			),
		).toEqual([
			'module "x": collection "b" source "./src/content/x/" is the source of collection "a" of module "x"',
			'module "x": collection "c" source "./src/content/x/deep" is inside collection "a" of module "x"',
		])
	})

	it('takes the site root as a source around every core collection', () => {
		for (const base of ['.', './'])
			expect(
				collisions(fixtureModule('x', { collections: { a: collection(base) } })),
			).toEqual([
				`module "x": collection "a" source "${base}" contains the core collection "albums"`,
			])
	})

	it("names a segment of the core's or of another module", () => {
		expect(collisions(fixtureModule('x', { segments: ['articles'], menu: [] }))).toEqual([
			'module "x": segment "articles" is the core\'s',
		])
		expect(
			collisions(
				fixtureModule('a', { segments: ['tours'] }),
				fixtureModule('b', { segments: ['tours'] }),
			),
		).toEqual(['module "b": segment "tours" is module "a"\'s'])
	})

	it('names a menu segment another owner serves', () => {
		expect(collisions(fixtureModule('x', { menu: ['x', 'portfolio'] }))).toEqual([
			'module "x": menu segment "portfolio" is the core\'s',
		])
		expect(collisions(fixtureModule('a'), fixtureModule('b', { menu: ['a'] }))).toEqual([
			'module "b": menu segment "a" is module "a"\'s',
		])
	})

	it("names an MDX component and a directive of the core's", () => {
		expect(
			collisions(fixtureModule('x', { mdx: ['Gallery'], directives: ['callout'] })),
		).toEqual([
			'module "x": MDX component "Gallery" is the core\'s',
			'module "x": directive "callout" is the core\'s',
		])
		expect(
			collisions(
				fixtureModule('a', { mdx: ['Map'], directives: ['route'] }),
				fixtureModule('b', { mdx: ['Map'], directives: ['route'] }),
			),
		).toEqual([
			'module "b": MDX component "Map" is module "a"\'s',
			'module "b": directive "route" is module "a"\'s',
		])
	})

	it('names a token of the theme contract or of another module', () => {
		expect(collisions(fixtureModule('x', { tokens: ['--color-accent'] }))).toEqual([
			'module "x": token "--color-accent" is the core\'s',
		])
		expect(
			collisions(
				fixtureModule('a', { tokens: ['--tour-badge'] }),
				fixtureModule('b', { tokens: ['--tour-badge'] }),
			),
		).toEqual(['module "b": token "--tour-badge" is module "a"\'s'])
	})

	it("names a namespace of the core's or of another module", () => {
		expect(
			collisions(
				fixtureModule('x', {
					i18n: { namespace: 'nav', dictionaries: { en: { 'nav.tours': 'Tours' } } },
				}),
			),
		).toEqual(['module "x": namespace "nav" is the core\'s'])
		expect(
			collisions(
				fixtureModule('x', {
					i18n: {
						namespace: 'nav.extra',
						dictionaries: { en: { 'nav.extra.tours': 'Tours' } },
					},
				}),
			),
		).toEqual(['module "x": namespace "nav.extra" is the core\'s'])
		expect(
			collisions(
				fixtureModule('a', {
					i18n: { namespace: 'shared', dictionaries: { en: { 'shared.a': 'A' } } },
				}),
				fixtureModule('b', {
					i18n: { namespace: 'shared', dictionaries: { en: { 'shared.b': 'B' } } },
				}),
			),
		).toEqual(['module "b": namespace "shared" is module "a"\'s'])
		expect(
			collisions(
				fixtureModule('a', {
					i18n: { namespace: 'shared', dictionaries: { en: { 'shared.a': 'A' } } },
				}),
				fixtureModule('b', {
					i18n: { namespace: 'shared.b', dictionaries: { en: { 'shared.b.x': 'B' } } },
				}),
			),
		).toEqual(['module "b": namespace "shared.b" is module "a"\'s'])
	})

	it('names a key outside the namespace of its module, in any locale', () => {
		expect(
			collisions(
				fixtureModule('courses', {
					i18n: {
						namespace: 'courses',
						dictionaries: {
							en: { 'courses.title': 'Courses' },
							ru: { 'courses.title': 'Курсы', 'x.y': 'Икс' },
						},
					},
				}),
			),
		).toEqual(['module "courses": key "x.y" is outside namespace "courses"'])
	})

	it('reports every collision at once', () => {
		expect(
			collisions(fixtureModule('x', { segments: ['articles'], tokens: ['--color-accent'] })),
		).toHaveLength(2)
	})
})

describe('slugCollisions', () => {
	const pages = [
		{ id: 'privacy', slug: 'privacy' },
		{ id: 'workshops', slug: 'courses' },
		{ id: 'writing', slug: 'articles' },
	]

	it('names a page whose slug is the route segment of an enabled module or of the core', () => {
		expect(slugCollisions(pages, [coursesModule], ['portfolio', 'articles'])).toEqual([
			'page "workshops": slug "courses" is the route segment of module "courses"',
			'page "writing": slug "articles" is the route segment of the core',
		])
	})

	it('builds a page under the segment of a disabled module, which has no route', () => {
		expect(slugCollisions(pages, [], ['portfolio'])).toEqual([])
	})

	it("takes the core's segments from its pages by default", () => {
		expect(slugCollisions([{ id: 'writing', slug: 'articles' }], [])).toEqual([
			'page "writing": slug "articles" is the route segment of the core',
		])
	})
})
