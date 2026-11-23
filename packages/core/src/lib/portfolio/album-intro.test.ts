import { describe, expect, it } from 'vitest'

import {
	descriptionParagraphs,
	estimateTextHeight,
	MOSAIC_TILE_MAX_PX,
	MOSAIC_TILE_MIN_PX,
	mosaicGap,
	mosaicLayout,
	mosaicRadius,
} from './album-intro.ts'

const text = (...lengths: number[]) => lengths.map((length) => 'x'.repeat(length))
const mosaicHeight = (count: number, layout: ReturnType<typeof mosaicLayout>) => {
	const rows = Math.ceil(count / layout.columns)
	return rows * layout.tile + (rows - 1) * layout.gap
}
const mosaicWidth = (layout: ReturnType<typeof mosaicLayout>) =>
	layout.columns * layout.tile + (layout.columns - 1) * layout.gap

describe('mosaicLayout', () => {
	it('keeps the owner-calibrated 88px square-ish mosaic next to a long text', () => {
		const layout = mosaicLayout(8, text(660, 173, 87, 15), 'en')
		expect(layout).toEqual({ columns: 3, tile: MOSAIC_TILE_MAX_PX, gap: 10, radius: 6 })
	})

	it('shrinks the tiles so many photos stay within a short text', () => {
		const paragraphs = text(450)
		const layout = mosaicLayout(20, paragraphs, 'en')
		expect(layout.tile).toBeLessThan(MOSAIC_TILE_MAX_PX)
		expect(layout.tile).toBeGreaterThan(MOSAIC_TILE_MIN_PX)
		const textHeight = estimateTextHeight(paragraphs, 1024 - 32 - mosaicWidth(layout), 'en')
		expect(mosaicHeight(20, layout)).toBeLessThanOrEqual(textHeight)
	})

	it('falls back to the minimum tile in a compact block when the text is too short', () => {
		const layout = mosaicLayout(20, text(230), 'en')
		expect(layout.tile).toBe(MOSAIC_TILE_MIN_PX)
		expect(layout.columns).toBeLessThan(10)
	})

	it('stays within the tile range, half the header and a 2.5:1 shape', () => {
		for (const count of [1, 2, 5, 20, 40, 80]) {
			for (const paragraphs of [text(40), text(230), text(900, 400)]) {
				for (const locale of ['en', 'ru'] as const) {
					const layout = mosaicLayout(count, paragraphs, locale)
					expect(layout.tile).toBeGreaterThanOrEqual(MOSAIC_TILE_MIN_PX)
					expect(layout.tile).toBeLessThanOrEqual(MOSAIC_TILE_MAX_PX)
					expect(mosaicWidth(layout)).toBeLessThanOrEqual(1024 / 2 - 32)
					expect(layout.columns).toBeLessThanOrEqual(Math.max(1, count))
					const rows = Math.ceil(count / layout.columns)
					expect(mosaicWidth(layout)).toBeLessThanOrEqual(
						2.5 * (rows * layout.tile + (rows - 1) * layout.gap),
					)
				}
			}
		}
	})

	it('scales gap and radius with the tile', () => {
		expect([mosaicGap(88), mosaicRadius(88)]).toEqual([10, 6])
		expect([mosaicGap(24), mosaicRadius(24)]).toEqual([3, 2])
	})
})

describe('descriptionParagraphs', () => {
	it('splits on blank lines and folds inner whitespace', () => {
		expect(descriptionParagraphs('First line\ncontinues.\n\nSecond.\n \nThird.')).toEqual([
			'First line continues.',
			'Second.',
			'Third.',
		])
	})

	it('returns no paragraphs for an empty or missing description', () => {
		expect(descriptionParagraphs('')).toEqual([])
		expect(descriptionParagraphs('  \n\n ')).toEqual([])
		expect(descriptionParagraphs(undefined)).toEqual([])
	})
})
