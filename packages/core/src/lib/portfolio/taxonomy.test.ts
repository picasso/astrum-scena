import { describe, expect, it } from 'vitest'

import type { DimensionValue, Place, Tag } from '../content/schemas.ts'
import {
	resolveDimensionValues,
	resolvePlaceHierarchy,
	resolvePlaceName,
	resolveTagLabels,
} from './taxonomy.ts'

const places: Place[] = [
	{ id: 'venice', name: { en: 'Venice', ru: 'Венеция' }, kind: 'locality', parentId: 'italy' },
	{ id: 'italy', name: { en: 'Italy', ru: 'Италия' }, kind: 'country' },
]

const tags: Tag[] = [
	{ id: 'sunrise', label: { en: 'Sunrise', ru: 'Рассвет' }, kind: 'moment' },
	{ id: 'water', label: { en: 'Water', ru: 'Вода' }, kind: 'subject' },
]

describe('resolvePlaceName', () => {
	it('returns the localized place name', () => {
		expect(resolvePlaceName('venice', places, 'ru')).toBe('Венеция')
	})

	it('fails closed on an unknown place', () => {
		expect(() => resolvePlaceName('atlantis', places, 'en')).toThrow(/unknown place/)
	})
})

describe('resolvePlaceHierarchy', () => {
	it('returns names ancestor→self following parentId', () => {
		expect(resolvePlaceHierarchy('venice', places, 'en')).toEqual(['Italy', 'Venice'])
		expect(resolvePlaceHierarchy('venice', places, 'ru')).toEqual(['Италия', 'Венеция'])
	})

	it('returns a single name for a root place', () => {
		expect(resolvePlaceHierarchy('italy', places, 'en')).toEqual(['Italy'])
	})

	it('fails closed on an unknown place or missing ancestor', () => {
		expect(() => resolvePlaceHierarchy('atlantis', places, 'en')).toThrow(/unknown place/)
		const orphan: Place[] = [
			{ id: 'x', name: { en: 'X', ru: 'Икс' }, kind: 'locality', parentId: 'ghost' },
		]
		expect(() => resolvePlaceHierarchy('x', orphan, 'en')).toThrow(/unknown place/)
	})

	it('fails closed on a parentId cycle', () => {
		const cyclic: Place[] = [
			{ id: 'a', name: { en: 'A', ru: 'А' }, kind: 'region', parentId: 'b' },
			{ id: 'b', name: { en: 'B', ru: 'Б' }, kind: 'region', parentId: 'a' },
		]
		expect(() => resolvePlaceHierarchy('a', cyclic, 'en')).toThrow(/cycle/)
	})
})

describe('resolveTagLabels', () => {
	it('resolves localized labels preserving the input order', () => {
		expect(resolveTagLabels(['water', 'sunrise'], tags, 'en')).toEqual([
			{ id: 'water', label: 'Water' },
			{ id: 'sunrise', label: 'Sunrise' },
		])
	})

	it('fails closed on an unknown tag', () => {
		expect(() => resolveTagLabels(['sunrise', 'nope'], tags, 'en')).toThrow(/unknown tag/)
	})
})

describe('resolveDimensionValues', () => {
	const declared = {
		events: { label: { en: 'Events', ru: 'События' }, icon: 'calendar-days' },
		people: { label: { en: 'People', ru: 'Люди' } },
	}
	const dictionaries: Record<string, DimensionValue[]> = {
		events: [
			{ id: 'fair', label: { en: 'Fair', ru: 'Ярмарка' } },
			{ id: 'walk', label: { en: 'Walk', ru: 'Прогулка' } },
		],
		people: [{ id: 'ann', label: { en: 'Ann', ru: 'Анна' } }],
	}
	const icon = (name: string) => `<svg data-name="${name}"></svg>`

	it("lists the values in the config's order of dimensions and the photo's order of values", () => {
		expect(
			resolveDimensionValues(
				{ people: ['ann'], events: ['walk', 'fair'] },
				declared,
				dictionaries,
				'ru',
				icon,
			),
		).toEqual([
			{
				dimension: 'events',
				title: 'События',
				icon: '<svg data-name="calendar-days"></svg>',
				id: 'walk',
				label: 'Прогулка',
			},
			{
				dimension: 'events',
				title: 'События',
				icon: '<svg data-name="calendar-days"></svg>',
				id: 'fair',
				label: 'Ярмарка',
			},
			{ dimension: 'people', title: 'Люди', id: 'ann', label: 'Анна' },
		])
	})

	it('gives nothing for a photo without dimensions', () => {
		expect(resolveDimensionValues({}, declared, dictionaries, 'en', icon)).toEqual([])
	})

	it("reads only the photo's own dimensions, not inherited properties", () => {
		const inherited = { ...declared, constructor: { label: { en: 'Built', ru: 'Построено' } } }
		expect(
			resolveDimensionValues({ events: ['fair'] }, inherited, dictionaries, 'en', icon),
		).toEqual([
			{
				dimension: 'events',
				title: 'Events',
				icon: '<svg data-name="calendar-days"></svg>',
				id: 'fair',
				label: 'Fair',
			},
		])
	})

	it('fails closed on an unknown dimension or value', () => {
		expect(() =>
			resolveDimensionValues({ places: ['x'] }, declared, dictionaries, 'en', icon),
		).toThrow('unknown dimension "places"')
		expect(() =>
			resolveDimensionValues({ events: ['nope'] }, declared, dictionaries, 'en', icon),
		).toThrow('unknown events "nope"')
	})
})
