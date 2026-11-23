import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CORE_ROOT } from '../../../core-root.ts'
import { CONTENT_GAPS } from '../content-gap.ts'
import { LINKS_SIZES } from './schema.ts'
import { LINKS_SIZES as LINKS_SIZE_VALUES, LINKS_WIDTH_COMPACT } from './tokens.ts'

// catches TS-to-CSS token drift and holds the gap to the shared spacing scale

const css = readFileSync(path.join(CORE_ROOT, 'src/styles/blocks/links.css'), 'utf8')

describe('links tokens', () => {
	it('mirrors every own size value and the compact width into CSS variables', () => {
		for (const size of LINKS_SIZES) {
			expect(css, `--links-size-${size}`).toContain(
				`--links-size-${size}: ${LINKS_SIZE_VALUES[size]};`,
			)
		}
		expect(css).toContain(`--links-width-compact: ${LINKS_WIDTH_COMPACT};`)
	})

	it('maps each size modifier class to its own token on the list only (heading is size-independent)', () => {
		for (const size of LINKS_SIZES) {
			expect(css).toMatch(
				new RegExp(
					`\\.links--${size}\\s+\\.links__list\\s*{[^}]*font-size: var\\(--links-size-${size}\\);`,
				),
			)
		}
		// a block-level font-size would resize the heading too
		for (const size of LINKS_SIZES) {
			expect(css).not.toMatch(new RegExp(`\\.links--${size}\\s*{[^}]*font-size:`))
		}
	})

	it('maps each gap modifier class to the SHARED content-gap token (no private gap scale)', () => {
		expect(css).not.toContain('--links-gap-')
		// bullets need a real ::marker, so the list stays block layout and the gap is a margin
		for (const gap of CONTENT_GAPS) {
			expect(css).toMatch(
				new RegExp(
					`\\.links--gap-${gap}\\s+\\.links__list\\s*>\\s*li \\+ li\\s*{[^}]*margin-block-start: var\\(--content-gap-${gap}\\);`,
				),
			)
		}
	})

	it('shows hollow (circle) bullets only when there is no leading per-link icon (heading/none)', () => {
		// the base has no markers so icon=each, which sets no list-style, inherits none
		expect(css).toMatch(/\.prose \.links__list\s*{[^}]*list-style: none;/)
		expect(css).toMatch(
			/\.prose \.links--icon-heading \.links__list,\s*\.prose \.links--icon-none \.links__list\s*{[^}]*list-style: circle;/,
		)
		// with icon=each the leading ↗ is the marker
		expect(css).not.toMatch(/\.links--icon-each \.links__list\s*{[^}]*list-style:/)
	})

	it('lets width=full silently zero out the align margins', () => {
		expect(css).toMatch(/\.links--w-full\s*{[^}]*margin-inline: 0;/)
	})

	it('leaves links unUnderlined by default and dashes them on hover/focus', () => {
		expect(css).toMatch(/\.prose \.links a\s*{[^}]*text-decoration: none;/)
		expect(css).toMatch(
			/\.prose \.links a:hover,\s*\.prose \.links a:focus-visible\s*{[^}]*text-decoration-line: underline;[^}]*text-decoration-style: dashed;[^}]*text-decoration-thickness: 1px;[^}]*text-underline-offset: 2px;/,
		)
	})

	it('wraps long URL labels so a single long link cannot overflow the container', () => {
		expect(css).toMatch(
			/\.links__list a\s*{[^}]*overflow-wrap: anywhere;[^}]*word-break: break-word;/,
		)
	})
})
