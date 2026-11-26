import { describe, expect, it } from 'vitest'

import { DEFAULT_TAXONOMY } from '../../config/taxonomy.ts'
import type { Place, Tag } from './schemas.ts'
import {
	proposePlace,
	proposeTag,
	resolvePlaceName,
	resolveTagName,
	TaxonomyProposalError,
	type TaxonomySite,
} from './taxonomy-resolve.ts'

const KINDS = { placeKinds: DEFAULT_TAXONOMY.placeKinds, tagKinds: DEFAULT_TAXONOMY.tagKinds }
const SITE: TaxonomySite = { locales: ['en', 'ru'], referenceLocale: 'en', ...KINDS }

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
			proposePlace({ name: { en: 'France', ru: 'Франция' }, kind: 'country' }, PLACES, SITE),
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
				SITE,
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
				SITE,
			).id,
		).toBe('venice-greece')
	})

	it('rejects a country carrying a parentId', () => {
		expect(() =>
			proposePlace(
				{ name: { en: 'Spain', ru: 'Испания' }, kind: 'country', parentId: 'italy' },
				PLACES,
				SITE,
			),
		).toThrow(TaxonomyProposalError)
	})

	it('rejects a non-country without a parentId', () => {
		expect(() =>
			proposePlace({ name: { en: 'Sicily', ru: 'Сицилия' }, kind: 'region' }, PLACES, SITE),
		).toThrow(TaxonomyProposalError)
	})

	it('rejects an unknown parent', () => {
		expect(() =>
			proposePlace(
				{ name: { en: 'Kyoto', ru: 'Киото' }, kind: 'locality', parentId: 'japan' },
				PLACES,
				SITE,
			),
		).toThrow(TaxonomyProposalError)
	})

	it('rejects a parent that is not higher in the hierarchy', () => {
		// venice is a locality; a locality cannot parent another locality.
		expect(() =>
			proposePlace(
				{ name: { en: 'Murano', ru: 'Мурано' }, kind: 'locality', parentId: 'venice' },
				PLACES,
				SITE,
			),
		).toThrow(TaxonomyProposalError)
	})

	it('rejects an empty localized name', () => {
		expect(() =>
			proposePlace({ name: { en: 'Ghost', ru: '' }, kind: 'country' }, PLACES, SITE),
		).toThrow(TaxonomyProposalError)
	})
})

describe('proposePlace on the site locales', () => {
	it('proposes a place with the one locale of a one-locale site', () => {
		expect(
			proposePlace({ name: { en: 'France' }, kind: 'country' }, PLACES, {
				locales: ['en'],
				referenceLocale: 'en',
				...KINDS,
			}),
		).toEqual({ id: 'france', name: { en: 'France' }, kind: 'country' })
	})

	it('names a locale outside content.locales and a missing one', () => {
		const site: TaxonomySite = { locales: ['en'], referenceLocale: 'en', ...KINDS }
		expect(() =>
			proposePlace({ name: { en: 'France', ru: 'Франция' }, kind: 'country' }, PLACES, site),
		).toThrow('place name.ru: not one of content.locales [en]')
		expect(() =>
			proposePlace({ name: { en: 'France' }, kind: 'country' }, PLACES, SITE),
		).toThrow('place name.ru: missing the "ru" text required by content.locales')
	})

	it('takes the id from the reference locale, past one without Latin letters', () => {
		const name = { en: 'Lake Garda', ru: 'Озеро Гарда' }
		expect(
			proposePlace({ name, kind: 'country' }, PLACES, {
				locales: ['en', 'ru'],
				referenceLocale: 'ru',
				...KINDS,
			}).id,
		).toBe('lake-garda')
	})

	it('takes the id from the reference locale, not from the first one of the list', () => {
		const name = { en: 'Lake Garda', ru: 'Garda Lago' }
		expect(
			proposePlace({ name, kind: 'country' }, PLACES, {
				locales: ['en', 'ru'],
				referenceLocale: 'ru',
				...KINDS,
			}).id,
		).toBe('garda-lago')
	})

	it('finds an existing place by the name of a one-locale record', () => {
		const places: Place[] = [{ id: 'harbor', name: { en: 'Harbor' }, kind: 'country' }]
		expect(resolvePlaceName('Harbor', places)).toEqual({ status: 'exists', id: 'harbor' })
		expect(resolvePlaceName('Harbour', places)).toEqual({
			status: 'close',
			candidates: [expect.objectContaining({ id: 'harbor' })],
		})
	})
})

