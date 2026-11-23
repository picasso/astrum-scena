import type { Readable } from 'node:stream'

import type { ImageFormat } from '../../lib/images/build/config.ts'
import type { R2Credentials } from './r2-env.ts'

// sync, prune and the live check depend only on this client; the S3-backed one lives in s3-client.ts
// and loads the optional peer lazily, and tests use an in-memory fake

// keys include the hash of the final bytes, so new bytes get a new key and an object can be cached
// forever without revalidation
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

export const contentTypeForFormat = (format: ImageFormat): string =>
	format === 'avif' ? 'image/avif' : 'image/webp'

// `checksumSha256` is undefined when the object metadata has no sha256; verification then has to
// stream the object and hash it itself
export type R2ObjectHead = {
	contentLength: number
	checksumSha256?: string
	contentType?: string
	cacheControl?: string
}

export type R2PutOptions = {
	contentType: string
	cacheControl: string
	// stored in ASCII object metadata so HEAD can return it
	checksumSha256: string
}

// no batch or delete operations on purpose: prune only reports, and sync never overwrites or
// deletes bytes it did not write
export type R2Client = {
	// null for a missing object, so absence is not confused with a network error
	head: (key: string) => Promise<R2ObjectHead | null>
	put: (key: string, body: Buffer, options: R2PutOptions) => Promise<void>
	// streamed so verification does not hold the whole object in memory
	openReadStream: (key: string) => Promise<Readable>
	list: (prefix?: string) => Promise<string[]>
}

// a read-only client refuses every put before any network call: the live check and prune never write
export type BucketOptions = { readOnly: boolean }

export type BucketOpener = (credentials: R2Credentials, options: BucketOptions) => Promise<R2Client>
