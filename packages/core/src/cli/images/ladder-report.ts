import type { ImageConfig } from '../../lib/images/build/config.ts'
import type { Manifest } from '../../lib/images/manifest.ts'
import { listManifestObjects } from './manifest-objects.ts'

export type LadderReport = {
	photos: number
	files: number
	bytes: number
	duplicates: string[]
	withoutWatermark: string[]
}

export function summarizeLadder(manifest: Manifest, config: ImageConfig): LadderReport {
	const duplicates: string[] = []
	const withoutWatermark: string[] = []
	for (const [photoId, photo] of Object.entries(manifest.photos)) {
		const seen = new Set<string>()
		let hasWatermark = false
		for (const derivative of photo.derivatives) {
			const id = `${derivative.width}/${derivative.format}`
			if (seen.has(id)) duplicates.push(`${photoId}/${id}`)
			seen.add(id)
			if (
				derivative.width > config.watermark.aboveWidth &&
				derivative.watermarkProfile === config.watermark.profile.id
			)
				hasWatermark = true
		}
		if (!hasWatermark) withoutWatermark.push(photoId)
	}
	const objects = listManifestObjects(manifest)
	return {
		photos: Object.keys(manifest.photos).length,
		files: objects.length,
		bytes: objects.reduce((sum, object) => sum + object.byteSize, 0),
		duplicates,
		withoutWatermark: withoutWatermark.sort(),
	}
}

function record(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value))
		throw new Error('comparison manifest has an invalid object')
	return value as Record<string, unknown>
}

// a release cut before the width ladder (photos with `roles`) is summarized without the v3 schema
export function summarizeRelease(raw: unknown): { photos: number; files: number; bytes: number } {
	const photos = record(record(raw).photos)
	let files = 0
	let bytes = 0
	for (const photo of Object.values(photos)) {
		const entry = record(photo)
		const groups =
			'derivatives' in entry ? [entry] : Object.values(record(entry.roles)).map(record)
		for (const group of groups) {
			if (!Array.isArray(group.derivatives)) throw new Error('comparison derivatives missing')
			for (const rawDerivative of group.derivatives) {
				const { byteSize } = record(rawDerivative)
				if (typeof byteSize !== 'number' || !Number.isSafeInteger(byteSize) || byteSize < 1)
					throw new Error('comparison derivative has invalid byteSize')
				files += 1
				bytes += byteSize
			}
		}
	}
	return { photos: Object.keys(photos).length, files, bytes }
}
