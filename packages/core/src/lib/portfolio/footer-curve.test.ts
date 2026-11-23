import { describe, expect, it } from 'vitest'

import { FOOTER_CURVE_SHAPES } from '../../config/variants.ts'
import { buildFooterCurve } from './footer-curve.ts'

describe('buildFooterCurve', () => {
	it('ports every legacy shape path at height 80 (int(h·r1), int(h·r2))', () => {
		expect(buildFooterCurve('upright', 80).path).toBe('M0 80 C 50 0 80 -26 100 80 Z')
		expect(buildFooterCurve('upleft', 80).path).toBe('M0 80 C 20 -26 30 0 100 80 Z')
		expect(buildFooterCurve('downleft', 80).path).toBe('M0 0 C 20 160 50 0 100 0 Z')
		expect(buildFooterCurve('downright', 80).path).toBe('M0 0 C 50 0 80 160 100 0 Z')
		expect(buildFooterCurve('lessdownleft', 80).path).toBe('M0 0 C 20 106 50 0 100 0 Z')
		expect(buildFooterCurve('lessdownright', 80).path).toBe('M0 0 C 50 0 80 106 100 0 Z')
		expect(buildFooterCurve('downleftinverse', 80).path).toBe(
			'M100,0 L100,80 L0,80 L0,0 L100,0 z M100,0 L0,0 C20,135 50,0 100,0 z',
		)
	})

	it('always emits viewBox "0 0 100 {height}"', () => {
		expect(buildFooterCurve('upright', 60).viewBox).toBe('0 0 100 60')
		expect(buildFooterCurve('downleft', 200).viewBox).toBe('0 0 100 200')
	})

	it('flags exactly the four legacy inverse shapes', () => {
		expect(buildFooterCurve('downleft', 80).inverse).toBe(true)
		expect(buildFooterCurve('downright', 80).inverse).toBe(true)
		expect(buildFooterCurve('lessdownleft', 80).inverse).toBe(true)
		expect(buildFooterCurve('lessdownright', 80).inverse).toBe(true)
		// name notwithstanding, downleftinverse is NOT in the legacy inverse list.
		expect(buildFooterCurve('downleftinverse', 80).inverse).toBe(false)
		expect(buildFooterCurve('upright', 80).inverse).toBe(false)
		expect(buildFooterCurve('upleft', 80).inverse).toBe(false)
	})

	it('truncates fractional control points toward zero (PHP int())', () => {
		// height 50: upright b = int(50·0.33) = int(16.5) = 16; lessdown a = int(50·1.33) = int(66.5) = 66.
		expect(buildFooterCurve('upright', 50).path).toContain('-16 ')
		expect(buildFooterCurve('lessdownleft', 50).path).toBe('M0 0 C 20 66 50 0 100 0 Z')
	})

	it('has a template for every declared shape', () => {
		for (const shape of FOOTER_CURVE_SHAPES) {
			const model = buildFooterCurve(shape, 80)
			expect(model.path.length).toBeGreaterThan(0)
			expect(model.height).toBe(80)
		}
	})
})
