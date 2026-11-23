import type { NoteTone } from './schema.ts'

// note is a tint over the page background with text derived from `fill`, so it has no solid
// text-on-fill pair and WCAG contrast is the theme's job, as for callout's line variants;
// `fill` drives the tint background, heading and text base, `border` the left bar and icon;
// values are mirrored in `src/theme/theme.css` and tokens.test.ts catches drift

export type NoteTintTokens = { fill: string; border: string }

export type NoteTheme = 'dark' | 'light'

export const NOTE_TINT: Record<NoteTheme, Record<NoteTone, NoteTintTokens>> = {
	dark: {
		outdated: { fill: '#fcbf00', border: '#d9a400' },
		info: { fill: '#3ea6ff', border: '#2f83cc' },
		alert: { fill: '#f9564b', border: '#d63a30' },
	},
	light: {
		// a yellow paper sticker rather than peach: a 20% tint over white reads as pale yellow
		outdated: { fill: '#e6bb3f', border: '#cda23a' },
		info: { fill: '#6aa9e0', border: '#4a89c4' },
		alert: { fill: '#e2867f', border: '#c8615a' },
	},
}
