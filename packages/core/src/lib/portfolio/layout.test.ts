import { describe, expect, it } from 'vitest'

import {
	flattenJustifiedOrder,
	type JustifiedConfig,
	type LayoutItem,
	type MasonryConfig,
	resolveJustifiedRows,
	resolveMasonryColumns,
	resolveMasonryItems,
} from './layout.ts'

const item = (id: string, width: number, height: number): LayoutItem => ({ id, width, height })

const landscape = (id: string) => item(id, 300, 200)
const portrait = (id: string) => item(id, 200, 300)
const panorama = (id: string) => item(id, 300, 100)
const square = (id: string) => item(id, 100, 100)

const MASONRY: MasonryConfig = { minColumnWidth: 300, gap: 16, maxColumns: 5 }
const JUSTIFIED: JustifiedConfig = { targetRowHeight: 240, gap: 12, tolerance: 0.25 }

describe('resolveMasonryColumns', () => {
	it('clamps floor((W + gap) / (minColumnWidth + gap)) into [1, maxColumns]', () => {
		expect(resolveMasonryColumns(1440, MASONRY)).toBe(4) // floor(1456/316) = 4
		expect(resolveMasonryColumns(300, MASONRY)).toBe(1) // floor(316/316) = 1
		expect(resolveMasonryColumns(768, MASONRY)).toBe(2) // floor(784/316) = 2
		expect(resolveMasonryColumns(1280, MASONRY)).toBe(4) // floor(1296/316) = 4
	})

	it('never exceeds maxColumns even on very wide containers', () => {
		expect(resolveMasonryColumns(4000, MASONRY)).toBe(5) // floor(4016/316) = 12 → clamp 5
	})

	it('falls back to a single column for non-positive width', () => {
		expect(resolveMasonryColumns(0, MASONRY)).toBe(1)
		expect(resolveMasonryColumns(-500, MASONRY)).toBe(1)
	})
})

describe('resolveMasonryItems', () => {
	it('maps intrinsic dimensions to aspect ratios', () => {
		const items = resolveMasonryItems([landscape('a'), portrait('b'), square('c')])
		expect(items).toEqual([
			{ id: 'a', aspectRatio: 1.5 },
			{ id: 'b', aspectRatio: 200 / 300 },
			{ id: 'c', aspectRatio: 1 },
		])
	})

	it('throws on non-positive dimensions', () => {
		expect(() => resolveMasonryItems([item('bad', 0, 100)])).toThrow(/positive/)
		expect(() => resolveMasonryItems([item('bad', 100, -1)])).toThrow(/positive/)
	})
})

// a full row fills the container exactly, shares one height and keeps every aspect ratio
const assertRowFillsContainer = (
	cells: { width: number; height: number }[],
	containerWidth: number,
	gap: number,
) => {
	const total = cells.reduce((sum, cell) => sum + cell.width, 0) + gap * (cells.length - 1)
	expect(total).toBeCloseTo(containerWidth, 4)
	for (const cell of cells) {
		expect(cell.height).toBeCloseTo(cells[0]!.height, 4)
	}
}

const assertNoDistortion = (
	cells: { id: string; width: number; height: number }[],
	byId: Map<string, LayoutItem>,
) => {
	for (const cell of cells) {
		const source = byId.get(cell.id)!
		expect(cell.width / cell.height).toBeCloseTo(source.width / source.height, 5)
	}
}

