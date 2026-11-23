import { describe, expect, it } from 'vitest'

import { applyOrder, applyPriority, type GalleryOrderItem, orderGalleryItems } from './order.ts'

const item = (imageId: string, extra: Partial<GalleryOrderItem> = {}): GalleryOrderItem => ({
	imageId,
	favorite: false,
	...extra,
})

const ids = (items: readonly GalleryOrderItem[]): string[] => items.map((entry) => entry.imageId)

describe('applyOrder', () => {
	const pool: GalleryOrderItem[] = [
		item('a', { favorite: false, publishedAt: '2020-01-01', capturedAt: '2011-06' }),
		item('b', { favorite: true, publishedAt: '2022-05-05', capturedAt: '2011' }),
		item('c', { favorite: false, publishedAt: '2019-03-03' }), // no capturedAt
		item('d', { favorite: true, publishedAt: '2021-07-07', capturedAt: '2015-02' }),
	]

	it('source keeps the input order', () => {
		expect(ids(applyOrder(pool, 'source'))).toEqual(['a', 'b', 'c', 'd'])
	})

	it('favorites-first is a stable partition preserving inner order', () => {
		expect(ids(applyOrder(pool, 'favorites-first'))).toEqual(['b', 'd', 'a', 'c'])
	})

	it('published-newest / -oldest sort by publishedAt', () => {
		expect(ids(applyOrder(pool, 'published-newest'))).toEqual(['b', 'd', 'a', 'c'])
		expect(ids(applyOrder(pool, 'published-oldest'))).toEqual(['c', 'a', 'd', 'b'])
	})

	it('captured-* sort by capturedAt and always push missing dates to the end', () => {
		// keys: a=2011-06, b=2011(->201100), d=2015-02 ; c has none -> end in BOTH directions
		expect(ids(applyOrder(pool, 'captured-newest'))).toEqual(['d', 'a', 'b', 'c'])
		expect(ids(applyOrder(pool, 'captured-oldest'))).toEqual(['b', 'a', 'd', 'c'])
	})

	it('preserves source order on ties', () => {
		const tied = [
			item('x', { publishedAt: '2020-01-01' }),
			item('y', { publishedAt: '2020-01-01' }),
			item('z', { publishedAt: '2020-01-01' }),
		]
		expect(ids(applyOrder(tied, 'published-newest'))).toEqual(['x', 'y', 'z'])
	})

	it('does not mutate the input', () => {
		const input = [...pool]
		applyOrder(input, 'published-oldest')
		expect(ids(input)).toEqual(['a', 'b', 'c', 'd'])
	})
})

describe('applyPriority', () => {
	const pool = [item('a'), item('b'), item('c'), item('d')]

	it('promotes priority ids to the top in the given order, rest keep order', () => {
		expect(ids(applyPriority(pool, ['c', 'a']))).toEqual(['c', 'a', 'b', 'd'])
	})

	it('silently skips a priority id absent from the set (not an error)', () => {
		expect(ids(applyPriority(pool, ['zzz', 'b']))).toEqual(['b', 'a', 'c', 'd'])
	})

	it('returns a copy when priority is empty', () => {
		expect(ids(applyPriority(pool, []))).toEqual(['a', 'b', 'c', 'd'])
	})
})

describe('orderGalleryItems', () => {
	it('applies order first, then priority on top', () => {
		const pool = [
			item('a', { favorite: false }),
			item('b', { favorite: true }),
			item('c', { favorite: true }),
		]
		// favorites-first -> b,c,a ; priority [a] -> a,b,c
		expect(ids(orderGalleryItems(pool, 'favorites-first', ['a']))).toEqual(['a', 'b', 'c'])
	})
})
