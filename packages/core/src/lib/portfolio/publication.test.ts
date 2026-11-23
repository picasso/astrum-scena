import { describe, expect, it } from 'vitest'

import type { AlbumData, PhotoData } from '../content/schemas.ts'
import {
	type AlbumEntry,
	buildPublishedMembershipIndex,
	findPublishedAlbum,
	getListableAlbums,
	getListablePhotos,
	getPublishedAlbums,
	getPublishedPhotos,
	indexById,
	type PhotoEntry,
	resolveAlbumCover,
	resolveAlbumPhotos,
	resolveRelatedPhotos,
} from './publication.ts'

const photo = (id: string, status: PhotoData['status'] = 'published'): PhotoEntry => ({
	id,
	data: { title: { en: id, ru: id }, status, favorite: false, tags: [] },
})

const album = (
	id: string,
	status: AlbumData['status'],
	photoIds: string[],
	coverId = photoIds[0]!,
): AlbumEntry => ({
	id,
	data: {
		category: 'series',
		title: { en: id, ru: id },
		description: { en: id, ru: id },
		status,
		coverId,
		photoIds,
	},
})

describe('publication filtering', () => {
	it('keeps only published albums and photos, preserving order', () => {
		const albums = [album('a', 'published', ['p1']), album('b', 'draft', ['p1'])]
		expect(getPublishedAlbums(albums).map((entry) => entry.id)).toEqual(['a'])
		const photos = [photo('p1'), photo('p2', 'draft')]
		expect(getPublishedPhotos(photos).map((entry) => entry.id)).toEqual(['p1'])
	})

	it('findPublishedAlbum ignores draft or unknown ids', () => {
		const albums = [album('a', 'published', ['p1']), album('b', 'draft', ['p1'])]
		expect(findPublishedAlbum(albums, 'a')?.id).toBe('a')
		expect(findPublishedAlbum(albums, 'b')).toBeUndefined()
		expect(findPublishedAlbum(albums, 'missing')).toBeUndefined()
	})
})

describe('listable filtering (unlisted axis)', () => {
	const unlist = <T extends AlbumEntry | PhotoEntry>(entry: T): T => ({
		...entry,
		data: { ...entry.data, unlisted: true },
	})

	it('hides unlisted from listing surfaces while keeping them in the published set', () => {
		const albums = [
			album('a', 'published', ['p1']),
			unlist(album('u', 'published', ['p1'])),
			album('d', 'draft', ['p1']),
		]
		// detail pages and static paths keep unlisted entries; grids and lists drop them
		expect(getPublishedAlbums(albums).map((entry) => entry.id)).toEqual(['a', 'u'])
		expect(getListableAlbums(albums).map((entry) => entry.id)).toEqual(['a'])

		const photos = [photo('p1'), unlist(photo('p2')), photo('p3', 'draft')]
		expect(getPublishedPhotos(photos).map((entry) => entry.id)).toEqual(['p1', 'p2'])
		expect(getListablePhotos(photos).map((entry) => entry.id)).toEqual(['p1'])
	})
})

describe('buildPublishedMembershipIndex', () => {
	it('maps photo → published albums only, computed from album.photoIds', () => {
		const albums = [
			album('a1', 'published', ['p1', 'p2']),
			album('a2', 'published', ['p2']),
			album('draft', 'draft', ['p1', 'p3']),
		]
		const photos = indexById([photo('p1'), photo('p2'), photo('p3', 'draft')])
		const index = buildPublishedMembershipIndex(albums, photos)
		expect(index.get('p1')).toEqual(['a1'])
		expect(index.get('p2')).toEqual(['a1', 'a2'])
		expect(index.get('p3')).toBeUndefined() // only in the draft album
	})

	it('fails closed when a published album references a missing or draft photo', () => {
		const albums = [album('a1', 'published', ['p1', 'gone'])]
		const photos = indexById([photo('p1')])
		expect(() => buildPublishedMembershipIndex(albums, photos)).toThrow(/unknown/)
	})
})

describe('resolveAlbumPhotos', () => {
	const photos = indexById([photo('p1'), photo('p2'), photo('draft', 'draft')])

	it('returns photos in persisted photoIds order', () => {
		const resolved = resolveAlbumPhotos(album('a', 'published', ['p2', 'p1']), photos)
		expect(resolved.map((entry) => entry.id)).toEqual(['p2', 'p1'])
	})

	it('fails closed on unknown photo references', () => {
		expect(() => resolveAlbumPhotos(album('a', 'published', ['nope']), photos)).toThrow(
			/unknown/,
		)
	})

	it('fails closed when a published album references a draft photo', () => {
		expect(() => resolveAlbumPhotos(album('a', 'published', ['p1', 'draft']), photos)).toThrow(
			/draft/,
		)
	})

	it('allows draft photos inside a draft album', () => {
		const resolved = resolveAlbumPhotos(album('a', 'draft', ['draft']), photos)
		expect(resolved.map((entry) => entry.id)).toEqual(['draft'])
	})
})

describe('resolveAlbumCover / resolveRelatedPhotos', () => {
	const photos = indexById([photo('p1'), photo('p2'), photo('p3')])

	it('resolves the cover photo and throws when missing', () => {
		expect(resolveAlbumCover(album('a', 'published', ['p1', 'p2']), photos).id).toBe('p1')
		expect(() => resolveAlbumCover(album('a', 'published', ['p1'], 'gone'), photos)).toThrow(
			/missing/,
		)
	})

	it('rejects a draft cover for a published album', () => {
		const withDraft = indexById([photo('p1'), photo('d', 'draft')])
		expect(() =>
			resolveAlbumCover(album('a', 'published', ['p1', 'd'], 'd'), withDraft),
		).toThrow(/draft cover/)
	})

	it('related excludes the current photo and keeps album order', () => {
		const related = resolveRelatedPhotos(
			album('a', 'published', ['p1', 'p2', 'p3']),
			'p2',
			photos,
		)
		expect(related.map((entry) => entry.id)).toEqual(['p1', 'p3'])
	})

	it('fails closed when the current photo is not a member of the album', () => {
		expect(() =>
			resolveRelatedPhotos(album('a', 'published', ['p1', 'p2']), 'p3', photos),
		).toThrow(/not a member/)
	})
})
