// pure functions shared by the vanilla scripts of theme-toggle.astro and menu-overlay.astro; `data-theme`
// on <html> is the single source of truth. The inline no-flash script in html-shell.astro duplicates the
// minimum of this logic because is:inline scripts cannot import.

export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'theme'

// the legacy site defaulted to dark
export const DEFAULT_THEME: Theme = 'dark'

// any other or corrupted value counts as absent
export function isTheme(value: unknown): value is Theme {
	return value === 'dark' || value === 'light'
}

// null on a read error or a missing or corrupted value
function readStored(): Theme | null {
	try {
		const raw = localStorage.getItem(THEME_STORAGE_KEY)
		return isTheme(raw) ? raw : null
	} catch {
		return null
	}
}

// saved value → prefers-color-scheme → DEFAULT_THEME; survives a disabled or throwing localStorage
// (Safari private mode) and a missing matchMedia
export function getInitialTheme(): Theme {
	const stored = readStored()
	if (stored) return stored
	try {
		if (
			typeof matchMedia === 'function' &&
			matchMedia('(prefers-color-scheme: light)').matches
		) {
			return 'light'
		}
	} catch {
		// no usable matchMedia: fall through to the default
	}
	return DEFAULT_THEME
}

// persisting is best-effort: a failed write does not stop the theme from applying
export function applyTheme(theme: Theme): void {
	document.documentElement.dataset.theme = theme
	try {
		localStorage.setItem(THEME_STORAGE_KEY, theme)
	} catch {
		// storage unavailable: the theme is already on the DOM, it just does not persist
	}
}

// read from the actual DOM attribute, falling back to the default
export function getCurrentTheme(): Theme {
	const attr = document.documentElement.dataset.theme
	return isTheme(attr) ? attr : DEFAULT_THEME
}

export function toggleTheme(): Theme {
	const next: Theme = getCurrentTheme() === 'dark' ? 'light' : 'dark'
	applyTheme(next)
	return next
}
