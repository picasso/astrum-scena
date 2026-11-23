import { describe, expect, it } from 'vitest'

import { serializeLayoutTokens, verifyLayoutTokens } from './layout-tokens.ts'

describe('serializeLayoutTokens', () => {
	it('emits all custom properties on :root', () => {
		const css = serializeLayoutTokens({
			prose: 700,
			medium: 960,
			standard: 1200,
			gallery: 1600,
		})
		expect(css).toContain('--container-prose: 700px;')
		expect(css).toContain('--container-medium: 960px;')
		expect(css).toContain('--container-standard: 1200px;')
		expect(css).toContain('--container-gallery: 1600px;')
		expect(css).toContain(':root {')
	})

	it('is byte-identical on repeat', () => {
		const layout = { prose: 680, medium: 960, standard: 1200, gallery: 1440 }
		expect(serializeLayoutTokens(layout)).toBe(serializeLayoutTokens(layout))
	})

	it('marks the artifact as generated so it is not hand-edited', () => {
		const layout = { prose: 680, medium: 960, standard: 1200, gallery: 1440 }
		expect(serializeLayoutTokens(layout)).toContain('GENERATED FILE')
	})
})

describe('verifyLayoutTokens', () => {
	it('accepts a byte-identical projection and rejects any drift', () => {
		const layout = { prose: 680, medium: 960, standard: 1200, gallery: 1440 }
		expect(verifyLayoutTokens(serializeLayoutTokens(layout), layout).ok).toBe(true)
		expect(
			verifyLayoutTokens(serializeLayoutTokens({ ...layout, prose: 700 }), layout).ok,
		).toBe(false)
		// a hand edit is drift even when the numbers still match
		expect(verifyLayoutTokens(`${serializeLayoutTokens(layout)}\n`, layout).ok).toBe(false)
	})
})
