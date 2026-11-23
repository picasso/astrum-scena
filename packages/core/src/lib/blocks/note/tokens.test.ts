import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { siteRoot } from '../../../config/site-root.ts'
import { CORE_ROOT } from '../../../core-root.ts'
import { NOTE_TONES } from './schema.ts'
import { NOTE_TINT } from './tokens.ts'

// the tint has no solid text-on-fill pair for a WCAG gate (the theme owns contrast), so only
// TS-to-CSS token drift is checked

describe('note tint tokens', () => {
	// a TS token without a CSS variable would leave `var(--note-<tone>-*)` empty
	it('mirrors every tone fill and border token into the site theme CSS', () => {
		const css = readFileSync(path.join(siteRoot, 'src/theme/theme.css'), 'utf8')
		for (const theme of ['dark', 'light'] as const) {
			for (const tone of NOTE_TONES) {
				const token = NOTE_TINT[theme][tone]
				expect(css, `${theme}/${tone} fill`).toContain(
					`--note-${tone}-fill: ${token.fill};`,
				)
				expect(css, `${theme}/${tone} border`).toContain(
					`--note-${tone}-border: ${token.border};`,
				)
			}
		}
	})

	it('maps each tone modifier class to its tokens', () => {
		const css = readFileSync(path.join(CORE_ROOT, 'src/styles/blocks/note.css'), 'utf8')
		for (const tone of NOTE_TONES) {
			expect(css).toMatch(
				new RegExp(
					`\\.note--${tone}\\s*{[^}]*--note-fill: var\\(--note-${tone}-fill\\);[^}]*--note-border: var\\(--note-${tone}-border\\);`,
				),
			)
		}
	})

	it('lays the fill over the page background with transparency (a tint, not a solid block)', () => {
		const css = readFileSync(path.join(CORE_ROOT, 'src/styles/blocks/note.css'), 'utf8')
		expect(css).toMatch(
			/background: color-mix\(in srgb, var\(--note-fill\) var\(--note-tint\), transparent\);/,
		)
	})

	it('uses the same solid link underline treatment as callout', () => {
		const css = readFileSync(path.join(CORE_ROOT, 'src/styles/blocks/note.css'), 'utf8')
		expect(css).toMatch(
			/\.prose \.note a\s*{[^}]*text-decoration-line: underline;[^}]*text-decoration-style: solid;[^}]*text-decoration-thickness: 1px;[^}]*text-underline-offset: 2px;/,
		)
	})
})
