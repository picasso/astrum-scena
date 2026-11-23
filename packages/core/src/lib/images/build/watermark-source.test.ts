import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { siteRoot } from '../../../config/site-root.ts'
import { loadImageConfig } from './config.ts'
import { approvedWatermarkBytes, createWatermarkResolver } from './watermark-source.ts'

const config = loadImageConfig(siteRoot)
const asset = config.watermark.assets[0]!

const scratch = mkdtempSync(path.join(tmpdir(), 'watermark-source-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('approvedWatermarkBytes', () => {
	it('reads the demo asset from the site root and verifies its sha256', async () => {
		const bytes = await approvedWatermarkBytes(config, siteRoot, asset.id)
		expect(bytes.byteLength).toBeGreaterThan(0)
	})

	it('rejects an unknown assetId', async () => {
		await expect(approvedWatermarkBytes(config, siteRoot, 'no-such-asset')).rejects.toThrow(
			/unknown watermark assetId/,
		)
	})

	it('fails closed on a missing file and on changed bytes', async () => {
		await expect(approvedWatermarkBytes(config, scratch, asset.id)).rejects.toThrow(/not found/)
		const changed = path.join(scratch, asset.file)
		mkdirSync(path.dirname(changed), { recursive: true })
		writeFileSync(changed, 'not the approved mark')
		await expect(approvedWatermarkBytes(config, scratch, asset.id)).rejects.toThrow(
			/sha256 mismatch/,
		)
	})
})

describe('createWatermarkResolver', () => {
	it('normalizes the approved mark once per asset', async () => {
		const resolve = createWatermarkResolver({ config, siteRoot })
		const first = resolve(asset.id)
		expect(resolve(asset.id)).toBe(first)
		const mark = await first
		expect(mark.width).toBeGreaterThan(0)
		expect(mark.height).toBeGreaterThan(0)
	})
})
