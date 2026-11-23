import { describe, expect, it } from 'vitest'

import {
	resolveSlugCollision,
	SlugError,
	slugifyFromFilename,
	slugifyFromTitle,
	suggestPhotoSlug,
	toKebab,
} from './slug'

describe('slugifyFromTitle', () => {
	it('drops articles and function words and lowercases to kebab', () => {
		expect(slugifyFromTitle('The Forgotten Light')).toBe('forgotten-light')
		expect(slugifyFromTitle('A Walk in Venice at Dawn')).toBe('walk-venice-dawn')
		expect(slugifyFromTitle('Sunrise over the Valley')).toBe('sunrise-valley')
	})

	it('folds diacritics to ASCII', () => {
		expect(slugifyFromTitle('Café del Mar')).toBe('cafe-del-mar')
		expect(slugifyFromTitle('Piñata')).toBe('pinata')
	})

	it('transliterates non-decomposing Latin letters instead of dropping them', () => {
		expect(slugifyFromTitle('Tromsø')).toBe('tromso')
		expect(slugifyFromTitle('Łódź')).toBe('lodz')
		expect(slugifyFromTitle('Straße')).toBe('strasse')
		expect(slugifyFromTitle('Æther')).toBe('aether')
	})

	it('shortens to at most three meaningful words by default', () => {
		expect(slugifyFromTitle('One Two Three Four Five')).toBe('one-two-three')
	})

	it('honors an explicit maxWords', () => {
		expect(slugifyFromTitle('One Two Three', { maxWords: 2 })).toBe('one-two')
		expect(() => slugifyFromTitle('One', { maxWords: 0 })).toThrow(SlugError)
		// documented cap is 2-3 words: maxWords above 3 is rejected, not silently honored.
		expect(() => slugifyFromTitle('One Two Three Four', { maxWords: 4 })).toThrow(SlugError)
	})

	it('falls back to all tokens when every word is a stop word', () => {
		expect(slugifyFromTitle('The Of A')).toBe('the-of-a')
	})

	it('throws when the title has no sluggable characters', () => {
		expect(() => slugifyFromTitle('—!!!—')).toThrow(SlugError)
	})
})

describe('slugifyFromFilename', () => {
	it('strips directory and extension then kebab-normalizes', () => {
		expect(slugifyFromFilename('IMG_1234.JPG')).toBe('img-1234')
		expect(slugifyFromFilename('/path/to/My Photo.jpeg')).toBe('my-photo')
		expect(slugifyFromFilename('morning_ridge.tiff')).toBe('morning-ridge')
	})

	it('throws when nothing sluggable remains', () => {
		expect(() => slugifyFromFilename('___.jpg')).toThrow(SlugError)
	})
})

describe('resolveSlugCollision', () => {
	it('returns the base when it is free', () => {
		expect(resolveSlugCollision('sunrise', new Set())).toBe('sunrise')
	})

	it('appends a distinguishing token (place/year), not an ordinal', () => {
		expect(resolveSlugCollision('sunrise', new Set(['sunrise']), ['2011'])).toBe('sunrise-2011')
		expect(resolveSlugCollision('sunrise', new Set(['sunrise']), ['Monument Valley'])).toBe(
			'sunrise-monument-valley',
		)
	})

	it('tries later distinguishers when earlier ones also collide', () => {
		expect(
			resolveSlugCollision('sunrise', new Set(['sunrise', 'sunrise-2011']), ['2011', '2012']),
		).toBe('sunrise-2012')
	})

	it('throws when no distinguisher resolves the collision (never falls back to a number)', () => {
		expect(() => resolveSlugCollision('sunrise', new Set(['sunrise']), [])).toThrow(SlugError)
		expect(() =>
			resolveSlugCollision('sunrise', new Set(['sunrise', 'sunrise-2011']), ['2011']),
		).toThrow(SlugError)
	})
})

describe('suggestPhotoSlug', () => {
	it('returns an owner canonical id verbatim, ignoring title heuristics', () => {
		expect(suggestPhotoSlug({ canonicalId: 'quiet-light', title: 'The Forgotten Light' })).toBe(
			'quiet-light',
		)
	})

	it('rejects a canonical id that is not kebab-case', () => {
		expect(() => suggestPhotoSlug({ canonicalId: 'Quiet Light' })).toThrow(SlugError)
	})

	it('derives from the title and resolves collisions with distinguishers', () => {
		expect(
			suggestPhotoSlug({
				title: 'Sunrise',
				existing: new Set(['sunrise']),
				distinguishers: ['Tuscany'],
			}),
		).toBe('sunrise-tuscany')
	})

	it('falls back to the filename when the title is absent', () => {
		expect(suggestPhotoSlug({ filename: 'morning-ridge.jpg' })).toBe('morning-ridge')
	})

	it('throws when given neither canonical id, title, nor filename', () => {
		expect(() => suggestPhotoSlug({})).toThrow(SlugError)
	})
})

describe('toKebab', () => {
	it('normalizes arbitrary text to kebab and returns empty for no ASCII alnum', () => {
		expect(toKebab('  Hello,  World! ')).toBe('hello-world')
		expect(toKebab('—')).toBe('')
	})
})
