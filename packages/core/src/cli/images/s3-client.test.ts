import { Readable } from 'node:stream'

import * as sdk from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'

import { R2_ENV_VARS, resolveR2Credentials } from './r2-env.ts'
import {
	createS3R2Client,
	loadS3Module,
	openS3Bucket,
	S3_PACKAGE,
	type S3Sender,
} from './s3-client.ts'

// the S3 adapter on a recording sender, so no request leaves the process

function fakeSender(handler: (command: unknown) => unknown): { sender: S3Sender; sent: unknown[] } {
	const sent: unknown[] = []
	const sender = {
		send: async (command: unknown) => {
			sent.push(command)
			return handler(command)
		},
	} as unknown as S3Sender
	return { sender, sent }
}

const clientOf = (handler: (command: unknown) => unknown, readOnly = false) => {
	const { sender, sent } = fakeSender(handler)
	return { client: createS3R2Client({ sdk, sender, bucket: 'bucket-x', readOnly }), sent }
}

const PUT_OPTIONS = {
	contentType: 'image/avif',
	cacheControl: 'public, max-age=31536000, immutable',
	checksumSha256: 'c'.repeat(64),
}

describe('createS3R2Client', () => {
	it('maps a HEAD to the length and the sha256 metadata', async () => {
		const { client } = clientOf(() => ({
			ContentLength: 42,
			Metadata: { sha256: 'a'.repeat(64) },
			ContentType: 'image/avif',
			CacheControl: PUT_OPTIONS.cacheControl,
		}))
		expect(await client.head('photo/1w.avif')).toEqual({
			contentLength: 42,
			checksumSha256: 'a'.repeat(64),
			contentType: 'image/avif',
			cacheControl: PUT_OPTIONS.cacheControl,
		})
		const { client: bare } = clientOf(() => ({ ContentLength: 10 }))
		expect((await bare.head('x'))?.checksumSha256).toBeUndefined()
	})

	it('reads NotFound and a 404 as a missing object and rethrows any other error', async () => {
		const throwing = (error: object) => () => {
			throw Object.assign(new Error('failed'), error)
		}
		expect(await clientOf(throwing({ name: 'NotFound' })).client.head('x')).toBeNull()
		expect(
			await clientOf(throwing({ $metadata: { httpStatusCode: 404 } })).client.head('x'),
		).toBeNull()
		await expect(
			clientOf(throwing({ $metadata: { httpStatusCode: 500 } })).client.head('x'),
		).rejects.toThrow('failed')
	})

	it('puts the sha256 into the object metadata with the content type and caching', async () => {
		const { client, sent } = clientOf(() => ({}))
		await client.put('k.avif', Buffer.from('bytes'), PUT_OPTIONS)
		expect(sent).toHaveLength(1)
		expect(sent[0]).toBeInstanceOf(sdk.PutObjectCommand)
		expect((sent[0] as sdk.PutObjectCommand).input).toMatchObject({
			Bucket: 'bucket-x',
			Key: 'k.avif',
			Metadata: { sha256: PUT_OPTIONS.checksumSha256 },
			ContentType: 'image/avif',
			CacheControl: PUT_OPTIONS.cacheControl,
		})
	})

	it('refuses a put when read-only, sending nothing', async () => {
		const { client, sent } = clientOf(() => ({}), true)
		await expect(client.put('k', Buffer.from('x'), PUT_OPTIONS)).rejects.toThrow(/read-only/)
		expect(sent).toEqual([])
	})

	it('streams the body of a GET and fails without one', async () => {
		const { client, sent } = clientOf(() => ({ Body: Readable.from([Buffer.from('hello')]) }))
		let read = ''
		for await (const chunk of await client.openReadStream('k')) read += String(chunk)
		expect(read).toBe('hello')
		expect(sent[0]).toBeInstanceOf(sdk.GetObjectCommand)
		await expect(clientOf(() => ({})).client.openReadStream('k')).rejects.toThrow(/no body/)
	})

	it('lists every page in key order and fails on a truncated page without a token', async () => {
		const pages = [
			{
				Contents: [{ Key: 'b' }, { Key: 'a' }],
				IsTruncated: true,
				NextContinuationToken: 't1',
			},
			{ Contents: [{ Key: 'c' }], IsTruncated: false },
		]
		let call = 0
		const { client, sent } = clientOf(() => pages[call++])
		expect(await client.list('prefix/')).toEqual(['a', 'b', 'c'])
		expect(sent[0]).toBeInstanceOf(sdk.ListObjectsV2Command)
		expect((sent[1] as sdk.ListObjectsV2Command).input.ContinuationToken).toBe('t1')
		const truncated = clientOf(() => ({ Contents: [{ Key: 'a' }], IsTruncated: true }))
		await expect(truncated.client.list()).rejects.toThrow(/NextContinuationToken/)
	})
})

describe('loadS3Module', () => {
	const notFound = (name: string) =>
		Object.assign(
			new Error(`Cannot find package '${name}' imported from /site/node_modules/x.js`),
			{ code: 'ERR_MODULE_NOT_FOUND' },
		)

	it('names the package to install when it is missing, before any request', async () => {
		const open = openS3Bucket(() => Promise.reject(notFound(S3_PACKAGE)))
		const credentials = resolveR2Credentials(
			Object.fromEntries(R2_ENV_VARS.map((name) => [name, 'value'])),
		)
		await expect(open(credentials, { readOnly: true })).rejects.toThrow(
			`the bucket commands need ${S3_PACKAGE}, an optional peer of the core; install it`,
		)
	})

	it('rethrows a missing dependency of the package as it is', async () => {
		await expect(loadS3Module(() => Promise.reject(notFound('@smithy/other')))).rejects.toThrow(
			"Cannot find package '@smithy/other'",
		)
	})
})

describe('resolveR2Credentials', () => {
	const FULL = {
		R2_IMAGES_ACCOUNT_ID: 'acct123',
		R2_IMAGES_ACCESS_KEY_ID: 'super-secret-value',
		R2_IMAGES_SECRET_ACCESS_KEY: 'another-secret',
		R2_IMAGES_BUCKET: 'images',
	}

	it('derives the R2 endpoint from the account id', () => {
		expect(resolveR2Credentials(FULL)).toMatchObject({
			endpoint: 'https://acct123.r2.cloudflarestorage.com',
			bucket: 'images',
		})
	})

	it('names every missing variable, an empty one included, and never a value', () => {
		let message = ''
		try {
			resolveR2Credentials({ ...FULL, R2_IMAGES_ACCOUNT_ID: '', R2_IMAGES_BUCKET: undefined })
		} catch (error) {
			message = (error as Error).message
		}
		expect(message).toContain('set R2_IMAGES_ACCOUNT_ID, R2_IMAGES_BUCKET in the environment')
		expect(message).not.toMatch(/super-secret-value|another-secret/)
	})
})
