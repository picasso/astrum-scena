import type { ImageFormat } from '../../lib/images/build/config.ts'
import type { Manifest } from '../../lib/images/manifest.ts'

// every derivative of a manifest as an object of the bucket, photos in id order

export type ManifestObject = {
	photoId: string
	objectKey: string
	sha256: string
	byteSize: number
	format: ImageFormat
}

export function listManifestObjects(manifest: Manifest): ManifestObject[] {
	return Object.keys(manifest.photos)
		.sort()
		.flatMap((photoId) =>
			manifest.photos[photoId]!.derivatives.map((derivative) => ({
				photoId,
				objectKey: derivative.objectKey,
				sha256: derivative.sha256,
				byteSize: derivative.byteSize,
				format: derivative.format,
			})),
		)
}
