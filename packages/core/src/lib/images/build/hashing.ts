import { createHash } from 'node:crypto'

import type { ImageFormat } from './config.ts'

// keys hash the final bytes (after resize, watermark, encode and rights), so a change in any
// visible or embedded layer yields a new immutable URL

export function sha256Bytes(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex')
}

export function ladderObjectKey(
	photoId: string,
	width: number,
	format: ImageFormat,
	bytesSha256: string,
): string {
	return `${photoId}/${width}w-${bytesSha256}.${format}`
}
