import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { loadOriented } from './transform.ts'

const solid = (width: number, height: number, orientation?: number): Promise<Buffer> => {
	const image = sharp({
		create: { width, height, channels: 3, background: { r: 100, g: 120, b: 140 } },
	})
	return (orientation ? image.withMetadata({ orientation }) : image).jpeg().toBuffer()
}

describe('loadOriented', () => {
	it('swaps the axes for EXIF orientation 6', async () => {
		// orientation 6 rotates by 90°, so the 100×50 landscape displays as a 50×100 portrait
		expect(await loadOriented(await solid(100, 50, 6))).toEqual({
			width: 50,
			height: 100,
			orientation: 6,
		})
	})

	it('defaults orientation to 1 when the tag is absent', async () => {
		expect(await loadOriented(await solid(80, 60))).toEqual({
			width: 80,
			height: 60,
			orientation: 1,
		})
	})

	it('keeps the axes for mirrored orientation 2', async () => {
		expect(await loadOriented(await solid(80, 60, 2))).toEqual({
			width: 80,
			height: 60,
			orientation: 2,
		})
	})

	it('rejects bytes that are not an image', async () => {
		await expect(loadOriented(Buffer.from('not an image'))).rejects.toThrow()
	})
})
