import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { z } from 'astro/zod'
import { afterAll, describe, expect, it } from 'vitest'

import { buildSiteConfig } from '../config/fixtures/site-config.ts'
import { writeSiteConfig } from '../config/fixtures/site-files.ts'
import { resolveSiteLock, siteConfigError } from '../config/lock.ts'
import { siteSchema } from '../config/site-schema.ts'
import { coreRoutes } from '../integration-parts.ts'
import { coursesModule } from './courses/manifest.ts'
import { coursesConfigSchema } from './courses/schema.ts'
import { defineModule, type ModuleManifest } from './manifest.ts'
import {
	dependencyIssues,
	disabledMenuSegmentIssues,
	disabledModuleContentErrors,
	enabledModules,
	isCollectionDefined,
	MODULE_IDS,
	MODULES,
	unknownMenuSegmentIssues,
} from './registry.ts'

const scratch: string[] = []
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { force: true, recursive: true })
})
const makeRoot = (files: Record<string, string> = {}): string => {
	const root = mkdtempSync(path.join(tmpdir(), 'astrum-scena-modules-'))
	scratch.push(root)
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
		writeFileSync(path.join(root, file), text)
	}
	return root
}

// a module of the fixture registry only: it needs `courses`, and `guides` needs a module the core
// does not have
const fixtureModule = (id: string, dependsOn: string[]): ModuleManifest =>
	defineModule({
		id,
		collections: {},
		pagesDir: '/nowhere',
		segments: [id],
		config: z.object({}).strict(),
		i18n: { namespace: id, dictionaries: {} },
		mdx: [],
		directives: [],
		tokens: [],
		menu: [id],
		dependsOn,
		moreDocsKinds: [],
	})
const FIXTURE_MODULES = [
	coursesModule,
	fixtureModule('tours', ['courses']),
	fixtureModule('guides', ['maps']),
]

const config = buildSiteConfig()
const withoutCourses = {
	...config,
	modules: {},
	menu: { ...config.menu, items: config.menu.items.filter((item) => item.segment !== 'courses') },
}
const resolveError = (site: object): string => {
	const root = writeSiteConfig(makeRoot(), site)
	try {
		resolveSiteLock(root)
	} catch (error) {
		return (error as Error).message
	}
	throw new Error('resolve did not fail')
}

describe('module registry', () => {
	it('lists courses as the only module, the reference one', () => {
		expect(MODULE_IDS).toEqual(['courses'])
		expect(MODULES).toEqual([coursesModule])
	})

	it('enables exactly the modules with a section in the config', () => {
		expect(enabledModules(config)).toEqual([coursesModule])
		expect(enabledModules(withoutCourses)).toEqual([])
	})

	it('defines the core collections always and a module collection only while it is enabled', () => {
		expect(isCollectionDefined(withoutCourses, 'pages')).toBe(true)
		expect(isCollectionDefined(withoutCourses, 'courses')).toBe(false)
		expect(isCollectionDefined(config, 'courses')).toBe(true)
	})
})

describe('courses manifest', () => {
	it('declares its collection, segment, menu segment, namespace and the empty fields', () => {
		expect(Object.keys(coursesModule.collections)).toEqual(['courses'])
		expect(coursesModule.collections.courses!.source.base).toBe('./src/content/courses')
		expect(coursesModule.segments).toEqual(['courses'])
		expect(coursesModule.menu).toEqual(['courses'])
		expect(coursesModule.mdx).toEqual([])
		expect(coursesModule.directives).toEqual([])
		expect(coursesModule.dependsOn).toEqual([])
	})

	it('routes its own pages under its segment', () => {
		expect(coreRoutes(coursesModule.pagesDir).map((route) => route.pattern)).toEqual([
			'/[locale]/courses/[slug]',
			'/[locale]/courses',
		])
	})

	it('keeps every dictionary key in its namespace, with the same keys in every locale', () => {
		const dictionaries = Object.values(coursesModule.i18n.dictionaries)
		expect(dictionaries.length).toBeGreaterThan(0)
		const keys = Object.keys(dictionaries[0]!).sort()
		for (const dictionary of dictionaries) {
			expect(Object.keys(dictionary!).sort()).toEqual(keys)
			for (const key of keys) expect(key.startsWith('courses.')).toBe(true)
		}
	})
})

