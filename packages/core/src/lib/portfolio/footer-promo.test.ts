import { describe, expect, it } from 'vitest'

import type { AlbumData, PhotoData } from '../content/schemas.ts'
import {
	buildPromoCandidates,
	type FooterPromoOptions,
	type PromoCandidate,
	selectFooterPromo,
} from './footer-promo.ts'
import type { AlbumEntry, PhotoEntry } from './publication.ts'

type PhotoOverrides = Partial<Pick<PhotoData, 'status' | 'publishedAt' | 'favorite' | 'unlisted'>>

const photo = (id: string, overrides: PhotoOverrides = {}): PhotoEntry => ({
	id,
	data: {
		title: { en: id, ru: id },
		status: 'published',
		publishedAt: '2020-01-01',
		favorite: false,
		tags: [],
		...overrides,
	},
})

const album = (
	id: string,
	photoIds: string[],
	status: AlbumData['status'] = 'published',
): AlbumEntry => ({
	id,
	data: {
		category: 'series',
		title: { en: id, ru: id },
		description: { en: id, ru: id },
		status,
		coverId: photoIds[0]!,
		photoIds,
	},
})

const candidate = (
	albumId: string,
	id: string,
	overrides: PhotoOverrides = {},
): PromoCandidate => ({
	photo: photo(id, overrides),
	albumId,
})

const context = (pageKey: string, exclude: string[] = []) => ({
	pageKey,
	excludePhotoIds: new Set(exclude),
})

const options = (overrides: Partial<FooterPromoOptions> = {}): FooterPromoOptions => ({
	count: 6,
	favorites: 0,
	freshness: 1,
	...overrides,
})

const ids = (result: readonly PromoCandidate[]) => result.map((entry) => entry.photo.id)

// every publishedAt is unique; a higher index is newer
const corpus = (albums: number, perAlbum: number, favorite?: (index: number) => boolean) => {
	const list: PromoCandidate[] = []
	for (let a = 0; a < albums; a++) {
		for (let p = 0; p < perAlbum; p++) {
			const index = a * perAlbum + p
			const day = String(1 + (index % 28)).padStart(2, '0')
			const month = String(1 + Math.floor(index / 28)).padStart(2, '0')
			list.push(
				candidate(`album-${a}`, `photo-${a}-${p}`, {
					publishedAt: `2020-${month}-${day}`,
					favorite: favorite?.(index) ?? false,
				}),
			)
		}
	}
	return list
}

// the site's scale: a few hundred pages, mostly photo pages
const pageKeys = Array.from({ length: 300 }, (_, index) => `article:page-${index}`)

describe('buildPromoCandidates', () => {
	it('keeps listable photos of published albums that have footer media', () => {
		const photos = [
			photo('ok'),
			photo('draft', { status: 'draft' }),
			photo('hidden', { unlisted: true }),
			photo('orphan'),
			photo('in-draft-album'),
			photo('no-media'),
		]
		const albums = [
			album('main', ['ok', 'hidden', 'no-media']),
			album('drafted', ['in-draft-album'], 'draft'),
		]
		const result = buildPromoCandidates(albums, photos, (id) => id !== 'no-media')
		expect(result.map((entry) => [entry.photo.id, entry.albumId])).toEqual([['ok', 'main']])
	})

	it('assigns a multi-album photo to its first published album in collection order', () => {
		const photos = [photo('shared'), photo('other')]
		const albums = [
			album('drafted', ['shared'], 'draft'),
			album('first', ['shared']),
			album('second', ['other', 'shared']),
		]
		const result = buildPromoCandidates(albums, photos, () => true)
		expect(result.find((entry) => entry.photo.id === 'shared')?.albumId).toBe('first')
	})
})

