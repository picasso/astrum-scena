import { describe, expect, it } from 'vitest'

import { checkLive } from './live-check.ts'
import { decideLiveGate } from './live-gate.ts'
import { planPrune } from './prune.ts'
import { verifyRemoteObject } from './remote-verify.ts'
import { createFakeR2Client, sha256, syntheticManifest } from './test-fixtures.ts'

const BODY = Buffer.from('final-derivative-bytes')
const HASH = sha256(BODY)
const EXPECTED = { sha256: HASH, byteSize: BODY.length }

describe('verifyRemoteObject', () => {
	it('passes on the HEAD length and stored checksum, without a GET', async () => {
		const client = createFakeR2Client()
		client.seed('key', BODY, HASH)
		expect(await verifyRemoteObject(client, 'key', EXPECTED)).toEqual({
			checksumSource: 'metadata',
		})
		expect(client.calls.get).toBe(0)
	})

	it('streams the object when its checksum metadata is missing', async () => {
		const client = createFakeR2Client()
		client.seedRaw('key', { body: BODY })
		expect(await verifyRemoteObject(client, 'key', EXPECTED)).toEqual({
			checksumSource: 'streamed-get',
		})
		expect(client.calls.get).toBe(1)
	})

	it('blocks on a missing object, a wrong length, a stored or a streamed mismatch', async () => {
		const client = createFakeR2Client()
		await expect(verifyRemoteObject(client, 'key', EXPECTED)).rejects.toThrow('is missing')
		client.seedRaw('key', { body: BODY, checksumSha256: HASH, contentLengthOverride: 999 })
		await expect(verifyRemoteObject(client, 'key', EXPECTED)).rejects.toThrow(/length 999/)
		client.seedRaw('key', { body: BODY, checksumSha256: 'a'.repeat(64) })
		await expect(verifyRemoteObject(client, 'key', EXPECTED)).rejects.toThrow(
			/stored checksum mismatch/,
		)
		expect(client.calls.get).toBe(0)
		const corrupted = Buffer.from('corrupted-derivative!!')
		client.seedRaw('key', { body: corrupted })
		await expect(verifyRemoteObject(client, 'key', EXPECTED)).rejects.toThrow(
			/streamed sha256 mismatch/,
		)
	})
})

describe('checkLive', () => {
	const a = Buffer.from('a-bytes')
	const b = Buffer.from('b-bytes')
	const manifest = syntheticManifest({ 'photo-a': a, 'photo-b': b })
	const keyOf = (photoId: string) => manifest.photos[photoId]!.derivatives[0]!.objectKey

	it('passes when every object of the manifest is present and matches', async () => {
		const client = createFakeR2Client()
		client.seed(keyOf('photo-a'), a, sha256(a))
		client.seed(keyOf('photo-b'), b, sha256(b))
		expect(await checkLive({ manifest, client })).toEqual({
			ok: true,
			errors: [],
			verified: 2,
			total: 2,
		})
	})

	it('collects one error per bad object and fails closed', async () => {
		const client = createFakeR2Client()
		client.seed(keyOf('photo-a'), a, sha256(a))
		const result = await checkLive({ manifest, client })
		expect(result.ok).toBe(false)
		expect(result.errors).toEqual([`remote object "${keyOf('photo-b')}" is missing`])
		expect(result.verified).toBe(1)
	})
})

describe('decideLiveGate', () => {
	const DIGEST = 'a'.repeat(64)
	const empty = syntheticManifest({})
	const full = syntheticManifest({ 'photo-a': Buffer.from('x') })

	it('passes an inactive empty manifest and verifies an active one', () => {
		expect(decideLiveGate(false, empty, DIGEST)).toEqual({ kind: 'pass-inactive-empty' })
		expect(decideLiveGate(true, full, DIGEST)).toEqual({ kind: 'verify' })
	})

	it('fails an inactive full or an active empty manifest, and a digest mismatch first', () => {
		expect(decideLiveGate(false, full, DIGEST).kind).toBe('fail')
		expect(decideLiveGate(true, empty, DIGEST).kind).toBe('fail')
		const decision = decideLiveGate(false, empty, 'f'.repeat(64))
		expect(decision.kind === 'fail' && decision.reason).toContain('configDigest')
	})
})

describe('planPrune', () => {
	const bytes = Buffer.from('x')
	const manifest = syntheticManifest({ 'photo-a': bytes })
	const key = manifest.photos['photo-a']!.derivatives[0]!.objectKey

	it('reports orphans and missing keys without deleting anything', async () => {
		const client = createFakeR2Client()
		client.seed(key, bytes, sha256(bytes))
		client.seed('orphan/old-key.avif', Buffer.from('y'), 'a'.repeat(64))
		expect(await planPrune({ manifests: [manifest], client })).toEqual({
			orphans: ['orphan/old-key.avif'],
			missing: [],
			remoteCount: 2,
			referencedCount: 1,
		})
		expect(client.objects.size).toBe(2)
		const empty = await planPrune({ manifests: [manifest], client: createFakeR2Client() })
		expect(empty.missing).toEqual([key])
	})

	it('scopes both sides to the prefix, so no referenced key outside it counts as missing', async () => {
		const client = createFakeR2Client()
		client.seed(key, bytes, sha256(bytes))
		client.seed('other/1w-z.avif', Buffer.from('z'), 'a'.repeat(64))
		const report = await planPrune({ manifests: [manifest], client, prefix: 'other/' })
		expect(report).toEqual({
			orphans: ['other/1w-z.avif'],
			missing: [],
			remoteCount: 1,
			referencedCount: 0,
		})
	})
})
