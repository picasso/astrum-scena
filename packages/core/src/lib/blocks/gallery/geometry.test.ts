import { describe, expect, it } from 'vitest'

import {
	averageAspectRatio,
	flattenJustifiedOrder,
	isMobileContainer,
	isRectCandidate,
	resolveActualColumns,
	resolveGalleryJustified,
	resolveJustifiedTargetRowHeight,
} from './geometry.ts'

describe('resolveActualColumns', () => {
	it('follows min(columns, floor((W+gap)/(240+gap))) with a floor of 1', () => {
		// with gap 8: 736px is the 3->2 boundary and 488px is the 2->1 boundary.
		expect(resolveActualColumns(3, 736, 8)).toBe(3)
		expect(resolveActualColumns(3, 735, 8)).toBe(2)
		expect(resolveActualColumns(3, 488, 8)).toBe(2)
		expect(resolveActualColumns(3, 487, 8)).toBe(1)
		// requested 5 is capped to the two visual-width columns that fit at 680px.
		expect(resolveActualColumns(5, 680, 8)).toBe(2)
		// very narrow container -> 1
		expect(resolveActualColumns(3, 200, 8)).toBe(1)
		expect(resolveActualColumns(3, 0, 8)).toBe(1)
	})
})

describe('isMobileContainer', () => {
	it('activates the phone rule at container width <= 480', () => {
		expect(isMobileContainer(480)).toBe(true)
		expect(isMobileContainer(481)).toBe(false)
	})
})

describe('isRectCandidate', () => {
	it('keeps only width/height >= 4/3 (dynamic rect filter)', () => {
		expect(isRectCandidate({ width: 4, height: 3 })).toBe(true)
		expect(isRectCandidate({ width: 3, height: 2 })).toBe(true) // 1.5 >= 1.333
		expect(isRectCandidate({ width: 5, height: 4 })).toBe(false) // 1.25 < 1.333
		expect(isRectCandidate({ width: 1, height: 1 })).toBe(false)
	})
})

describe('averageAspectRatio', () => {
	it('averages width/height', () => {
		expect(
			averageAspectRatio([
				{ width: 3, height: 2 },
				{ width: 1, height: 2 },
			]),
		).toBeCloseTo(1, 5)
	})
})

describe('resolveJustifiedTargetRowHeight', () => {
	it('matches the contract worked example (680px, 3 cols, gap 8, frame 1)', () => {
		const base = { containerWidth: 680, gap: 8, frame: 1, effectiveColumns: 3 }
		expect(resolveJustifiedTargetRowHeight({ ...base, averageAspectRatio: 1.5 })).toBeCloseTo(
			146,
			0,
		)
		expect(resolveJustifiedTargetRowHeight({ ...base, averageAspectRatio: 1 })).toBeCloseTo(
			219,
			0,
		)
		expect(resolveJustifiedTargetRowHeight({ ...base, averageAspectRatio: 2 / 3 })).toBeCloseTo(
			329,
			0,
		)
	})
})

describe('resolveGalleryJustified', () => {
	it('packs even rows and marks exactly the last row nojustify, preserving order', () => {
		const items = Array.from({ length: 7 }, (_, index) => ({
			id: `p${index}`,
			width: 3,
			height: 2,
		}))
		const rows = resolveGalleryJustified(items, 680, { columns: 3, gap: 8, frame: 1 })
		expect(rows.length).toBeGreaterThan(1)
		expect(rows.filter((row) => row.isLastRow)).toHaveLength(1)
		expect(rows[rows.length - 1]!.isLastRow).toBe(true)
		expect(flattenJustifiedOrder(rows)).toEqual(items.map((item) => item.id))
	})

	it('budgets the frame for every item in a row, not only the columns cap', () => {
		const items = [
			{ id: 'a', width: 800, height: 413 },
			{ id: 'b', width: 800, height: 377 },
			{ id: 'c', width: 800, height: 377 },
			{ id: 'd', width: 800, height: 330 },
		]
		const containerWidth = 648
		const frame = 1
		const rows = resolveGalleryJustified(items, containerWidth, { columns: 3, gap: 0, frame })

		for (const row of rows) {
			const outerWidth = row.cells.reduce((sum, cell) => sum + cell.width + frame * 2, 0)
			expect(outerWidth).toBeLessThanOrEqual(containerWidth + 0.001)
		}
	})

	it('leaves the final incomplete row at target height instead of stretching it', () => {
		const items = Array.from({ length: 7 }, (_, index) => ({
			id: `p${index}`,
			width: 3,
			height: 2,
		}))
		const containerWidth = 680
		const rows = resolveGalleryJustified(items, containerWidth, {
			columns: 3,
			gap: 8,
			frame: 1,
		})
		const last = rows[rows.length - 1]!
		const occupied =
			last.cells.reduce((sum, cell) => sum + cell.width + 2, 0) +
			8 * Math.max(last.cells.length - 1, 0)

		expect(last.isLastRow).toBe(true)
		expect(occupied).toBeLessThan(containerWidth)
	})
})
