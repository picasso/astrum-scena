import { describe, expect, it } from 'vitest'

import type { AlbumData, PhotoData, Place } from '../content/schemas.ts'
import {
	pickLocale,
	projectAlbumText,
	projectPhotoText,
	resolvePhotoAlt,
	resolvePhotoCaption,
	resolvePhotoDisplayName,
} from './locale.ts'

const basePhoto = (over: Partial<PhotoData> = {}): PhotoData => ({
	title: { en: 'Title EN', ru: 'Заголовок RU' },
	status: 'published',
	favorite: false,
	tags: [],
	...over,
})

describe('pickLocale', () => {
	it('selects the requested locale', () => {
		expect(pickLocale({ en: 'E', ru: 'R' }, 'en')).toBe('E')
		expect(pickLocale({ en: 'E', ru: 'R' }, 'ru')).toBe('R')
	})
})

describe('resolvePhotoAlt', () => {
	it('prefers an explicit localized alt (owner override)', () => {
		const photo = basePhoto({
			alt: { en: 'Alt EN', ru: 'Alt RU' },
			description: { en: 'Desc EN', ru: 'Desc RU' },
		})
		expect(resolvePhotoAlt(photo, 'en')).toBe('Alt EN')
	})

	it('generates alt from title enriched with the first description sentence', () => {
		const photo = basePhoto({
			title: { en: 'Good morning, ridge!', ru: 'Доброе утро, хребет!' },
			description: {
				en: 'Northland is amazing. And cold.',
				ru: 'Северный край удивителен. И холоден.',
			},
		})
		expect(resolvePhotoAlt(photo, 'en')).toBe('Good morning, ridge. Northland is amazing.')
	})

	it('falls back to the cleaned title — never caption or filename', () => {
		const withCaption = basePhoto({ caption: { en: 'Cap EN', ru: 'Cap RU' } })
		expect(resolvePhotoAlt(withCaption, 'ru')).toBe('Заголовок RU')
		const titleOnly = basePhoto()
		expect(resolvePhotoAlt(titleOnly, 'en')).toBe('Title EN')
	})
})

describe('projectPhotoText / projectAlbumText', () => {
	it('projects photo text with optional fields', () => {
		const photo = basePhoto({ description: { en: 'Desc EN', ru: 'Desc RU' } })
		expect(projectPhotoText(photo, 'en')).toEqual({
			title: 'Title EN',
			description: 'Desc EN',
			caption: undefined,
			alt: 'Title EN. Desc EN',
		})
	})

	it('projects required album text', () => {
		const album: AlbumData = {
			category: 'series',
			title: { en: 'Album EN', ru: 'Album RU' },
			description: { en: 'AD EN', ru: 'AD RU' },
			status: 'published',
			coverId: 'p1',
			photoIds: ['p1'],
		}
		expect(projectAlbumText(album, 'ru')).toEqual({ title: 'Album RU', description: 'AD RU' })
	})

	it('projects an authored album excerpt in the locale', () => {
		const album: AlbumData = {
			category: 'series',
			title: { en: 'Album EN', ru: 'Album RU' },
			description: { en: 'AD EN', ru: 'AD RU' },
			excerpt: { en: 'Own EN.', ru: 'Own RU.' },
			status: 'published',
			coverId: 'p1',
			photoIds: ['p1'],
		}
		expect(projectAlbumText(album, 'ru').excerpt).toBe('Own RU.')
		expect(projectAlbumText(album, 'en').excerpt).toBe('Own EN.')
	})
})

const places: Place[] = [
	{ id: 'northland', name: { en: 'Northland', ru: 'Северный край' }, kind: 'country' },
]

describe('resolvePhotoCaption', () => {
	it('prefers an authored caption over the computed value', () => {
		const photo = basePhoto({
			caption: { en: 'Cap EN', ru: 'Cap RU' },
			placeId: 'northland',
			capturedAt: '2009-09',
		})
		expect(resolvePhotoCaption(photo, 'en', places)).toBe('Cap EN')
	})

	it('computes «Place, YYYY» bilingually when no authored caption', () => {
		const photo = basePhoto({ placeId: 'northland', capturedAt: '2009-09' })
		expect(resolvePhotoCaption(photo, 'en', places)).toBe('Northland, 2009')
		expect(resolvePhotoCaption(photo, 'ru', places)).toBe('Северный край, 2009')
	})

	it('requires both place and year — a partial input yields no computed caption', () => {
		expect(
			resolvePhotoCaption(basePhoto({ placeId: 'northland' }), 'en', places),
		).toBeUndefined()
		expect(resolvePhotoCaption(basePhoto({ capturedAt: '2008' }), 'en', places)).toBeUndefined()
		expect(resolvePhotoCaption(basePhoto(), 'en', places)).toBeUndefined()
	})
})

describe('resolvePhotoDisplayName', () => {
	it('prefers the authored/legacy title over the caption', () => {
		const photo = basePhoto({ placeId: 'northland', capturedAt: '2009' })
		expect(resolvePhotoDisplayName(photo, 'en', places)).toBe('Title EN')
	})

	it('returns the stored title verbatim (trims only for the emptiness check)', () => {
		const photo = basePhoto({ title: { en: '  Spaced Title  ', ru: 'RU' } })
		expect(resolvePhotoDisplayName(photo, 'en', places)).toBe('  Spaced Title  ')
	})

	// the name falls back to caption while title itself stays undefined; the filename feeds only
	// the slug, never the name
	it('falls back to the caption «Place, YYYY» when the title is empty (title-optional future)', () => {
		const titleless = basePhoto({
			title: { en: '', ru: '' },
			placeId: 'northland',
			capturedAt: '2009-09',
		})
		expect(resolvePhotoDisplayName(titleless, 'en', places)).toBe('Northland, 2009')
		expect(resolvePhotoDisplayName(titleless, 'ru', places)).toBe('Северный край, 2009')
	})

	it('returns an empty string when neither title nor a computable caption exists', () => {
		expect(
			resolvePhotoDisplayName(basePhoto({ title: { en: '', ru: '' } }), 'en', places),
		).toBe('')
	})
})
