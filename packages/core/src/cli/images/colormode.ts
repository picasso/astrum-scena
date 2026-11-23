import sharp from 'sharp'

// toned black-and-white (sepia, split-tone) has real saturation and is detected as `color`; an
// authored colorMode overrides the detected one for those (ADR-0010). The threshold is conservative:
// true black-and-white averages near zero saturation and color sits well above it; a downscaled copy
// keeps the analysis cheap and deterministic

export const COLOR_SATURATION_THRESHOLD = 0.08
const ANALYSIS_EDGE = 64

export type ColorMode = 'color' | 'black-and-white'

export async function detectColorMode(masterBytes: Buffer): Promise<ColorMode> {
	const { data, info } = await sharp(masterBytes, { failOn: 'none' })
		.resize(ANALYSIS_EDGE, ANALYSIS_EDGE, { fit: 'inside', withoutEnlargement: true })
		.removeAlpha()
		.toColourspace('srgb')
		.raw()
		.toBuffer({ resolveWithObject: true })

	const channels = info.channels
	if (channels < 3) return 'black-and-white'

	let saturationSum = 0
	let pixels = 0
	for (let i = 0; i + 2 < data.length; i += channels) {
		const max = Math.max(data[i]!, data[i + 1]!, data[i + 2]!)
		const min = Math.min(data[i]!, data[i + 1]!, data[i + 2]!)
		saturationSum += max === 0 ? 0 : (max - min) / max
		pixels += 1
	}

	const average = pixels > 0 ? saturationSum / pixels : 0
	return average < COLOR_SATURATION_THRESHOLD ? 'black-and-white' : 'color'
}
