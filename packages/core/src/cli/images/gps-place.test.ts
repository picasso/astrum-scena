import { describe, expect, it } from 'vitest'

import { gpsPlaceWarning, proposePlaceId } from './gps-place.ts'
import type { PlaceGpsBound } from './place-gps-bounds.ts'

const places = [
	{ id: 'country-a' },
	{ id: 'region-a', parentId: 'country-a' },
	{ id: 'locality-a', parentId: 'region-a' },
	{ id: 'locality-c', parentId: 'region-a' },
	{ id: 'country-b' },
	{ id: 'fiji' },
]

const bounds: PlaceGpsBound[] = [
	{ placeId: 'country-a', box: { south: 0, west: 0, north: 10, east: 10 } },
	{ placeId: 'region-a', box: { south: 2, west: 2, north: 8, east: 8 } },
	{ placeId: 'locality-a', box: { south: 3, west: 3, north: 5, east: 5 } },
	{ placeId: 'locality-c', box: { south: 4, west: 4, north: 6, east: 6 } },
	{ placeId: 'country-b', box: { south: 9, west: 9, north: 20, east: 20 } },
	// a zone across the antimeridian takes two boxes, each with west < east
	{ placeId: 'fiji', box: { south: -20, west: 177, north: -15, east: 180 } },
	{ placeId: 'fiji', box: { south: -20, west: -180, north: -15, east: -177 } },
]

describe('proposePlaceId', () => {
	it('proposes the most specific nested placeId', () => {
		expect(proposePlaceId({ latitude: 3.5, longitude: 3.5 }, bounds, places)).toEqual({
			proposal: 'locality-a',
		})
		expect(proposePlaceId({ latitude: 2.5, longitude: 2.5 }, bounds, places)).toEqual({
			proposal: 'region-a',
		})
	})

	it('reviews a point no zone contains', () => {
		const result = proposePlaceId({ latitude: 50, longitude: 50 }, bounds, places)
		expect(result.proposal).toBeUndefined()
		expect(result.review?.kind).toBe('no-match')
	})

	it('reviews an overlap of unrelated or sibling places', () => {
		const unrelated = proposePlaceId({ latitude: 9.5, longitude: 9.5 }, bounds, places)
		expect(unrelated.review?.kind).toBe('unrelated-overlap')
		expect(unrelated.review?.detail).toContain('country-a, country-b')
		expect(unrelated.review?.detail).not.toContain('9.5')
		const siblings = proposePlaceId({ latitude: 4.5, longitude: 4.5 }, bounds, places)
		expect(siblings.review?.detail).toContain('locality-a, locality-c')
	})

	it('resolves an antimeridian zone from either box', () => {
		for (const longitude of [178, -178])
			expect(proposePlaceId({ latitude: -17, longitude }, bounds, places)).toEqual({
				proposal: 'fiji',
			})
	})

	it('reviews a proposal that differs from the approved placeId and agrees with an equal one', () => {
		const point = { latitude: 3.5, longitude: 3.5 }
		const conflict = proposePlaceId(point, bounds, places, { approvedPlaceId: 'country-b' })
		expect(conflict.proposal).toBeUndefined()
		expect(conflict.review?.kind).toBe('conflict-with-approved')
		expect(proposePlaceId(point, bounds, places, { approvedPlaceId: 'locality-a' })).toEqual({
			proposal: 'locality-a',
		})
	})
})

describe('gpsPlaceWarning', () => {
	const point = { latitude: 3.5, longitude: 3.5 }

	it('warns on a conflict and on a proposal for a photo without a placeId', () => {
		const conflict = proposePlaceId(point, bounds, places, { approvedPlaceId: 'country-b' })
		expect(gpsPlaceWarning(conflict, 'country-b')).toBe(
			'gps-place: gps proposal "locality-a" conflicts with approved placeId "country-b"',
		)
		expect(gpsPlaceWarning(proposePlaceId(point, bounds, places), undefined)).toBe(
			'gps-place: gps proposes placeId "locality-a", the photo has none',
		)
	})

	it('says nothing when the proposal agrees or nothing is proposed', () => {
		const agreed = proposePlaceId(point, bounds, places, { approvedPlaceId: 'locality-a' })
		expect(gpsPlaceWarning(agreed, 'locality-a')).toBeUndefined()
		const none = proposePlaceId({ latitude: 50, longitude: 50 }, bounds, places)
		expect(gpsPlaceWarning(none, 'locality-a')).toBeUndefined()
		const overlap = proposePlaceId({ latitude: 9.5, longitude: 9.5 }, bounds, places)
		expect(gpsPlaceWarning(overlap, undefined)).toBeUndefined()
	})
})
