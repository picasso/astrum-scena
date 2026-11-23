import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildSiteConfig } from '../../config/fixtures/site-config.ts'
import type { CoursesSiteConfig } from './build-data.ts'

// `courseStatus` and `unlisted` are Tier-1 fields, so they live only on the EN entries here and an
// `en` reference must find them
const course = (
	translationKey: string,
	locale: 'en' | 'ru',
	tier1: { courseStatus?: 'archive' | 'current'; unlisted?: boolean } = {},
) => ({
	id: `${translationKey}.${locale}`,
	data: {
		translationKey,
		locale,
		slug: translationKey,
		title: translationKey,
		status: 'published',
		...tier1,
	},
})

const courses = [
	course('workshop', 'en', { courseStatus: 'current' }),
	course('workshop', 'ru'),
	course('retired', 'en', { courseStatus: 'archive', unlisted: true }),
	course('retired', 'ru'),
]

const enabled: CoursesSiteConfig = {
	content: { locales: ['en', 'ru'], referenceLocale: 'en' },
	modules: buildSiteConfig().modules,
}
const disabled: CoursesSiteConfig = { ...enabled, modules: {} }

const read: string[] = []

async function loadModule() {
	vi.resetModules()
	read.length = 0
	vi.doMock('astro:content', () => ({
		getCollection: (name: string) => {
			read.push(name)
			return Promise.resolve(name === 'courses' ? courses : [])
		},
	}))
	return import('./build-data.ts')
}

afterEach(() => {
	vi.doUnmock('astro:content')
})

const slugs = (documents: readonly { slug: string }[]) => documents.map(({ slug }) => slug)

describe('course loaders', () => {
	it('loads the published courses of the courses collection', async () => {
		const { loadPublishedCourses, courseStaticPaths } = await loadModule()
		expect(slugs(await loadPublishedCourses(enabled))).toEqual(['retired', 'workshop'])
		expect(await courseStaticPaths(enabled)).toEqual([
			{ params: { slug: 'retired' } },
			{ params: { slug: 'workshop' } },
		])
		expect(read).toContain('courses')
	})

	it('drops a course unlisted on the reference locale from the listable set', async () => {
		const { loadListableCourses } = await loadModule()
		expect(slugs(await loadListableCourses(enabled))).toEqual(['workshop'])
	})

	it('reads the status from the reference locale', async () => {
		const { resolvePublishedCourseStatus } = await loadModule()
		expect(await resolvePublishedCourseStatus('retired', enabled)).toBe('archive')
		expect(await resolvePublishedCourseStatus('workshop', enabled)).toBe('current')
		await expect(resolvePublishedCourseStatus('missing', enabled)).rejects.toThrow(
			'no published course "missing"',
		)
	})

	it('has no courses and reads no collection while the module is disabled', async () => {
		const { loadPublishedCourses } = await loadModule()
		expect(await loadPublishedCourses(disabled)).toEqual([])
		expect(read).toEqual([])
	})
})
