import type { NoteIcon } from './schema.ts'

// the icon is decorative and inherits the note's text color; the meaning stays in the text
//
// OWNER CHECKPOINT: `history` is a placeholder; the legacy theme's approved icon set has no clock
// or history glyph, so replace it with an approved SVG that keeps the `currentColor`/`viewBox`
// contract
export const NOTE_ICON_SVGS: Record<NoteIcon, string> = {
	history:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 7 7 6.95 6.95 0 0 1-4.9-2l-1.42 1.44A9 9 0 1 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>',
}

export function noteIconHtml(icon: NoteIcon): string {
	return `<span class="note__icon" aria-hidden="true">${NOTE_ICON_SVGS[icon]}</span>`
}
