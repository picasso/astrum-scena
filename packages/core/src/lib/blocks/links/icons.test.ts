import { describe, expect, it } from 'vitest'

import { LINKS_ICON_SVGS, linksIconHtml } from './icons.ts'

// guards glyph shape and hardening against hostile SVG; no author input is interpolated into them

describe('links icon svgs', () => {
	const entries = Object.entries(LINKS_ICON_SVGS) as [keyof typeof LINKS_ICON_SVGS, string][]

	it('exposes only the two rendering glyphs (no "none" key)', () => {
		expect(Object.keys(LINKS_ICON_SVGS).sort()).toEqual(['each', 'heading'])
	})

	for (const [name, svg] of entries) {
		it(`${name} is a normalized <svg> inheriting currentColor`, () => {
			expect(svg).toMatch(/^<svg[\s>]/)
			expect(svg).toContain('viewBox="0 0 24 24"')
			// bookmark inherits through fill, external-link through stroke
			expect(/(?:fill|stroke)="currentColor"/.test(svg)).toBe(true)
		})

		it(`${name} carries no title, script, style, foreignObject, handlers or external refs`, () => {
			expect(svg).not.toContain('<title')
			expect(svg).not.toContain('<script')
			expect(svg).not.toContain('<style')
			expect(svg).not.toContain('<foreignObject')
			expect(svg).not.toMatch(/\son[a-z]+=/i)
			expect(svg).not.toMatch(/xlink:href/i)
			expect(svg).not.toMatch(/\bhref=/i)
		})
	}

	it('wraps the heading glyph in an aria-hidden .links__icon span', () => {
		const html = linksIconHtml('heading')
		expect(html).toContain('class="links__icon"')
		expect(html).toContain('aria-hidden="true"')
		expect(html).toContain(LINKS_ICON_SVGS.heading)
	})

	it('wraps the per-link glyph in an aria-hidden .links__ext span', () => {
		const html = linksIconHtml('each')
		expect(html).toContain('class="links__ext"')
		expect(html).toContain('aria-hidden="true"')
		expect(html).toContain(LINKS_ICON_SVGS.each)
	})
})
