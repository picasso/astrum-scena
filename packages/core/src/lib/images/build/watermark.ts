import sharp, { type OutputInfo } from 'sharp'

import type { WatermarkPosition } from './config.ts'

// the mark arrives as a buffer, so the same code is proven on a synthetic mark in tests and runs
// unchanged with the approved asset; nothing here touches disk

export type NormalizedWatermark = {
	// PNG bytes trimmed to the visible pixels
	buffer: Buffer
	width: number
	height: number
}

// PNG/SVG marks often carry transparent padding; trimming it keeps the visible scale equal to the
// computed one
export async function normalizeWatermarkBounds(watermark: Buffer): Promise<NormalizedWatermark> {
	const base = sharp(watermark, { failOn: 'none' }).ensureAlpha()

	// a fully transparent asset would silently skip a `required` watermark, so it fails before trim
	// alpha is the last channel whatever the colour space: grey+alpha has two, CMYK+alpha five
	const stats = await base.clone().stats()
	const alpha = stats.channels.at(-1)
	if (alpha && alpha.max === 0) {
		throw new Error('watermark asset is fully transparent (no visible mark)')
	}

	let trimmed: { data: Buffer; info: OutputInfo }
	try {
		trimmed = await base
			.clone()
			.trim({ background: '#00000000', threshold: 1 })
			.png()
			.toBuffer({ resolveWithObject: true })
	} catch {
		// trim throws "image is empty" when there is nothing to cut; keep the original bounds
		const info = await sharp(watermark, { failOn: 'none' }).ensureAlpha().png().toBuffer({
			resolveWithObject: true,
		})
		return { buffer: info.data, width: info.info.width, height: info.info.height }
	}
	return { buffer: trimmed.data, width: trimmed.info.width, height: trimmed.info.height }
}

export type WatermarkComposeSpec = {
	// fraction (0..1] of the image width, clamped to minPx..maxPx
	scale: number
	minPx: number
	maxPx: number
	position: WatermarkPosition
	// pixels from the image edge
	inset: number
	// 0..1, multiplied into the mark's own alpha
	opacity: number
}

export type WatermarkLayout = {
	width: number
	height: number
	// top-left corner, inset and safe area already applied
	left: number
	top: number
}

// kept apart from sharp so the geometry is unit-testable. The mark never leaves the image and keeps
// the inset where it fits; on extreme aspect ratios or tiny images it shrinks into the safe area
export function computeWatermarkLayout(
	imageWidth: number,
	imageHeight: number,
	watermarkWidth: number,
	watermarkHeight: number,
	spec: WatermarkComposeSpec,
): WatermarkLayout {
	if (imageWidth < 1 || imageHeight < 1) {
		throw new Error('image dimensions must be >= 1')
	}
	if (watermarkWidth < 1 || watermarkHeight < 1) {
		throw new Error('watermark dimensions must be >= 1')
	}

	const aspect = watermarkHeight / watermarkWidth
	const inset = Math.max(0, Math.round(spec.inset))

	// at least 1px stays for the mark even when the inset would eat a tiny image; since inset >= 0,
	// fitting the safe area implies fitting the image
	const availableWidth = Math.max(1, imageWidth - 2 * inset)
	const availableHeight = Math.max(1, imageHeight - 2 * inset)

	const desiredWidth = Math.max(
		spec.minPx,
		Math.min(spec.maxPx, Math.round(spec.scale * imageWidth)),
	)

	// the tightest axis decides, so both sides fit the safe area before rounding
	const fit = Math.min(
		1,
		availableWidth / desiredWidth,
		availableHeight / (desiredWidth * aspect),
	)
	let width = Math.max(1, Math.floor(desiredWidth * fit))
	let height = Math.max(1, Math.round(width * aspect))

	// rounding can push the height past the safe area; recompute both axes from it. The final
	// clamps keep the mark inside the image, since sharp composite fails on overflow; aspect can
	// distort only in the degenerate 1px case where it cannot be kept
	if (height > availableHeight) {
		width = Math.max(1, Math.floor(availableHeight / aspect))
		height = Math.max(1, Math.round(width * aspect))
	}
	if (width > availableWidth) width = availableWidth
	if (height > availableHeight) height = availableHeight

	// when the mark plus both insets does not fit, the inset shrinks instead of going negative
	const insetX = Math.max(0, Math.min(inset, imageWidth - width))
	const insetY = Math.max(0, Math.min(inset, imageHeight - height))
	const centerLeft = Math.round((imageWidth - width) / 2)
	const centerTop = Math.round((imageHeight - height) / 2)
	const rightLeft = imageWidth - width - insetX
	const bottomTop = imageHeight - height - insetY

	let left: number
	let top: number
	switch (spec.position) {
		case 'top-left':
			left = insetX
			top = insetY
			break
		case 'top-right':
			left = rightLeft
			top = insetY
			break
		case 'bottom-left':
			left = insetX
			top = bottomTop
			break
		case 'center':
			left = centerLeft
			top = centerTop
			break
		// there is no focus data yet, so focal-safe falls back to bottom-right
		case 'focal-safe':
		case 'bottom-right':
		default:
			left = rightLeft
			top = bottomTop
			break
	}

	// guards against rounding drift
	left = Math.max(0, Math.min(left, imageWidth - width))
	top = Math.max(0, Math.min(top, imageHeight - height))
	return { width, height, left, top }
}

export async function composeWatermark(
	baseImage: Buffer,
	normalizedWatermark: NormalizedWatermark,
	layout: WatermarkLayout,
	opacity: number,
): Promise<Buffer> {
	const clampedOpacity = Math.max(0, Math.min(1, opacity))
	const alphaByte = Math.round(clampedOpacity * 255)

	// `fill` is safe: the layout already preserves the aspect
	const resized = await sharp(normalizedWatermark.buffer, { failOn: 'none' })
		.resize({ width: layout.width, height: layout.height, fit: 'fill' })
		.ensureAlpha()
		.png()
		.toBuffer()

	// a tiled 1×1 pixel with alpha = opacity under `dest-in` scales the mark's alpha by opacity
	const withOpacity =
		alphaByte >= 255
			? resized
			: await sharp(resized)
					.composite([
						{
							input: Buffer.from([255, 255, 255, alphaByte]),
							raw: { width: 1, height: 1, channels: 4 },
							tile: true,
							blend: 'dest-in',
						},
					])
					.png()
					.toBuffer()

	return sharp(baseImage, { failOn: 'none' })
		.composite([{ input: withOpacity, left: layout.left, top: layout.top }])
		.png()
		.toBuffer()
}