describe('resolveJustifiedRows', () => {
	it('returns no rows for an empty set', () => {
		expect(resolveJustifiedRows([], 1200, JUSTIFIED)).toEqual([])
	})

	it('degrades to one item per row at target height when width is unknown', () => {
		const rows = resolveJustifiedRows([landscape('a'), portrait('b')], 0, JUSTIFIED)
		expect(rows).toHaveLength(2)
		for (const row of rows) {
			expect(row.height).toBe(240)
			expect(row.cells).toHaveLength(1)
		}
		expect(rows.map((row) => row.isLastRow)).toEqual([false, true])
		expect(rows[0]!.cells[0]!.width).toBeCloseTo(240 * 1.5, 5)
	})

	it('marks exactly one last row — the final one — whether it ends full or ragged', () => {
		// 8 landscapes @1200 close exactly two full rows with no tail
		const full = resolveJustifiedRows(
			Array.from({ length: 8 }, (_, i) => landscape(`a${i}`)),
			1200,
			JUSTIFIED,
		)
		expect(full.filter((row) => row.isLastRow)).toHaveLength(1)
		expect(full.at(-1)!.isLastRow).toBe(true)

		// 5 landscapes @1200: full row(s) plus a ragged tail
		const ragged = resolveJustifiedRows(
			Array.from({ length: 5 }, (_, i) => landscape(`b${i}`)),
			1200,
			JUSTIFIED,
		)
		expect(ragged.filter((row) => row.isLastRow)).toHaveLength(1)
		expect(ragged.at(-1)!.isLastRow).toBe(true)
	})

	it('preserves input order (== album.photoIds) across rows', () => {
		const ids = ['a', 'b', 'c', 'd', 'e', 'f']
		const items = ids.map((id, i) => (i % 2 ? portrait(id) : landscape(id)))
		const rows = resolveJustifiedRows(items, 1200, JUSTIFIED)
		expect(flattenJustifiedOrder(rows)).toEqual(ids)
	})

	it('packs 8 landscapes into full rows that each exactly fill the container', () => {
		const items = Array.from({ length: 8 }, (_, i) => landscape(`a${i}`))
		const byId = new Map(items.map((it) => [it.id, it]))
		const rows = resolveJustifiedRows(items, 1200, JUSTIFIED)
		expect(flattenJustifiedOrder(rows)).toHaveLength(8)
		for (const row of rows) {
			assertRowFillsContainer(row.cells, 1200, JUSTIFIED.gap)
			assertNoDistortion(row.cells, byId)
			// full rows fit the container width, so their height never exceeds the target
			expect(row.height).toBeLessThanOrEqual(240 + 1e-6)
		}
	})

	it('caps a sparse last row at target height instead of stretching (single landscape)', () => {
		const rows = resolveJustifiedRows([landscape('a')], 1200, JUSTIFIED)
		expect(rows).toHaveLength(1)
		expect(rows[0]!.isLastRow).toBe(true)
		expect(rows[0]!.height).toBe(240) // fitted 800 > 240*1.25 → capped
		expect(rows[0]!.cells[0]!.width).toBeCloseTo(360, 5)
	})

	it('justifies a nearly-full last row that lands within tolerance', () => {
		// 3 landscapes @1200: rowWidthAtTarget = 3*360 + 24 = 1104 < 1200 → last row.
		// fitted = (1200 - 24) / 4.5 = 261.33 ≤ 240*1.25 (300) → stretch to fill.
		const items = [landscape('a'), landscape('b'), landscape('c')]
		const rows = resolveJustifiedRows(items, 1200, JUSTIFIED)
		expect(rows).toHaveLength(1)
		expect(rows[0]!.isLastRow).toBe(true)
		expect(rows[0]!.height).toBeGreaterThan(240)
		expect(rows[0]!.height).toBeLessThanOrEqual(240 * 1.25)
		assertRowFillsContainer(rows[0]!.cells, 1200, JUSTIFIED.gap)
	})

	it('handles mixed portrait/landscape/panorama without distortion', () => {
		const items = [
			landscape('l1'),
			portrait('p1'),
			panorama('pan1'),
			square('s1'),
			landscape('l2'),
			portrait('p2'),
			panorama('pan2'),
			square('s2'),
		]
		const byId = new Map(items.map((it) => [it.id, it]))
		const rows = resolveJustifiedRows(items, 1440, JUSTIFIED)
		expect(flattenJustifiedOrder(rows)).toEqual(items.map((it) => it.id))
		for (const row of rows) {
			assertNoDistortion(row.cells, byId)
			if (!row.isLastRow) assertRowFillsContainer(row.cells, 1440, JUSTIFIED.gap)
		}
	})

	it('closes a row immediately when a single panorama already overflows', () => {
		// panorama ratio 3 → at target 240 width 720; two panoramas 720*2+12 = 1452 > 1200 after 2nd,
		// but a very narrow container closes on the first.
		const rows = resolveJustifiedRows([panorama('wide')], 600, JUSTIFIED)
		expect(rows).toHaveLength(1)
		// fitted = 600 / 3 = 200 < 240 → not a last-row cap; full-fill single cell.
		expect(rows[0]!.cells[0]!.width).toBeCloseTo(600, 4)
		expect(rows[0]!.height).toBeCloseTo(200, 4)
	})

	it('never emits negative dimensions when gaps exceed the container', () => {
		// a gap wider than the container leaves no room to justify, so the row keeps the target
		// height
		const config: JustifiedConfig = { targetRowHeight: 240, gap: 2000, tolerance: 0.25 }
		const rows = resolveJustifiedRows([panorama('a'), panorama('b')], 1000, config)
		for (const row of rows) {
			expect(row.height).toBeGreaterThan(0)
			for (const cell of row.cells) {
				expect(cell.width).toBeGreaterThan(0)
				expect(cell.height).toBeGreaterThan(0)
			}
		}
	})

	it('supports the degenerate two-item set', () => {
		const items = [landscape('a'), landscape('b')]
		const byId = new Map(items.map((it) => [it.id, it]))
		const rows = resolveJustifiedRows(items, 1200, JUSTIFIED)
		expect(flattenJustifiedOrder(rows)).toEqual(['a', 'b'])
		for (const row of rows) assertNoDistortion(row.cells, byId)
	})
})
