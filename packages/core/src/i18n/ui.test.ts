import { describe, expect, it } from 'vitest'

import { SUPPORTED_LOCALES } from '../config/locale-schema.ts'
import en from './en.json' with { type: 'json' }
import {
	isActive,
	isCurrentSection,
	isLocaleNeutralPath,
	languageName,
	localizedHref,
	normalizePath,
	resolveNavIcon,
	switchLocalePath,
} from './ui'

describe('localizedHref', () => {
	it('builds the root path for an empty segment', () => {
		expect(localizedHref('en', '')).toBe('/en/')
		expect(localizedHref('ru', '')).toBe('/ru/')
	})

	it('builds a section path with a trailing slash', () => {
		expect(localizedHref('en', 'portfolio')).toBe('/en/portfolio/')
		expect(localizedHref('ru', 'about')).toBe('/ru/about/')
	})
})

describe('normalizePath', () => {
	it('keeps the root as is', () => {
		expect(normalizePath('/')).toBe('/')
	})

	it('strips the trailing slash except on the root', () => {
		expect(normalizePath('/en/about/')).toBe('/en/about')
		expect(normalizePath('/en/about')).toBe('/en/about')
	})

	it('collapses repeated slashes', () => {
		expect(normalizePath('/en//about//')).toBe('/en/about')
	})
})

describe('isActive', () => {
	it('matches regardless of the trailing slash', () => {
		expect(isActive('/en/about/', 'en', 'about')).toBe(true)
		expect(isActive('/en/about', 'en', 'about')).toBe(true)
	})

	it('matches the root (home) route', () => {
		expect(isActive('/en/', 'en', '')).toBe(true)
		expect(isActive('/ru/', 'ru', '')).toBe(true)
	})

	it('does not match another section or language', () => {
		expect(isActive('/en/about/', 'en', 'portfolio')).toBe(false)
		expect(isActive('/ru/about/', 'en', 'about')).toBe(false)
	})
})

describe('isCurrentSection', () => {
	it('matches the home section only on the exact localized root', () => {
		expect(isCurrentSection('/en/', 'en', '')).toBe(true)
		expect(isCurrentSection('/en/portfolio/', 'en', '')).toBe(false)
		expect(isCurrentSection('/en/about/', 'en', '')).toBe(false)
	})

	it('matches the exact section URL, with or without the trailing slash', () => {
		expect(isCurrentSection('/en/portfolio/', 'en', 'portfolio')).toBe(true)
		expect(isCurrentSection('/en/portfolio', 'en', 'portfolio')).toBe(true)
		expect(isCurrentSection('/en/about/', 'en', 'about')).toBe(true)
	})

	it('extends to nested routes of the section', () => {
		expect(isCurrentSection('/en/portfolio/sunrises/', 'en', 'portfolio')).toBe(true)
		expect(isCurrentSection('/en/portfolio/sunrises/dawn/', 'en', 'portfolio')).toBe(true)
		expect(isCurrentSection('/en/articles/glass-and-light/', 'en', 'articles')).toBe(true)
	})

	it('does not match a string prefix without a segment boundary', () => {
		expect(isCurrentSection('/en/articleship/', 'en', 'articles')).toBe(false)
		expect(isCurrentSection('/en/portfolios/', 'en', 'portfolio')).toBe(false)
	})

	it('does not highlight a section in another language', () => {
		expect(isCurrentSection('/ru/portfolio/', 'en', 'portfolio')).toBe(false)
		expect(isCurrentSection('/en/portfolio/', 'ru', 'portfolio')).toBe(false)
	})

	it('highlights no other section on courses routes or a language-neutral route', () => {
		for (const segment of ['portfolio', 'articles', 'about', 'contacts', '']) {
			expect(isCurrentSection('/en/courses/', 'en', segment)).toBe(false)
			expect(isCurrentSection('/en/courses/paper-lanterns/', 'en', segment)).toBe(false)
			// `/rights/` has no locale prefix, so no lang matches it
			expect(isCurrentSection('/rights/', 'en', segment)).toBe(false)
		}
	})
})

describe('switchLocalePath', () => {
	it('switches the root', () => {
		expect(switchLocalePath('/en/', 'ru')).toBe('/ru/')
		expect(switchLocalePath('/ru/', 'en')).toBe('/en/')
	})

	it('keeps the section with a trailing slash', () => {
		expect(switchLocalePath('/en/portfolio/', 'ru')).toBe('/ru/portfolio/')
	})

	it('keeps the section without a trailing slash', () => {
		expect(switchLocalePath('/ru/about', 'en')).toBe('/en/about')
	})

	it('handles nested paths', () => {
		expect(switchLocalePath('/en/portfolio/nature/', 'ru')).toBe('/ru/portfolio/nature/')
	})

	it('leaves a language-neutral route as is', () => {
		expect(isLocaleNeutralPath('/rights/')).toBe(true)
		expect(isLocaleNeutralPath('/en/rights/')).toBe(false)
		expect(switchLocalePath('/rights/', 'ru')).toBe('/rights/')
		expect(switchLocalePath('/rights/', 'en')).toBe('/rights/')
	})
})

describe('section icons', () => {
	it('resolves single icons for both index and nested, arrays as [root, child]', () => {
		expect(resolveNavIcon('person', true)).toBe('person')
		expect(resolveNavIcon('person', false)).toBe('person')
		expect(resolveNavIcon(['image', 'grid'], true)).toBe('image') // exact index → root
		expect(resolveNavIcon(['image', 'grid'], false)).toBe('grid') // nested → child
		expect(resolveNavIcon(undefined, true)).toBeUndefined()
	})
})

describe('languageName', () => {
	// the English dictionary declares the key set, so it names every catalog locale
	it('has an English name for every catalog locale, in Latin script only', () => {
		for (const code of SUPPORTED_LOCALES) {
			const name = (en as Record<string, string>)[`language.${code}`]
			expect(name, `language.${code}`).toBeTruthy()
			expect(name).not.toMatch(/[\u0400-\u04ff]/)
			expect(languageName('en', code)).toBe(name)
		}
	})

	it("names a language in the page's own language", () => {
		expect(languageName('en', 'ru')).toBe('Russian')
		expect(languageName('ru', 'ru')).toBe('Русский')
		expect(languageName('ru', 'en')).toBe('English')
	})
})
