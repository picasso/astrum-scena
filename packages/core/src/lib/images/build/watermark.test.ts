import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
	composeWatermark,
	computeWatermarkLayout,
	normalizeWatermarkBounds,
	type WatermarkComposeSpec,
} from './watermark.ts'

// transparent margins around the mark exercise trim bounds
async function paddedWatermark(): Promise<Buffer> {
	const svg = Buffer.from(
		'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
			'<rect x="50" y="80" width="100" height="40" fill="#ffffff"/></svg>',
		'utf8',
	)
	return sharp(svg).png().toBuffer()
}

const baseSpec: WatermarkComposeSpec = {
	scale: 0.2,
	minPx: 48,
	maxPx: 480,
	position: 'bottom-right',
	inset: 24,
	opacity: 1,
}

describe('normalizeWatermarkBounds', () => {
	it('trims transparent padding to the visible mark', async () => {
		const normalized = await normalizeWatermarkBounds(await paddedWatermark())
		expect(normalized.width).toBe(100)
		expect(normalized.height).toBe(40)
	})

	it('keeps bounds unchanged for a fully opaque mark (no padding to trim)', async () => {
		const opaque = await sharp({
			create: {
				width: 50,
				height: 30,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 1 },
			},
		})
			.png()
			.toBuffer()
		const normalized = await normalizeWatermarkBounds(opaque)
		expect(normalized.width).toBe(50)
		expect(normalized.height).toBe(30)
	})

	it('fails closed on a fully transparent mark (no visible watermark)', async () => {
		const transparent = await sharp({
			create: {
				width: 40,
				height: 40,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			},
		})
			.png()
			.toBuffer()
		await expect(normalizeWatermarkBounds(transparent)).rejects.toThrow(/transparent/)
	})

	it('fails closed on a fully transparent grey+alpha mark', async () => {
		const transparent = await sharp({
			create: {
				width: 40,
				height: 40,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			},
		})
			.toColourspace('b-w')
			.png()
			.toBuffer()
		expect((await sharp(transparent).metadata()).channels).toBe(2)
		await expect(normalizeWatermarkBounds(transparent)).rejects.toThrow(/transparent/)
	})
})

describe('computeWatermarkLayout', () => {
	it('places bottom-right with inset and scaled width', () => {
		const layout = computeWatermarkLayout(1000, 800, 200, 100, baseSpec)
		expect(layout.width).toBe(200) // 0.2 * 1000
		expect(layout.height).toBe(100)
		expect(layout.left).toBe(1000 - 200 - 24)
		expect(layout.top).toBe(800 - 100 - 24)
	})

	it('clamps to maxPx and minPx', () => {
		expect(computeWatermarkLayout(1000, 800, 200, 100, { ...baseSpec, scale: 0.9 }).width).toBe(
			480,
		)
		expect(
			computeWatermarkLayout(1000, 800, 200, 100, { ...baseSpec, scale: 0.001 }).width,
		).toBe(48)
	})

	it('honours each named position with inset', () => {
		const tl = computeWatermarkLayout(1000, 800, 200, 100, {
			...baseSpec,
			position: 'top-left',
		})
		expect(tl.left).toBe(24)
		expect(tl.top).toBe(24)
		const center = computeWatermarkLayout(1000, 800, 200, 100, {
			...baseSpec,
			position: 'center',
		})
		expect(center.left).toBe(Math.round((1000 - 200) / 2))
		expect(center.top).toBe(Math.round((800 - 100) / 2))
	})

	it('treats focal-safe as bottom-right by default', () => {
		const focal = computeWatermarkLayout(1000, 800, 200, 100, {
			...baseSpec,
			position: 'focal-safe',
		})
		const br = computeWatermarkLayout(1000, 800, 200, 100, baseSpec)
		expect(focal).toEqual(br)
	})

	it('keeps the mark inside a tiny image where inset exceeds the frame', () => {
		const layout = computeWatermarkLayout(40, 40, 200, 100, baseSpec)
		expect(layout.left).toBeGreaterThanOrEqual(0)
		expect(layout.top).toBeGreaterThanOrEqual(0)
		expect(layout.left + layout.width).toBeLessThanOrEqual(40)
		expect(layout.top + layout.height).toBeLessThanOrEqual(40)
	})

	it('shrinks an extreme-aspect mark to fit the safe-area height', () => {
		// a mark 20 times taller than wide on a short image: height must cap the width
		const layout = computeWatermarkLayout(1000, 200, 100, 2000, {
			...baseSpec,
			scale: 0.3,
			minPx: 10,
			inset: 10,
		})
		expect(layout.height).toBeLessThanOrEqual(200 - 2 * 10)
		expect(layout.top + layout.height).toBeLessThanOrEqual(200)
	})

	it('never exceeds the image on degenerate inputs (tall mark, near-zero safe-area)', () => {
		// sharp composite throws when the mark leaves the image
		for (const [w, h, mw, mh] of [
			[1000, 10, 100, 2000],
			[10, 1000, 2000, 100],
			[5, 5, 300, 1],
			[1000, 200, 1, 3000],
		]) {
			const layout = computeWatermarkLayout(w!, h!, mw!, mh!, {
				...baseSpec,
				scale: 0.3,
				minPx: 48,
				inset: 50,
			})
			expect(layout.width).toBeGreaterThanOrEqual(1)
			expect(layout.height).toBeGreaterThanOrEqual(1)
			expect(layout.left).toBeGreaterThanOrEqual(0)
			expect(layout.top).toBeGreaterThanOrEqual(0)
			expect(layout.left + layout.width).toBeLessThanOrEqual(w!)
			expect(layout.top + layout.height).toBeLessThanOrEqual(h!)
		}
	})
})

