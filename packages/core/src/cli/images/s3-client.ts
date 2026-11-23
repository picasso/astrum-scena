import type { Readable } from 'node:stream'

import type { S3Client } from '@aws-sdk/client-s3'

import type {
	BucketOpener,
	BucketOptions,
	R2Client,
	R2ObjectHead,
	R2PutOptions,
} from './r2-client.ts'
import type { R2Credentials } from './r2-env.ts'

// the R2 client over the S3 API. The SDK is an optional peer of the core, imported only when a bucket
// command opens the bucket, so a site without it runs every other command. The sha256 lives in object
// metadata so HEAD returns it; without it, remote-verify.ts hashes a streamed GET instead

export const S3_PACKAGE = '@aws-sdk/client-s3'

const SHA256_METADATA_KEY = 'sha256'

export type S3Module = typeof import('@aws-sdk/client-s3')

// picking `send` lets a test double keep strict command typing
export type S3Sender = Pick<S3Client, 'send'>

const isNotFound = (error: unknown): boolean => {
	if (typeof error !== 'object' || error === null) return false
	const { name, $metadata } = error as { name?: string; $metadata?: { httpStatusCode?: number } }
	return name === 'NotFound' || $metadata?.httpStatusCode === 404
}

export type S3R2ClientOptions = BucketOptions & { sdk: S3Module; sender: S3Sender; bucket: string }

export function createS3R2Client({ sdk, sender, bucket, readOnly }: S3R2ClientOptions): R2Client {
	const head = async (key: string): Promise<R2ObjectHead | null> => {
		let output
		try {
			output = await sender.send(new sdk.HeadObjectCommand({ Bucket: bucket, Key: key }))
		} catch (error) {
			if (isNotFound(error)) return null
			throw error
		}
		if (output.ContentLength === undefined)
			throw new Error(`R2 HEAD "${key}" returned no ContentLength`)
		return {
			contentLength: output.ContentLength,
			checksumSha256: output.Metadata?.[SHA256_METADATA_KEY],
			contentType: output.ContentType,
			cacheControl: output.CacheControl,
		}
	}

	const put = async (key: string, body: Buffer, options: R2PutOptions): Promise<void> => {
		if (readOnly) throw new Error(`refusing to put "${key}": the bucket is open read-only`)
		await sender.send(
			new sdk.PutObjectCommand({
				Bucket: bucket,
				Key: key,
				Body: body,
				ContentType: options.contentType,
				CacheControl: options.cacheControl,
				Metadata: { [SHA256_METADATA_KEY]: options.checksumSha256 },
			}),
		)
	}

	const openReadStream = async (key: string): Promise<Readable> => {
		const output = await sender.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key }))
		if (!output.Body) throw new Error(`R2 GET "${key}" returned no body`)
		// in Node the SDK body is a Readable (sdkStreamMixin over IncomingMessage)
		return output.Body as Readable
	}

	const list = async (prefix = ''): Promise<string[]> => {
		const keys: string[] = []
		let continuationToken: string | undefined
		do {
			const output = await sender.send(
				new sdk.ListObjectsV2Command({
					Bucket: bucket,
					Prefix: prefix,
					ContinuationToken: continuationToken,
				}),
			)
			for (const object of output.Contents ?? []) if (object.Key) keys.push(object.Key)
			// fail closed rather than return a silently incomplete list
			if (output.IsTruncated && !output.NextContinuationToken)
				throw new Error('R2 list truncated but returned no NextContinuationToken')
			continuationToken = output.IsTruncated ? output.NextContinuationToken : undefined
		} while (continuationToken)
		return keys.sort()
	}

	return { head, put, openReadStream, list }
}

const isMissingPackage = (error: unknown): boolean =>
	(error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' &&
	(error as Error).message.includes(`'${S3_PACKAGE}'`)

export async function loadS3Module(
	importModule: () => Promise<S3Module> = () => import('@aws-sdk/client-s3'),
): Promise<S3Module> {
	try {
		return await importModule()
	} catch (error) {
		if (!isMissingPackage(error)) throw error
		throw new Error(
			`the bucket commands need ${S3_PACKAGE}, an optional peer of the core; install it in the ` +
				`site: pnpm add -D ${S3_PACKAGE}`,
			{ cause: error },
		)
	}
}

// R2 requires `forcePathStyle`
export const openS3Bucket =
	(importModule?: () => Promise<S3Module>): BucketOpener =>
	async (credentials: R2Credentials, { readOnly }: BucketOptions) => {
		const sdk = await loadS3Module(importModule)
		const sender = new sdk.S3Client({
			region: 'auto',
			endpoint: credentials.endpoint,
			forcePathStyle: true,
			credentials: {
				accessKeyId: credentials.accessKeyId,
				secretAccessKey: credentials.secretAccessKey,
			},
		})
		return createS3R2Client({ sdk, sender, bucket: credentials.bucket, readOnly })
	}