describe('modules.<id> of site.yaml', () => {
	it('enables a module with an empty section and its defaults', () => {
		const parsed = siteSchema.parse({ ...config, modules: { courses: {} } })
		expect(parsed.modules.courses).toEqual(coursesConfigSchema.parse({}))
		expect(parsed.modules.courses).toMatchObject({
			order: 'title',
			currentFirst: 'on',
			banner: 'off',
		})
	})

	it('fails on an unknown module, naming the known ones', () => {
		expect(resolveError({ ...config, modules: { ...config.modules, tours: {} } })).toBe(
			'site.yaml: modules.tours: unknown module; known: courses',
		)
	})

	it("checks a module's settings with its own schema, naming the key", () => {
		expect(resolveError({ ...config, modules: { courses: { order: 'random' } } })).toContain(
			'site.yaml: modules.courses.order: ',
		)
		expect(resolveError({ ...config, modules: { courses: { extra: 1 } } })).toBe(
			'site.yaml: modules.courses.extra: unrecognized key',
		)
	})

	it('fails on a menu item of a disabled module, naming the item', () => {
		expect(resolveError({ ...withoutCourses, menu: config.menu })).toBe(
			'site.yaml: menu.items.2.segment: "courses" belongs to module "courses", which is not enabled',
		)
	})
})

describe('dependencyIssues', () => {
	it('passes a module whose dependencies are enabled', () => {
		expect(dependencyIssues(['courses', 'tours'], FIXTURE_MODULES)).toEqual([])
		expect(dependencyIssues([], FIXTURE_MODULES)).toEqual([])
	})

	it('names a dependency on a disabled module', () => {
		expect(dependencyIssues(['tours'], FIXTURE_MODULES)).toEqual([
			{
				path: ['modules', 'tours'],
				message: 'depends on module "courses", which is not enabled',
			},
		])
	})

	it('names a dependency on a module the core does not have', () => {
		expect(siteConfigError(dependencyIssues(['guides'], FIXTURE_MODULES)).message).toBe(
			'site.yaml: modules.guides: depends on unknown module "maps"; known: courses, tours, guides',
		)
	})
})

describe('menu segments', () => {
	const items = [{ segment: 'portfolio' }, { segment: 'courses' }, { segment: 'tours' }]

	it('names the item of a disabled module', () => {
		expect(disabledMenuSegmentIssues(items, [], FIXTURE_MODULES)).toEqual([
			{
				path: ['menu', 'items', 1, 'segment'],
				message: '"courses" belongs to module "courses", which is not enabled',
			},
			{
				path: ['menu', 'items', 2, 'segment'],
				message: '"tours" belongs to module "tours", which is not enabled',
			},
		])
		expect(disabledMenuSegmentIssues(items, ['courses', 'tours'], FIXTURE_MODULES)).toEqual([])
	})

	it('names a segment no section serves, listing the known ones', () => {
		expect(
			siteConfigError(unknownMenuSegmentIssues(items, ['portfolio', 'courses', 'about']))
				.message,
		).toBe(
			'site.yaml: menu.items.2.segment: "tours" is not a known segment; known: about, courses, portfolio',
		)
	})
})

describe('disabledModuleContentErrors', () => {
	it('fails on content of a disabled module', () => {
		const root = makeRoot({ 'src/content/courses/night.en.md': '---\n---\n' })
		expect(disabledModuleContentErrors(root, [])).toEqual([
			'src/content/courses: content of module "courses", which is not enabled in site.yaml (modules.courses)',
		])
	})

	it('counts a link in the content directory as content', () => {
		const root = makeRoot({ 'elsewhere/night.en.md': '---\n---\n' })
		mkdirSync(path.join(root, 'src/content/courses'), { recursive: true })
		symlinkSync(
			path.join(root, 'elsewhere/night.en.md'),
			path.join(root, 'src/content/courses/night.en.md'),
		)
		expect(disabledModuleContentErrors(root, [])).toEqual([
			'src/content/courses: content of module "courses", which is not enabled in site.yaml (modules.courses)',
		])
	})

	it('passes the content of an enabled module, an empty directory and hidden files', () => {
		expect(
			disabledModuleContentErrors(
				makeRoot({ 'src/content/courses/night.en.md': '---\n---\n' }),
				['courses'],
			),
		).toEqual([])
		expect(
			disabledModuleContentErrors(makeRoot({ 'src/content/courses/.DS_Store': '' }), []),
		).toEqual([])
		expect(disabledModuleContentErrors(makeRoot(), [])).toEqual([])
	})
})