describe('proposeTag', () => {
	it('builds a new tag from the reference-locale label', () => {
		expect(
			proposeTag(
				{ label: { en: 'Long Exposure', ru: 'Длинная выдержка' }, kind: 'technique' },
				TAGS,
				SITE,
			),
		).toEqual({
			id: 'long-exposure',
			label: { en: 'Long Exposure', ru: 'Длинная выдержка' },
			kind: 'technique',
		})
	})

	it('resolves an id collision with the kind', () => {
		expect(
			proposeTag({ label: { en: 'Fog', ru: 'Туман' }, kind: 'condition' }, TAGS, SITE).id,
		).toBe('fog-condition')
	})

	it('rejects an empty localized label', () => {
		expect(() =>
			proposeTag({ label: { en: '', ru: 'Туман' }, kind: 'motif' }, TAGS, SITE),
		).toThrow(TaxonomyProposalError)
	})
})

// a site with its own kinds (`content.taxonomy`): a kind's rank is its position in the list, and the
// first kind is the root of the hierarchy
describe('proposals on the site kinds', () => {
	const site: TaxonomySite = {
		locales: ['en'],
		referenceLocale: 'en',
		placeKinds: ['land', 'spot'],
		tagKinds: ['mood'],
	}
	const places: Place[] = [{ id: 'coastland', name: { en: 'Coastland' }, kind: 'land' }]

	it('builds a root kind without a parent and a lower one under it', () => {
		expect(proposePlace({ name: { en: 'Northland' }, kind: 'land' }, places, site)).toEqual({
			id: 'northland',
			name: { en: 'Northland' },
			kind: 'land',
		})
		expect(
			proposePlace(
				{ name: { en: 'Amber Bay' }, kind: 'spot', parentId: 'coastland' },
				places,
				site,
			),
		).toEqual({
			id: 'amber-bay',
			name: { en: 'Amber Bay' },
			kind: 'spot',
			parentId: 'coastland',
		})
	})

	it('rejects a root with a parent, a lower kind without one and a parent of the same rank', () => {
		expect(() =>
			proposePlace(
				{ name: { en: 'Northland' }, kind: 'land', parentId: 'coastland' },
				places,
				site,
			),
		).toThrow('a land place must not have a parentId')
		expect(() => proposePlace({ name: { en: 'Cove' }, kind: 'spot' }, places, site)).toThrow(
			'a spot place requires a parentId',
		)
		const spots: Place[] = [
			...places,
			{ id: 'cove', name: { en: 'Cove' }, kind: 'spot', parentId: 'coastland' },
		]
		expect(() =>
			proposePlace({ name: { en: 'Pier' }, kind: 'spot', parentId: 'cove' }, spots, site),
		).toThrow('parent "cove" (spot) must be higher in the hierarchy than a spot')
	})

	it('names the list for a kind outside it', () => {
		expect(() =>
			proposePlace({ name: { en: 'France' }, kind: 'country' }, places, site),
		).toThrow('"country" is not one of content.taxonomy.placeKinds [land, spot]')
		expect(proposeTag({ label: { en: 'Calm' }, kind: 'mood' }, [], site)).toEqual({
			id: 'calm',
			label: { en: 'Calm' },
			kind: 'mood',
		})
		expect(() => proposeTag({ label: { en: 'Fog' }, kind: 'subject' }, [], site)).toThrow(
			'"subject" is not one of content.taxonomy.tagKinds [mood]',
		)
	})
})
