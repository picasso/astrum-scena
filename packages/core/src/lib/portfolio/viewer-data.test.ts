import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { parseManifest } from '../images/manifest.ts'
import { resolvePhotoMedia } from '../images/media.ts'
import { buildViewerData } from './viewer-data.ts'

const manifest = parseManifest(
	JSON.parse(
		readFileSync(
			fileURLToPath(
				new URL('../images/__fixtures__/s9-ladder-manifest.json', import.meta.url),
			),
			'utf8',
		),
	),
)

const ORIGIN = 'https://img.example.test'
const viewerMedia = resolvePhotoMedia(manifest, 'morning-ridge')

describe('buildViewerData', () => {
	it('returns intrinsic width/height of the widest derivative', () => {
		const data = buildViewerData(viewerMedia, ORIGIN)
		expect(data.width).toBe(viewerMedia.width)
		expect(data.height).toBe(viewerMedia.height)
	})

	it('builds ascending-width srcset per format from validated object keys', () => {
		const data = buildViewerData(viewerMedia, ORIGIN)
		for (const format of viewerMedia.formats) {
			const srcset = data.srcsetByFormat[format]
			expect(srcset).toBeTruthy()
			const widths = [...srcset.matchAll(/ (\d+)w/g)].map((match) => Number(match[1]))
			expect(widths).toEqual([...widths].sort((a, b) => a - b))
			// URLs come only from the origin plus a manifest object key
			for (const entry of srcset.split(', ')) {
				expect(entry.startsWith(`${ORIGIN}/`)).toBe(true)
			}
		}
	})

	it('picks the widest webp as the fallback src', () => {
		const data = buildViewerData(viewerMedia, ORIGIN)
		const widestWebp = viewerMedia.derivatives
			.filter((item) => item.format === 'webp')
			.reduce((max, item) => (item.width > max.width ? item : max))
		expect(data.src).toBe(`${ORIGIN}/${widestWebp.objectKey}`)
	})

	it('never leaks a leading double slash when originBase has a trailing slash', () => {
		const data = buildViewerData(viewerMedia, `${ORIGIN}/`)
		expect(data.src.startsWith(`${ORIGIN}/`)).toBe(true)
		expect(data.src.includes(`${ORIGIN}//`)).toBe(false)
	})
})
