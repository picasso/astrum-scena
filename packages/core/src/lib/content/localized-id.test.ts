import { describe, expect, it } from 'vitest'

import { localizedDocumentId } from './localized-id.ts'

// `.md` and `.mdx` of one translation-key × locale share an id, so they cannot coexist
describe('localizedDocumentId', () => {
	it('derives the same id from .md and .mdx', () => {
		expect(localizedDocumentId('glass-and-light.en.md')).toBe('glass-and-light-en')
		expect(localizedDocumentId('glass-and-light.en.mdx')).toBe('glass-and-light-en')
	})

	it('keeps both locales apart', () => {
		expect(localizedDocumentId('about.ru.mdx')).toBe('about-ru')
		expect(localizedDocumentId('about.en.mdx')).toBe('about-en')
	})

	// whether the site builds the locale is the loader's check against content.locales
	it('takes any code of the locale format', () => {
		expect(localizedDocumentId('about.de.md')).toBe('about-de')
	})

	it('ignores directories in the entry path', () => {
		expect(localizedDocumentId('nested/dir/about.ru.md')).toBe('about-ru')
	})

	it.each([
		['about.md', 'no locale segment'],
		['about.english.md', 'not a locale code'],
		['about.EN.md', 'upper case locale'],
		['about.en.extra.md', 'extra segment'],
		['About.en.md', 'upper case key'],
		['about.en.markdown', 'foreign extension'],
		['about.en.mdxx', 'near-miss extension'],
		['about.en.', 'no extension'],
	])('rejects %s (%s)', (filename) => {
		expect(() => localizedDocumentId(filename)).toThrow(/<translation-key>\.<locale>/)
	})
})