describe('composeWatermark', () => {
	async function base(): Promise<Buffer> {
		return sharp({
			create: {
				width: 400,
				height: 300,
				channels: 3,
				background: { r: 200, g: 200, b: 200 },
			},
		})
			.png()
			.toBuffer()
	}

	it('preserves the base image dimensions', async () => {
		const wm = await normalizeWatermarkBounds(await paddedWatermark())
		const layout = computeWatermarkLayout(400, 300, wm.width, wm.height, baseSpec)
		const composed = await composeWatermark(await base(), wm, layout, baseSpec.opacity)
		const meta = await sharp(composed).metadata()
		expect(meta.width).toBe(400)
		expect(meta.height).toBe(300)
	})

	it('produces a valid image on the reduced-opacity path', async () => {
		const wm = await normalizeWatermarkBounds(await paddedWatermark())
		const layout = computeWatermarkLayout(400, 300, wm.width, wm.height, baseSpec)
		const composed = await composeWatermark(await base(), wm, layout, 0.4)
		const meta = await sharp(composed).metadata()
		expect(meta.format).toBe('png')
		expect(meta.width).toBe(400)
	})

	it('actually reduces mark intensity as opacity drops (pixel-level)', async () => {
		const wm = await normalizeWatermarkBounds(await paddedWatermark())
		const layout = computeWatermarkLayout(400, 300, wm.width, wm.height, baseSpec)
		// a white mark over a gray 200 background, sampled at its center
		const sx = layout.left + Math.floor(layout.width / 2)
		const sy = layout.top + Math.floor(layout.height / 2)
		const sample = async (opacity: number): Promise<number> => {
			const composed = await composeWatermark(await base(), wm, layout, opacity)
			const px = await sharp(composed)
				.extract({ left: sx, top: sy, width: 1, height: 1 })
				.raw()
				.toBuffer()
			return px[0]!
		}
		const full = await sample(1)
		const faint = await sample(0.4)
		expect(full).toBeGreaterThan(faint)
		expect(faint).toBeGreaterThan(190)
	})

	it('does not overflow the base on a degenerate tiny image', async () => {
		const wm = await normalizeWatermarkBounds(await paddedWatermark())
		const tiny = await sharp({
			create: { width: 6, height: 6, channels: 3, background: { r: 10, g: 10, b: 10 } },
		})
			.png()
			.toBuffer()
		const layout = computeWatermarkLayout(6, 6, wm.width, wm.height, { ...baseSpec, inset: 40 })
		const composed = await composeWatermark(tiny, wm, layout, baseSpec.opacity)
		const meta = await sharp(composed).metadata()
		expect(meta.width).toBe(6)
		expect(meta.height).toBe(6)
	})
})
