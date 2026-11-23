import type { ImageConfig } from '../../lib/images/build/config.ts'
import { planLadderWidths } from '../../lib/images/build/ladder.ts'
import type { Manifest } from '../../lib/images/manifest.ts'

// each photo of a manifest has exactly the widths the config plans for its source, every config
// format at each width, the watermark profile its width calls for and no side above the cap
export function validateLadderManifest(manifest: Manifest, config: ImageConfig): string[] {
	const errors: string[] = []
	const formats = [...config.formats].sort().join(',')
	for (const [photoId, photo] of Object.entries(manifest.photos)) {
		let planned: number[]
		try {
			planned = planLadderWidths(config, photo.sourceWidth, photo.sourceHeight).widths
		} catch (error) {
			errors.push(`${photoId}: ${(error as Error).message}`)
			continue
		}
		const actualWidths = [...new Set(photo.derivatives.map((item) => item.width))].sort(
			(a, b) => a - b,
		)
		if (actualWidths.join(',') !== planned.join(',')) {
			errors.push(
				`${photoId}: widths ${actualWidths.join(',')} do not match planned ${planned.join(',')}`,
			)
		}
		for (const width of actualWidths) {
			const derivatives = photo.derivatives.filter((item) => item.width === width)
			if (
				derivatives
					.map((item) => item.format)
					.sort()
					.join(',') !== formats
			)
				errors.push(`${photoId}/${width}: formats do not match config`)
			const expectedProfile =
				width > config.watermark.aboveWidth ? config.watermark.profile.id : 'none'
			for (const derivative of derivatives) {
				if (derivative.watermarkProfile !== expectedProfile)
					errors.push(`${photoId}/${width}/${derivative.format}: wrong watermark profile`)
				if (
					Math.max(derivative.width, derivative.height) > config.ladder.native.maxLongSide
				)
					errors.push(`${photoId}/${width}/${derivative.format}: exceeds maxLongSide`)
			}
		}
	}
	return errors
}
