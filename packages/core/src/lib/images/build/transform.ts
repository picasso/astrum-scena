import sharp from 'sharp'

export type OrientedSize = {
	// post-orient size: orientations 5–8 swap width and height
	width: number
	height: number
	// original EXIF orientation (1 when absent), recorded in the manifest
	orientation: number
}

// the displayed size of a master; every derivative is rendered after `.rotate()`, so EXIF orientation
// is baked into its pixels
export async function loadOriented(input: Buffer): Promise<OrientedSize> {
	// tolerate minor decoder warnings (truncated but valid files)
	const metadata = await sharp(input, { failOn: 'none' }).metadata()
	if (!metadata.width || !metadata.height) {
		throw new Error('source image has no readable dimensions')
	}
	const orientation = metadata.orientation ?? 1
	const swapAxes = orientation >= 5 && orientation <= 8
	return {
		width: swapAxes ? metadata.height : metadata.width,
		height: swapAxes ? metadata.width : metadata.height,
		orientation,
	}
}