describe('selectFooterPromo', () => {
	it('is deterministic for a page and independent of input order', () => {
		const pool = corpus(5, 4)
		const first = ids(selectFooterPromo(pool, context('album:x'), options()))
		expect(ids(selectFooterPromo(pool, context('album:x'), options()))).toEqual(first)
		expect(ids(selectFooterPromo([...pool].reverse(), context('album:x'), options()))).toEqual(
			first,
		)
	})

	it('does not mutate the candidate list', () => {
		const pool = corpus(3, 2)
		const before = ids(pool)
		selectFooterPromo(pool, context('page:contacts'), options({ count: 3 }))
		expect(ids(pool)).toEqual(before)
	})

	it('never returns excluded photos', () => {
		const pool = corpus(4, 3)
		const excluded = ['photo-0-0', 'photo-0-1', 'photo-0-2', 'photo-2-1']
		for (const pageKey of pageKeys.slice(0, 50)) {
			const result = ids(selectFooterPromo(pool, context(pageKey, excluded), options()))
			expect(result.filter((id) => excluded.includes(id))).toEqual([])
		}
	})

	it('takes one photo per album while enough albums remain', () => {
		const pool = corpus(8, 4)
		for (const pageKey of pageKeys.slice(0, 50)) {
			const result = selectFooterPromo(pool, context(pageKey), options())
			expect(result).toHaveLength(6)
			expect(new Set(result.map((entry) => entry.albumId)).size).toBe(6)
		}
	})

	it('relaxes the per-album limit step by step when albums run out', () => {
		const pool = corpus(2, 5)
		for (const pageKey of pageKeys.slice(0, 50)) {
			const result = selectFooterPromo(pool, context(pageKey), options({ count: 5 }))
			const perAlbum = [0, 1].map(
				(a) => result.filter((entry) => entry.albumId === `album-${a}`).length,
			)
			// 5 slots over 2 albums: 3 + 2, not 5 + 0
			expect(perAlbum.toSorted()).toEqual([2, 3])
		}
	})

	it('returns the whole pool when count exceeds it, and nothing for an empty pool', () => {
		const pool = corpus(2, 2)
		expect(selectFooterPromo(pool, context('page:a'), options())).toHaveLength(4)
		expect(selectFooterPromo([], context('page:a'), options())).toEqual([])
		expect(selectFooterPromo(pool, context('page:a', ids(pool)), options())).toEqual([])
	})

	it('fills the favorites quota first, one favorite per album', () => {
		// favorites only in album-0 and album-1, two in each
		const pool = corpus(8, 4, (index) => index < 2 || (index >= 4 && index < 6))
		for (const pageKey of pageKeys.slice(0, 50)) {
			const result = selectFooterPromo(pool, context(pageKey), options({ favorites: 2 }))
			const favorites = result.filter((entry) => entry.photo.data.favorite)
			expect(favorites).toHaveLength(2)
			expect(new Set(favorites.map((entry) => entry.albumId))).toEqual(
				new Set(['album-0', 'album-1']),
			)
		}
	})

	it('gives an unfilled favorites quota to regular photos', () => {
		const pool = corpus(8, 2, (index) => index === 0)
		const result = selectFooterPromo(pool, context('page:x'), options({ favorites: 3 }))
		expect(result).toHaveLength(6)
		expect(result.filter((entry) => entry.photo.data.favorite)).toHaveLength(1)
	})

	it('treats favorites 0 as no quota: favorites compete like regular photos', () => {
		// all photos of one album are favorites: without a quota it gets one slot like any album
		const pool = corpus(8, 3, (index) => index < 3)
		const counts = pageKeys.map(
			(pageKey) =>
				selectFooterPromo(pool, context(pageKey), options({ favorites: 0 })).filter(
					(entry) => entry.photo.data.favorite,
				).length,
		)
		expect(Math.max(...counts)).toBe(1)
		expect(counts.includes(0)).toBe(true)
	})

	it('rotates favorites across pages instead of always taking the first ones', () => {
		const pool = corpus(20, 2, (index) => index % 2 === 0)
		const shown = new Set<string>()
		for (const pageKey of pageKeys.slice(0, 100)) {
			for (const entry of selectFooterPromo(
				pool,
				context(pageKey),
				options({ favorites: 2 }),
			)) {
				if (entry.photo.data.favorite) shown.add(entry.photo.id)
			}
		}
		expect(shown.size).toBe(20)
	})

	it('does not pin favorites to the start of the output', () => {
		const pool = corpus(8, 3, (index) => index % 3 === 0)
		const firstIsRegular = pageKeys.some((pageKey) => {
			const [first] = selectFooterPromo(pool, context(pageKey), options({ favorites: 2 }))
			return first?.photo.data.favorite === false
		})
		expect(firstIsRegular).toBe(true)
	})

	it('shows different sets on different pages and covers the whole pool', () => {
		const pool = corpus(10, 3)
		const sets = new Set<string>()
		const seen = new Set<string>()
		for (const pageKey of pageKeys) {
			const result = ids(
				selectFooterPromo(pool, context(pageKey), options({ freshness: 10 })),
			)
			sets.add(result.toSorted().join(','))
			result.forEach((id) => seen.add(id))
		}
		expect(sets.size).toBeGreaterThan(pageKeys.length / 2)
		expect(seen.size).toBe(pool.length)
	})

	it('puts the newest album on most pages and favours freshness more as the knob grows', () => {
		// diversity beats recency: the newest photos share their album's single slot, so "most
		// pages" is guaranteed to the album, not to a particular photo
		const pool = corpus(10, 3)
		const share = (freshness: number, pick: (entry: PromoCandidate) => boolean) =>
			pageKeys.filter((pageKey) =>
				selectFooterPromo(pool, context(pageKey), options({ freshness })).some(pick),
			).length / pageKeys.length
		const newestAlbum = (entry: PromoCandidate) => entry.albumId === 'album-9'
		const newestPhoto = (entry: PromoCandidate) => entry.photo.id === 'photo-9-2'
		expect(share(10, newestAlbum)).toBeGreaterThan(0.8)
		expect(share(10, newestAlbum)).toBeGreaterThan(share(1, newestAlbum))
		expect(share(10, newestPhoto)).toBeGreaterThan(share(1, newestPhoto))
		expect(share(30, newestPhoto)).toBeGreaterThan(share(3, newestPhoto))
	})

	it('keeps the oldest album in rotation even with a strong freshness preference', () => {
		const pool = corpus(10, 3)
		const oldest = pageKeys.filter((pageKey) =>
			selectFooterPromo(pool, context(pageKey), options({ freshness: 30 })).some(
				(entry) => entry.albumId === 'album-0',
			),
		)
		expect(oldest.length).toBeGreaterThan(0)
	})

	it('gives photos with an equal publishedAt the same weight', () => {
		// with equal dates the order must not collapse to alphabetical id order
		const pool = Array.from({ length: 10 }, (_, index) =>
			candidate(`album-${index}`, `photo-${index}`, { publishedAt: '2026-08-26' }),
		)
		const firsts = new Set(
			pageKeys.map((pageKey) => ids(selectFooterPromo(pool, context(pageKey), options()))[0]),
		)
		expect(firsts.size).toBe(10)
	})

	it('treats freshness 1 as no preference for newer photos', () => {
		const pool = corpus(10, 1)
		const oldest = pageKeys.filter((pageKey) =>
			ids(selectFooterPromo(pool, context(pageKey), options({ count: 3 }))).includes(
				'photo-0-0',
			),
		).length
		const newest = pageKeys.filter((pageKey) =>
			ids(selectFooterPromo(pool, context(pageKey), options({ count: 3 }))).includes(
				'photo-9-0',
			),
		).length
		// both expect a 3/10 share; the margin absorbs statistical spread over 300 pages
		expect(Math.abs(oldest - newest)).toBeLessThan(pageKeys.length * 0.15)
	})
})
