import { createHash } from 'node:crypto'

import type { R2Client, R2ObjectHead } from './r2-client.ts'

// cheap before expensive: HEAD checks the length and the stored sha256, and only an object without a
// stored checksum is streamed to hash it; any mismatch is a possible collision or corruption and
// blocks sync and the live check

export type ExpectedObject = { sha256: string; byteSize: number }

export type VerifyOutcome = { checksumSource: 'metadata' | 'streamed-get' }

async function streamSha256(client: R2Client, key: string): Promise<string> {
	const hash = createHash('sha256')
	for await (const chunk of await client.openReadStream(key)) hash.update(chunk as Buffer)
	return hash.digest('hex')
}

// takes the caller's HEAD to avoid a second request
export async function verifyAgainstHead(
	client: R2Client,
	key: string,
	head: R2ObjectHead,
	expected: ExpectedObject,
): Promise<VerifyOutcome> {
	if (head.contentLength !== expected.byteSize)
		throw new Error(
			`remote object "${key}" length ${head.contentLength} != manifest ${expected.byteSize}`,
		)
	if (head.checksumSha256 !== undefined) {
		if (head.checksumSha256 !== expected.sha256)
			throw new Error(
				`remote object "${key}" stored checksum mismatch (collision/corruption)`,
			)
		return { checksumSource: 'metadata' }
	}
	if ((await streamSha256(client, key)) !== expected.sha256)
		throw new Error(`remote object "${key}" streamed sha256 mismatch (collision/corruption)`)
	return { checksumSource: 'streamed-get' }
}

// after an upload and in the live check every key must exist, so a missing object is an error
export async function verifyRemoteObject(
	client: R2Client,
	key: string,
	expected: ExpectedObject,
): Promise<VerifyOutcome> {
	const head = await client.head(key)
	if (!head) throw new Error(`remote object "${key}" is missing`)
	return verifyAgainstHead(client, key, head, expected)
}
