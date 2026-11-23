import { describe, expect, it } from 'vitest'

import { siteRoot } from '../../../config/site-root.ts'
import { loadImageConfig } from './config.ts'
import { planLadderWidths } from './ladder.ts'

// the demo ladder: 200…1600, native up to a 2000px long side, watermark above 800px
const config = () => loadImageConfig(siteRoot)

describe('planLadderWidths', () => {
	it.each([
		[3000, 2000, [200, 400, 800, 1200, 1600, 2000]],
		[1920, 904, [200, 400, 800, 1200, 1600, 1920]],
		[960, 685, [200, 400, 800, 960]],
		[2000, 3000, [200, 400, 800, 1200, 1333]],
		[300, 200, [200, 300]],
		[150, 100, [150]],
	])('plans %ix%i without upscale or long-side overflow', (width, height, expected) => {
		expect(planLadderWidths(config(), width, height).widths).toEqual(expected)
	})

	it('omits native when disabled and reports photos without a marked file', () => {
		const value = config()
		value.ladder.native.enabled = false
		expect(planLadderWidths(value, 1920, 904).widths).toEqual([200, 400, 800, 1200, 1600])
		expect(planLadderWidths(value, 711, 1080).warnings).toContain(
			'no-watermarked-file: no derivative exceeds the watermark threshold',
		)
		expect(planLadderWidths(value, 300, 200).warnings).toContain(
			'small-source: ladder capped to 300px (source 300px)',
		)
	})

	it('rejects invalid sources and a zero-width cap', () => {
		expect(() => planLadderWidths(config(), 0, 10)).toThrow(/positive integers/)
		expect(() => planLadderWidths(config(), 1, 10000)).toThrow(/zero-width/)
	})
})
