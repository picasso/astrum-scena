import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { siteRoot } from '../../config/site-root.ts'
import { CONTENT_GAPS, contentGapVar } from './content-gap.ts'

// guards the length contract without duplicating a browser's CSS parser.
const isGapLength = (value: string): boolean =>
	!value.includes('%') &&
	/(?:px|rem|em)\b/.test(value) &&
	/^(?:[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)|calc\(.+\))$/.test(value)

describe('content gap scale', () => {
	it('lists every semantic gap exactly once', () => {
		expect(CONTENT_GAPS).toEqual(['none', 'tiny', 'small', 'medium', 'large'])
		expect(new Set(CONTENT_GAPS).size).toBe(CONTENT_GAPS.length)
	})

	it.each(['0px', '0.5rem', '2em', 'calc(1rem + 2px)'])('accepts theme length %s', (value) => {
		expect(isGapLength(value)).toBe(true)
	})

	it.each(['0', '12', '5%', 'calc(1rem + 5%)', 'calc(0)'])(
		'rejects unsupported theme gap %s',
		(value) => {
			expect(isGapLength(value)).toBe(false)
		},
	)

	it('addresses gaps through CSS custom properties', () => {
		expect(contentGapVar('medium')).toBe('var(--content-gap-medium)')
	})

	// blocks read the gap from CSS, so a TS entry without a theme variable would leave the
	// component with an unset `var(--content-gap-*)`
	it('declares every semantic token in the site theme', () => {
		const css = readFileSync(path.join(siteRoot, 'src/theme/theme.css'), 'utf8')
		for (const gap of CONTENT_GAPS) {
			const value = css.match(new RegExp(`--content-gap-${gap}:\\s*([^;]+);`))?.[1]?.trim()
			expect(value, gap).toBeDefined()
			expect(isGapLength(value ?? ''), `${gap}: ${value}`).toBe(true)
		}
	})
})
