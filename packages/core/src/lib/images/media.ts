import type { ManifestV3 } from './manifest.ts'

// runtime media adapter reads one photo from manifest v3 and applies an optional width cap.

export type ImageFormat = 'avif' | 'webp'

export type DerivativeRef = {
	width: number
	height: number
	format: ImageFormat
	objectKey: string
}

export type PhotoMedia = {
	photoId: string
	width: number
	height: number
	dominantColor: string
	derivatives: DerivativeRef[]
	formats: ImageFormat[]
	rightsEmbeddedByFormat: Record<ImageFormat, boolean>
}

export function resolvePhotoMedia(
	manifest: ManifestV3,
	photoId: string,
	options: { maxWidth?: number } = {},
): PhotoMedia {
	const entry = manifest.photos[photoId]
	if (!entry) throw new Error(`manifest has no photo "${photoId}"`)
	const selected = entry.derivatives.filter(
		(item) => options.maxWidth === undefined || item.width <= options.maxWidth,
	)
	if (selected.length === 0) {
		throw new Error(`photo "${photoId}" has no derivative within maxWidth ${options.maxWidth}`)
	}
	const derivatives = selected.map(({ width, height, format, objectKey }) => ({
		width,
		height,
		format,
		objectKey,
	}))
	const largest = selected.reduce((max, item) => (item.width > max.width ? item : max))
	const formats = [...new Set(selected.map((item) => item.format))].sort()
	const rightsEmbeddedByFormat: Record<ImageFormat, boolean> = { avif: false, webp: false }
	for (const format of formats) {
		rightsEmbeddedByFormat[format] = selected
			.filter((item) => item.format === format)
			.every((item) => item.rightsEmbedded)
	}
	return {
		photoId,
		width: largest.width,
		height: largest.height,
		dominantColor: entry.dominantColor,
		derivatives,
		formats,
		rightsEmbeddedByFormat,
	}
}

const MIME_BY_FORMAT: Record<ImageFormat, string> = {
	avif: 'image/avif',
	webp: 'image/webp',
}

export type PictureSource = {
	type: string
	srcset: string
}

export type PictureModel = {
	sources: PictureSource[]
	fallback: { src: string; width: number; height: number }
	width: number
	height: number
	sizes: string
	alt: string
	// aspect-ratio and dominant-color placeholder: no JS and no layout shift
	style: string
	// a format without embedded rights metadata needs the visible rights notice
	rightsFallbackNeeded: boolean
}

function derivativeUrl(originBase: string, objectKey: string): string {
	const base = originBase.replace(/\/+$/, '')
	return `${base}/${objectKey}`
}

// build <picture> from selected derivatives; presentation passes its own explicit `sizes`.
export function buildPictureModel(
	media: PhotoMedia,
	options: { originBase: string; alt: string; sizes: string },
): PictureModel {
	const orderedFormats = (['avif', 'webp'] as const).filter((format) =>
		media.formats.includes(format),
	)
	const sources: PictureSource[] = orderedFormats.map((format) => {
		const srcset = media.derivatives
			.filter((item) => item.format === format)
			.map((item) => `${derivativeUrl(options.originBase, item.objectKey)} ${item.width}w`)
			.join(', ')
		return { type: MIME_BY_FORMAT[format], srcset }
	})

	// webp is the most widely supported format in the set, so the fallback prefers it
	const fallbackFormat: ImageFormat = media.formats.includes('webp') ? 'webp' : media.formats[0]!
	const fallbackDerivative = media.derivatives
		.filter((item) => item.format === fallbackFormat)
		.reduce((max, item) => (item.width > max.width ? item : max))

	const rightsFallbackNeeded = media.formats.some(
		(format) => !media.rightsEmbeddedByFormat[format],
	)

	return {
		sources,
		fallback: {
			src: derivativeUrl(options.originBase, fallbackDerivative.objectKey),
			width: fallbackDerivative.width,
			height: fallbackDerivative.height,
		},
		width: media.width,
		height: media.height,
		sizes: options.sizes,
		alt: options.alt,
		style: `aspect-ratio: ${media.width} / ${media.height}; background-color: ${media.dominantColor};`,
		rightsFallbackNeeded,
	}
}
