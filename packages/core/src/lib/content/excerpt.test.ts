import { describe, expect, it } from 'vitest'

import { deriveAlbumExcerpt, deriveExcerpt } from './excerpt.ts'

// the legacy `get_excerpt` builds a description from whole body sentences when there is no own
// excerpt, which is how legacy cards had descriptions with an empty `post_excerpt`
describe('deriveExcerpt', () => {
	it('prefers the document own excerpt', () => {
		expect(deriveExcerpt('Own summary.', 'Body sentence.')).toBe('Own summary.')
	})

	it('treats a blank own excerpt as absent', () => {
		expect(deriveExcerpt('   ', 'Body sentence.')).toBe('Body sentence.')
	})

	it('returns undefined when there is nothing to describe', () => {
		expect(deriveExcerpt(undefined, '')).toBeUndefined()
		expect(deriveExcerpt(undefined, undefined)).toBeUndefined()
	})

	it('drops a heading that opens the body', () => {
		expect(deriveExcerpt(undefined, '## Title\n\nFirst sentence.')).toBe('First sentence.')
	})

	it('keeps link captions and strips markdown emphasis', () => {
		expect(deriveExcerpt(undefined, 'See [the album](/portfolio/northland/) for *more*.')).toBe(
			'See the album for more.',
		)
	})

	it('drops images and fenced code', () => {
		expect(
			deriveExcerpt(undefined, '![alt](/a.jpg)\n\n```js\nconst a = 1\n```\n\nText only.'),
		).toBe('Text only.')
	})

	it('cuts on sentence boundaries within the legacy budget', () => {
		const sentence = `${'a'.repeat(98)}. `
		const derived = deriveExcerpt(undefined, sentence.repeat(5)) ?? ''
		// three 99-char sentences = 299 > 270, so exactly two fit
		expect(derived.split('.').filter(Boolean)).toHaveLength(2)
		expect(derived.length).toBeLessThanOrEqual(270)
	})
})

describe('deriveAlbumExcerpt', () => {
	it('prefers the author excerpt over the description', () => {
		expect(deriveAlbumExcerpt('Own summary.', 'First. Second.')).toBe('Own summary.')
	})

	it('falls back to whole sentences of the description within the legacy budget', () => {
		const sentence = 'A sentence that is exactly fifty characters long..'
		const description = Array.from({ length: 8 }, () => sentence).join(' ')
		const excerpt = deriveAlbumExcerpt(undefined, description)!
		expect(excerpt.length).toBeLessThanOrEqual(270)
		expect(excerpt.endsWith('..')).toBe(true)
		expect(description.startsWith(excerpt)).toBe(true)
	})

	it('treats a blank author excerpt as absent and flattens paragraphs', () => {
		expect(deriveAlbumExcerpt('  ', 'One.\n\nTwo.')).toBe('One. Two.')
	})

	it('returns undefined for an empty description', () => {
		expect(deriveAlbumExcerpt(undefined, '')).toBeUndefined()
	})
})
