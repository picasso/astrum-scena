import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
	applyTheme,
	DEFAULT_THEME,
	getCurrentTheme,
	getInitialTheme,
	isTheme,
	THEME_STORAGE_KEY,
	toggleTheme,
} from './theme'

// minimal DOM/BOM stubs: the tests run in node without jsdom
function makeStorage(throwing = false) {
	const store = new Map<string, string>()
	return {
		getItem: (k: string) => {
			if (throwing) throw new Error('blocked')
			return store.has(k) ? (store.get(k) as string) : null
		},
		setItem: (k: string, v: string) => {
			if (throwing) throw new Error('blocked')
			store.set(k, v)
		},
		removeItem: (k: string) => store.delete(k),
		clear: () => store.clear(),
		_store: store,
	}
}

function stubMatchMedia(prefersLight: boolean) {
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: query.includes('light') ? prefersLight : !prefersLight,
		media: query,
	}))
}

beforeEach(() => {
	vi.stubGlobal('document', { documentElement: { dataset: {} as Record<string, string> } })
	vi.stubGlobal('localStorage', makeStorage())
	stubMatchMedia(false)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('isTheme', () => {
	it('accepts only dark and light', () => {
		expect(isTheme('dark')).toBe(true)
		expect(isTheme('light')).toBe(true)
		expect(isTheme('sepia')).toBe(false)
		expect(isTheme(null)).toBe(false)
	})
})

describe('getInitialTheme', () => {
	it('defaults to dark with neither a saved value nor prefers-light', () => {
		expect(getInitialTheme()).toBe('dark')
		expect(DEFAULT_THEME).toBe('dark')
	})

	it('follows prefers-color-scheme: light without a saved value', () => {
		stubMatchMedia(true)
		expect(getInitialTheme()).toBe('light')
	})

	it('puts the saved value above prefers-color-scheme', () => {
		stubMatchMedia(true)
		localStorage.setItem(THEME_STORAGE_KEY, 'dark')
		expect(getInitialTheme()).toBe('dark')
	})

	it('ignores a corrupted saved value', () => {
		localStorage.setItem(THEME_STORAGE_KEY, 'neon')
		expect(getInitialTheme()).toBe('dark')
	})

	it('survives a throwing localStorage (Safari private mode)', () => {
		vi.stubGlobal('localStorage', makeStorage(true))
		stubMatchMedia(true)
		expect(getInitialTheme()).toBe('light')
	})
})

describe('applyTheme / getCurrentTheme', () => {
	it('sets the attribute and persists it to localStorage', () => {
		applyTheme('light')
		expect(document.documentElement.dataset.theme).toBe('light')
		expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
		expect(getCurrentTheme()).toBe('light')
	})

	it('still applies the theme to the DOM when the localStorage write fails', () => {
		vi.stubGlobal('localStorage', makeStorage(true))
		expect(() => applyTheme('light')).not.toThrow()
		expect(document.documentElement.dataset.theme).toBe('light')
	})
})

describe('toggleTheme', () => {
	it('toggles dark → light → dark and persists', () => {
		applyTheme('dark')
		expect(toggleTheme()).toBe('light')
		expect(document.documentElement.dataset.theme).toBe('light')
		expect(toggleTheme()).toBe('dark')
		expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
	})
})
