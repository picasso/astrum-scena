import { describe, expect, it } from 'vitest'

import { courseSchema, coursesConfigSchema } from './schema.ts'

describe('course collection schema', () => {
	const base = {
		translationKey: 'course',
		locale: 'ru',
		slug: 'course',
		title: 'Курс',
		status: 'draft',
	}

	it('keeps the course status optional and strictly enumerated', () => {
		expect(courseSchema.parse(base).courseStatus).toBeUndefined()
		expect(courseSchema.parse({ ...base, courseStatus: 'archive' }).courseStatus).toBe(
			'archive',
		)
		expect(courseSchema.parse({ ...base, courseStatus: 'current' }).courseStatus).toBe(
			'current',
		)
		expect(() => courseSchema.parse({ ...base, courseStatus: 'upcoming' })).toThrow()
	})

	it('rejects the page kind a course carried before it had a collection of its own', () => {
		expect(() => courseSchema.parse({ ...base, kind: 'course' })).toThrow(/kind/)
	})
})

describe('modules.courses', () => {
	const defaults = coursesConfigSchema.parse({})

	it('defaults every setting, so `{}` enables the module as it was', () => {
		expect(defaults).toEqual({
			order: 'title',
			currentFirst: 'on',
			moreDocs: {
				source: 'siblings',
				layout: 'list',
				width: 'medium',
				heading: 'on',
				media: 'on',
				excerpt: 'on',
				card: 'details',
				ratio: 'vista',
				order: 'title',
				limit: 'all',
			},
			surface: { width: 'standard', kind: 'list', ratio: 'vista' },
			banner: 'off',
		})
	})

	it('accepts every width with every layout the index implements', () => {
		for (const width of ['prose', 'medium', 'standard', 'gallery'])
			for (const [kind, ratio] of [
				['masonry', 'original'],
				['list', 'vista'],
				['grid', 'landscape'],
			])
				expect(
					coursesConfigSchema.safeParse({ surface: { width, kind, ratio } }).success,
				).toBe(true)
	})

	it('ties the card ratio to the index layout and rejects layouts it does not implement', () => {
		for (const surface of [
			{ width: 'prose', kind: 'justified' },
			{ width: 'prose', kind: 'list', ratio: 'original' },
			{ width: 'prose', kind: 'list', ratio: 'wide' },
		])
			expect(coursesConfigSchema.safeParse({ surface }).success).toBe(false)
		expect(coursesConfigSchema.parse({ surface: { kind: 'grid' } }).surface).toEqual({
			width: 'standard',
			kind: 'grid',
			ratio: 'vista',
		})
	})

	it('takes a moreDocs block written whole and refuses the newest order', () => {
		const masonry = {
			...defaults.moreDocs,
			layout: 'masonry',
			columns: 2,
			gap: 12,
			ratio: 'original',
		}
		expect(coursesConfigSchema.safeParse({ moreDocs: masonry }).success).toBe(true)
		const newest = coursesConfigSchema.safeParse({
			moreDocs: { ...defaults.moreDocs, order: 'newest' },
		})
		expect(newest.success).toBe(false)
		expect(newest.error?.issues[0]).toMatchObject({
			path: ['moreDocs', 'order'],
			message: 'course does not support newest order',
		})
	})

	it('takes off or a photo id as the index banner and rejects an unknown setting', () => {
		expect(coursesConfigSchema.parse({ banner: 'ice-drift' }).banner).toBe('ice-drift')
		expect(coursesConfigSchema.safeParse({ banner: 'Ice-Drift' }).success).toBe(false)
		expect(coursesConfigSchema.safeParse({ order: 'random' }).success).toBe(false)
		expect(coursesConfigSchema.safeParse({ extra: 1 }).success).toBe(false)
	})
})
