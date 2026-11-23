// picks a column share that keeps the image large without leaving a thin strip of text beside it
// (docs/blocks/wrap-around.md). The band limits are a visually tuned heuristic, not content API, so
// they can move without touching MDX

export type ImageAspect = { width: number; height: number }

// one of the six widths proven on the legacy Gutenberg block
export function autoWidthForRatio(ratio: number): number {
	if (ratio < 0.75) return 33
	if (ratio < 1.15) return 40
	if (ratio < 1.55) return 45
	if (ratio < 1.9) return 50
	if (ratio <= 2.5) return 55
	return 60
}

// a vertical stack of equal-width images: R = 1 / Σ(1/rᵢ), rᵢ = w/h. The gap between images is
// ignored: it barely changes the total height
export function effectiveRatio(images: readonly ImageAspect[]): number {
	if (images.length === 0) throw new Error('WrapAround width: images must be a non-empty group')
	let inverse = 0
	for (const { width, height } of images) {
		if (!(width > 0) || !(height > 0)) {
			throw new Error('WrapAround width: image dimensions must be positive')
		}
		inverse += height / width
	}
	return 1 / inverse
}

export function resolveWrapWidth(images: readonly ImageAspect[], manualWidth?: number): number {
	if (manualWidth != null) return manualWidth
	return autoWidthForRatio(effectiveRatio(images))
}
