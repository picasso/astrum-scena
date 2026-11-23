import { describe, expect, it } from 'vitest'

import { autoWidthForRatio, effectiveRatio, resolveWrapWidth } from './width.ts'

describe('wrap-around width resolver', () => {
	it('maps each ratio band to its width, honoring the inclusive 2.50 boundary', () => {
		expect(autoWidthForRatio(0.5)).toBe(33)
		expect(autoWidthForRatio(0.75)).toBe(40)
		expect(autoWidthForRatio(1.14)).toBe(40)
		expect(autoWidthForRatio(1.15)).toBe(45)
		expect(autoWidthForRatio(1.55)).toBe(50)
		expect(autoWidthForRatio(1.9)).toBe(55)
		expect(autoWidthForRatio(2.5)).toBe(55)
		expect(autoWidthForRatio(2.51)).toBe(60)
	})

	it('uses the aspect ratio directly for a single image', () => {
		expect(effectiveRatio([{ width: 300, height: 200 }])).toBeCloseTo(1.5)
		expect(resolveWrapWidth([{ width: 300, height: 200 }])).toBe(45)
	})

	it('combines a vertical group into one effective ratio R = 1 / Σ(1/rᵢ)', () => {
		// two equal squares: rᵢ=1 → R = 1/2 = 0.5 → 33%
		expect(
			effectiveRatio([
				{ width: 100, height: 100 },
				{ width: 100, height: 100 },
			]),
		).toBeCloseTo(0.5)
		expect(
			resolveWrapWidth([
				{ width: 100, height: 100 },
				{ width: 100, height: 100 },
			]),
		).toBe(33)
	})

	it('lets a manual width fully replace the heuristic', () => {
		expect(resolveWrapWidth([{ width: 300, height: 200 }], 20)).toBe(20)
		expect(resolveWrapWidth([{ width: 300, height: 200 }], 70)).toBe(70)
	})

	it('rejects an empty group or non-positive dimensions', () => {
		expect(() => effectiveRatio([])).toThrow()
		expect(() => effectiveRatio([{ width: 0, height: 100 }])).toThrow()
	})
})
