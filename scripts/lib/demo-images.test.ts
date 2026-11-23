import { readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadImageConfig } from '../../packages/core/src/lib/images/build/config.ts'
import { loadReleaseDescriptor } from '../../packages/core/src/lib/images/release.ts'
import { DEMO_MASTERS, type DemoMaster, renderMasterPixels } from './demo-images.ts'

const DEMO = 'demo'

const small = (master: DemoMaster): DemoMaster => ({ ...master, width: 90, height: 60 })

describe('procedural masters', () => {
	it('render the same pixels on every run', () => {
		for (const master of DEMO_MASTERS.map(small))
			expect(renderMasterPixels(master).equals(renderMasterPixels(master)), master.id).toBe(
				true,
			)
	})

	it('cover every format of the demo layouts, and one master in grey', () => {
		const ratios = DEMO_MASTERS.map((master) => master.width / master.height)
		for (const ratio of [3 / 2, 2 / 3, 1, 3, 16 / 9]) expect(ratios).toContain(ratio)
		for (const master of DEMO_MASTERS)
			expect(Math.max(master.width, master.height), master.id).toBeLessThanOrEqual(2400)
		const grey = DEMO_MASTERS.filter((master) =>
			master.palette.every(([red, green, blue]) => red === green && green === blue),
		)
		expect(grey).toHaveLength(1)
		const pixels = renderMasterPixels(small(grey[0]!))
		for (let offset = 0; offset < pixels.length; offset += 3)
			expect(new Set(pixels.subarray(offset, offset + 3)).size).toBe(1)
	})

	it('match the photos of the demo one to one', () => {
		const photos = readdirSync(path.join(DEMO, 'src/content/photos'))
			.map((file) => path.basename(file, '.yaml'))
			.sort()
		expect(DEMO_MASTERS.map((master) => master.id).sort()).toEqual(photos)
	})
})

describe('the tracked demo release', () => {
	const { descriptor } = loadReleaseDescriptor(DEMO)
	const config = loadImageConfig(DEMO)

	it('is active and holds every master at its size', () => {
		expect(descriptor.active).toBe(true)
		const photos = descriptor.manifest.photos
		expect(Object.keys(photos).sort()).toEqual(DEMO_MASTERS.map((master) => master.id).sort())
		for (const master of DEMO_MASTERS) {
			expect(photos[master.id]!.sourceWidth).toBe(master.width)
			expect(photos[master.id]!.sourceHeight).toBe(master.height)
		}
	})

	it('marks only the derivatives above the watermark threshold and embeds no rights', () => {
		const derivatives = Object.values(descriptor.manifest.photos).flatMap(
			(photo) => photo.derivatives,
		)
		for (const derivative of derivatives) {
			expect(derivative.watermarkProfile, derivative.objectKey).toBe(
				derivative.width > config.watermark.aboveWidth
					? config.watermark.profile.id
					: 'none',
			)
			expect(derivative.rightsEmbedded).toBe(false)
		}
		expect(derivatives.some((derivative) => derivative.watermarkProfile === 'none')).toBe(true)
		expect(derivatives.some((derivative) => derivative.watermarkProfile !== 'none')).toBe(true)
	})
})
