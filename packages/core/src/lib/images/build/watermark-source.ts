import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { ImageConfig } from './config.ts'
import { sha256Bytes } from './hashing.ts'
import { type NormalizedWatermark, normalizeWatermarkBounds } from './watermark.ts'

// the approved asset from the image config, read from the site root and verified by its sha256
export async function approvedWatermarkBytes(
	config: Pick<ImageConfig, 'watermark'>,
	siteRoot: string,
	assetId: string,
): Promise<Buffer> {
	const asset = config.watermark.assets.find((candidate) => candidate.id === assetId)
	if (!asset) throw new Error(`unknown watermark assetId "${assetId}"`)
	let bytes: Buffer
	try {
		bytes = await readFile(path.join(siteRoot, asset.file))
	} catch {
		throw new Error(`watermark asset "${asset.file}" not found`)
	}
	if (sha256Bytes(bytes) !== asset.sha256) {
		throw new Error(
			`watermark asset "${asset.file}" sha256 mismatch (expected ${asset.sha256})`,
		)
	}
	return bytes
}

export type WatermarkResolver = (assetId: string) => Promise<NormalizedWatermark>

// memoized so each asset is read and normalized once
export function createWatermarkResolver(options: {
	config: Pick<ImageConfig, 'watermark'>
	siteRoot: string
}): WatermarkResolver {
	const cache = new Map<string, Promise<NormalizedWatermark>>()
	return (assetId) => {
		let pending = cache.get(assetId)
		if (!pending) {
			pending = approvedWatermarkBytes(options.config, options.siteRoot, assetId).then(
				normalizeWatermarkBounds,
			)
			cache.set(assetId, pending)
		}
		return pending
	}
}
