import type { CalloutTone } from './schema.ts'

// the only text-on-surface pairs the filled callout introduces, so each must pass WCAG AA
// (tokens.test.ts). Transparent and line variants reuse the site's prose-on-page pair and are out
// of scope. Values are mirrored into `--callout-{tone}-fill/-text` in the theme CSS; the same test
// catches drift

export type CalloutColorPair = { fill: string; text: string }

export type CalloutTheme = 'dark' | 'light'

export const CALLOUT_FILL_PAIRS: Record<CalloutTheme, Record<CalloutTone, CalloutColorPair>> = {
	dark: {
		default: { fill: '#4f535e', text: '#ffffff' },
		accent: { fill: '#fcbf00', text: '#211c00' },
		alt: { fill: '#cc2c22', text: '#ffffff' },
	},
	light: {
		default: { fill: '#4f535e', text: '#ffffff' },
		accent: { fill: '#ecae80', text: '#3a2705' },
		alt: { fill: '#c0392b', text: '#ffffff' },
	},
}
