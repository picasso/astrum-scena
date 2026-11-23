import { describe, expect, it } from 'vitest'

import type { Place, Tag } from './schemas.ts'
import {
	proposePlace,
	proposeTag,
	resolvePlaceName,
	resolveTagName,
	TaxonomyProposalError,
} from './taxonomy-resolve.ts'

const PLACES: Place[] = [
	{ id: 'italy', name: { en: 'Italy', ru: 'Италия' }, kind: 'country' },
	{ id: 'greece', name: { en: 'Greece', ru: 'Греция' }, kind: 'country' },
	{ id: 'tuscany', name: { en: 'Tuscany', ru: 'Тоскана' }, kind: 'region', parentId: 'italy' },
	{ id: 'venice', name: { en: 'Venice', ru: 'Венеция' }, kind: 'locality', parentId: 'italy' },
]

const TAGS: Tag[] = [{ id: 'fog', label: { en: 'Fog', ru: 'Туман' }, kind: 'motif' }]

describe('resolvePlaceName', () => {
	it('matches an existing place by id, EN name, or RU name', () => {
		expect(resolvePlaceName('venice', PLACES)).toEqual({ status: 'exists', id: 'venice' })
		expect(resolvePlaceName('Venice', PLACES)).toEqual({ status: 'exists', id: 'venice' })
		expect(resolvePlaceName('Венеция', PLACES)).toEqual({ status: 'exists', id: 'venice' })
	})

	it('flags a close typo as a reuse candidate instead of a new entry', () => {
		const result = resolvePlaceName('Venise', PLACES)
		expect(result.status).toBe('close')
		if (result.status === 'close') {
			expect(result.candidates[0]!.id).toBe('venice')
			expect(result.candidates[0]!.score).toBeGreaterThanOrEqual(0.8)
		}
	})

	it('returns new for an unrelated name and for an empty query', () => {
		expect(resolvePlaceName('Reykjavik', PLACES)).toEqual({ status: 'new' })
		expect(resolvePlaceName('   ', PLACES)).toEqual({ status: 'new' })
	})

	it('matches across non-decomposing Latin letters via shared ASCII folding', () => {
		const places: Place[] = [
			{
				id: 'tromso',
				name: { en: 'Tromsø', ru: 'Тромсё' },
				kind: 'locality',
				parentId: 'norway',
			},
		]
		expect(resolvePlaceName('Tromso', places)).toEqual({ status: 'exists', id: 'tromso' })
	})
})

describe('resolveTagName', () => {
	it('matches an existing tag and flags a new one', () => {
		expect(resolveTagName('Туман', TAGS)).toEqual({ status: 'exists', id: 'fog' })
		expect(resolveTagName('Long Exposure', TAGS)).toEqual({ status: 'new' })
	})
})

describe('proposePlace', () => {
	it('builds a country without a parent', () => {
		expect(
			proposePlace({ name: { en: 'France', ru: 'Франция' }, kind: 'country' }, PLACES),
		).toEqual({ id: 'france', name: { en: 'France', ru: 'Франция' }, kind: 'country' })
	})

	it('builds a locality under a higher-ranked parent', () => {
		expect(
			proposePlace(
				{
					name: { en: 'Florence', ru: 'Флоренция' },
					kind: 'locality',
					parentId: 'tuscany',
				},
				PLACES,
			),
		).toEqual({
			id: 'florence',
			name: { en: 'Florence', ru: 'Флоренция' },
			kind: 'locality',
			parentId: 'tuscany',
		})
	})

	it('resolves an id collision with the parent, never an ordinal', () => {
		expect(
			proposePlace(
				{ name: { en: 'Venice', ru: 'Венеция' }, kind: 'locality', parentId: 'greece' },
				PLACES,
			).id,
		).toBe('venice-greece')
	})

	it('rejects a country carrying a parentId', () => {
		expect(() =>
			proposePlace(
				{ name: { en: 'Spain', ru: 'Испания' }, kind: 'country', parentId: 'italy' },
				PLACES,
			),
		).toThrow(TaxonomyProposalError)
	})

	it('rejects a non-country without a parentId', () => {
		expect(() =>
			proposePlace({ name: { en: 'Sicily', ru: 'Сицилия' }, kind: 'region' }, PLACES),
		).toThrow(TaxonomyProposalError)
	})

	it('rejects an unknown parent', () => {
		expect(() =>
			proposePlace(
				{ name: { en: 'Kyoto', ru: 'Киото' }, kind: 'locality', parentId: 'japan' },
				PLACES,
			),
		).toThrow(TaxonomyProposalError)
	})

	it('rejects a parent that is not higher in the hierarchy', () => {
		// venice is a locality; a locality cannot parent another locality.
		expect(() =>
			proposePlace(
				{ name: { en: 'Murano', ru: 'Мурано' }, kind: 'locality', parentId: 'venice' },
				PLACES,
			),
		).toThrow(TaxonomyProposalError)
	})

	it('rejects an empty localized name', () => {
		expect(() =>
			proposePlace({ name: { en: 'Ghost', ru: '' }, kind: 'country' }, PLACES),
		).toThrow(TaxonomyProposalError)
	})
})

describe('proposeTag', () => {
	it('builds a new tag from the EN label', () => {
		expect(
			proposeTag(
				{ label: { en: 'Long Exposure', ru: 'Длинная выдержка' }, kind: 'technique' },
				TAGS,
			),
		).toEqual({
			id: 'long-exposure',
			label: { en: 'Long Exposure', ru: 'Длинная выдержка' },
			kind: 'technique',
		})
	})

	it('resolves an id collision with the kind', () => {
		expect(proposeTag({ label: { en: 'Fog', ru: 'Туман' }, kind: 'condition' }, TAGS).id).toBe(
			'fog-condition',
		)
	})

	it('rejects an empty localized label', () => {
		expect(() => proposeTag({ label: { en: '', ru: 'Туман' }, kind: 'motif' }, TAGS)).toThrow(
			TaxonomyProposalError,
		)
	})
})
