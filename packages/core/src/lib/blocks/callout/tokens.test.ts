import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { siteRoot } from '../../../config/site-root.ts'
import { CORE_ROOT } from '../../../core-root.ts'
import { CALLOUT_TONES } from './schema.ts'
import { CALLOUT_FILL_PAIRS, type CalloutColorPair } from './tokens.ts'

// WCAG relative luminance + contrast ratio (sRGB)
function channel(value: number): number {
	const c = value / 255
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
	const m = /^#([0-9a-f]{6})$/i.exec(hex)
	if (!m) throw new Error(`expected #rrggbb, got ${hex}`)
	const n = parseInt(m[1]!, 16)
	return (
		0.2126 * channel((n >> 16) & 255) +
		0.7152 * channel((n >> 8) & 255) +
		0.0722 * channel(n & 255)
	)
}

function contrast({ fill, text }: CalloutColorPair): number {
	const a = luminance(fill)
	const b = luminance(text)
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('callout tone contrast', () => {
	it('keeps the approved live-site default palette in both themes', () => {
		for (const theme of ['dark', 'light'] as const) {
			expect(CALLOUT_FILL_PAIRS[theme].default).toEqual({
				fill: '#4f535e',
				text: '#ffffff',
			})
		}
	})

	it('passes WCAG AA (>= 4.5) for every filled tone pair in both themes', () => {
		for (const theme of ['dark', 'light'] as const) {
			for (const tone of CALLOUT_TONES) {
				const ratio = contrast(CALLOUT_FILL_PAIRS[theme][tone])
				expect(ratio, `${theme}/${tone} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
			}
		}
	})

	// a pair without its CSS variable would leave the component's `var(--callout-*)` unset
	it('mirrors every pair into the site theme CSS', () => {
		const css = readFileSync(path.join(siteRoot, 'src/theme/theme.css'), 'utf8')
		for (const tone of CALLOUT_TONES) {
			const dark = CALLOUT_FILL_PAIRS.dark[tone]
			const light = CALLOUT_FILL_PAIRS.light[tone]
			expect(css).toContain(`--callout-${tone}-fill: ${dark.fill};`)
			expect(css).toContain(`--callout-${tone}-text: ${dark.text};`)
			expect(css).toContain(`--callout-${tone}-fill: ${light.fill};`)
			expect(css).toContain(`--callout-${tone}-text: ${light.text};`)
		}
	})

	it('keeps the filled default line bright with its full top inset', () => {
		const theme = readFileSync(path.join(siteRoot, 'src/theme/theme.css'), 'utf8')
		const css = readFileSync(path.join(CORE_ROOT, 'src/styles/blocks/callout.css'), 'utf8')
		expect(theme).toContain('--callout-default-line-text: #f2f2f4;')
		expect(css).toMatch(
			/\.callout--line\.callout--default:not\(\.callout--transparent\)\s*{[^}]*color: var\(--callout-default-line-text\);/,
		)
		expect(css).toMatch(
			/\.prose \.callout--line:not\(\.callout--transparent\) \.callout__content > :first-child\s*{[^}]*margin-top: 0;/,
		)
		expect(css).toMatch(
			/\.callout--line:not\(\.callout--transparent\)\s*{[^}]*padding-top: 14px;/,
		)
		expect(css).toMatch(
			/\.callout--line:not\(\.callout--transparent\) \.callout__icon\s*{[^}]*margin-top: 1px;/,
		)
	})

	it('uses the same solid link underline in both variants', () => {
		const css = readFileSync(path.join(CORE_ROOT, 'src/styles/blocks/callout.css'), 'utf8')
		expect(css).toMatch(
			/\.prose \.callout a\s*{[^}]*text-decoration-line: underline;[^}]*text-decoration-style: solid;[^}]*text-decoration-thickness: 1px;[^}]*text-underline-offset: 2px;/,
		)
	})

	it('fluidly collapses the block right inset from 40px to 20px', () => {
		const css = readFileSync(path.join(CORE_ROOT, 'src/styles/blocks/callout.css'), 'utf8')
		expect(css).toContain('--callout-block-padding-right: clamp(20px, calc(10% - 20px), 40px);')
	})
})
