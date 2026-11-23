import type { ImageFormat, PhotoMedia } from '../images/media.ts'

// progressive enhancement: the grid anchor links to the photo page without JS, while viewer data
// goes separately into `data-pswp-*` for the PhotoSwipe island. Only dimensions and URLs built from
// manifest object keys leave here, never master filenames, EXIF/GPS or source paths

export type ViewerData = {
	width: number
	height: number
	// widest derivative, the fallback src PhotoSwipe opens with
	src: string
	// ascending width order
	srcsetByFormat: Record<ImageFormat, string>
}

function derivativeUrl(originBase: string, objectKey: string): string {
	return `${originBase.replace(/\/+$/, '')}/${objectKey}`
}

// intrinsic dimensions let PhotoSwipe know the aspect ratio without a layout shift
export function buildViewerData(media: PhotoMedia, originBase: string): ViewerData {
	const orderedFormats = (['avif', 'webp'] as const).filter((format) =>
		media.formats.includes(format),
	)

	const srcsetByFormat = {} as Record<ImageFormat, string>
	for (const format of orderedFormats) {
		srcsetByFormat[format] = media.derivatives
			.filter((item) => item.format === format)
			.map((item) => `${derivativeUrl(originBase, item.objectKey)} ${item.width}w`)
			.join(', ')
	}

	// webp has the wider browser support, so it is the preferred fallback format
	const fallbackFormat: ImageFormat = media.formats.includes('webp') ? 'webp' : media.formats[0]!
	const widest = media.derivatives
		.filter((item) => item.format === fallbackFormat)
		.reduce((max, item) => (item.width > max.width ? item : max))

	return {
		width: media.width,
		height: media.height,
		src: derivativeUrl(originBase, widest.objectKey),
		srcsetByFormat,
	}
}
