import { describe, expect, it } from 'vitest'

import { createLocalizedIdGenerator } from './localized-glob.ts'

// astro glob only warns on a duplicate id and overwrites the entry, so the generator itself guards
// uniqueness for both the full sync and the dev watcher's single-file reload
describe('createLocalizedIdGenerator', () => {
	it('derives the same id from .md and .mdx', () => {
		const first = createLocalizedIdGenerator()
		const second = createLocalizedIdGenerator()
		expect(first.generateId('about.en.md')).toBe('about-en')
		expect(second.generateId('about.en.mdx')).toBe('about-en')
	})

	it('rejects the same document authored as both .md and .mdx', () => {
		const ids = createLocalizedIdGenerator()
		ids.generateId('about.en.md')
		expect(() => ids.generateId('about.en.mdx')).toThrow(
			/Duplicate localized content id "about-en": "about\.en\.md" and "about\.en\.mdx"/,
		)
	})

	it('rejects two directories claiming one translation-key and locale', () => {
		const ids = createLocalizedIdGenerator()
		ids.generateId('a/about.en.md')
		expect(() => ids.generateId('b/about.en.md')).toThrow(/Duplicate localized content id/)
	})

	it('accepts one file per translation-key and locale', () => {
		const ids = createLocalizedIdGenerator()
		expect(() => {
			ids.generateId('about.en.md')
			ids.generateId('about.ru.mdx')
			ids.generateId('sketchbook.en.md')
		}).not.toThrow()
	})

	// a watcher reload of the same file must not conflict with itself
	it('lets the same file resync', () => {
		const ids = createLocalizedIdGenerator()
		ids.generateId('about.en.md')
		expect(ids.generateId('about.en.md')).toBe('about-en')
	})

	// a `.md` → `.mdx` rename arrives as unlink + add; without freeing the id the deleted source
	// would block its own replacement
	it('frees the id once the file is gone', () => {
		const ids = createLocalizedIdGenerator()
		ids.generateId('about.en.md')
		ids.forget('about.en.md')
		expect(ids.generateId('about.en.mdx')).toBe('about-en')
	})

	it('starts from a clean map on a full load', () => {
		const ids = createLocalizedIdGenerator()
		ids.generateId('about.en.md')
		ids.reset()
		expect(ids.generateId('about.en.mdx')).toBe('about-en')
	})

	it('still rejects a filename that carries no locale', () => {
		const ids = createLocalizedIdGenerator()
		expect(() => ids.generateId('about.md')).toThrow(/<translation-key>\.<locale>/)
	})
})
