import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import type { ImageConfig } from '../../lib/images/build/config.ts'
import { serializeManifest } from '../../lib/images/manifest.ts'
import { releaseManifestPath } from '../../lib/images/release.ts'
import type { CheckResult } from './check-derivatives.ts'
import { JSONL_HEADER } from './jsonl.ts'
import { ledgerKey, ledgerPath, readLedger } from './ledger.ts'
import { IMMUTABLE_CACHE_CONTROL } from './r2-client.ts'
import { type SyncOptions, syncRelease } from './sync.ts'
import {
	createFakeR2Client,
	type FakeR2Client,
	sha256,
	syntheticManifest,
} from './test-fixtures.ts'

// the sync contract on an in-memory bucket, with the exiftool-backed integrity gate stubbed

const scratch = mkdtempSync(path.join(tmpdir(), 'astrum-scena-sync-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const CONFIG = { rights: { webStatement: 'https://rights.example.com/license' } } as ImageConfig
const PUBLIC_ORIGIN = 'https://img.example.com'
const PHOTOS = ['amber-dunes', 'graphite-lines', 'long-horizon', 'wide-tide']
const okCheck = async (): Promise<CheckResult> => ({ ok: true, errors: [], derivativeCount: 4 })

let siteCount = 0

// a site root with one release of four derivatives under it
function writeRelease(): { root: string; releaseDir: string; files: Map<string, Buffer> } {
	const root = path.join(scratch, `site-${++siteCount}`)
	const releaseDir = path.join(root, 'release')
	const manifest = syntheticManifest(
		Object.fromEntries(PHOTOS.map((id) => [id, Buffer.from(`avif-bytes-for-${id}`)])),
	)
	const files = new Map<string, Buffer>()
	for (const id of PHOTOS) {
		const { objectKey } = manifest.photos[id]!.derivatives[0]!
		const bytes = Buffer.from(`avif-bytes-for-${id}`)
		files.set(objectKey, bytes)
		mkdirSync(path.dirname(path.join(releaseDir, objectKey)), { recursive: true })
		writeFileSync(path.join(releaseDir, objectKey), bytes)
	}
	writeFileSync(releaseManifestPath(releaseDir), serializeManifest(manifest))
	return { root, releaseDir, files }
}

const optionsFor = (
	{ root, releaseDir }: { root: string; releaseDir: string },
	client: FakeR2Client,
	overrides: Partial<SyncOptions> = {},
): SyncOptions => ({
	releaseId: 'synthetic-01',
	releaseDir,
	config: CONFIG,
	root,
	client,
	publicOrigin: PUBLIC_ORIGIN,
	deps: { checkRelease: okCheck, now: () => 1_700_000_000_000 },
	...overrides,
})

describe('syncRelease', () => {
	it('makes no bucket call when the local integrity check fails', async () => {
		const release = writeRelease()
		const client = createFakeR2Client()
		const failing = async (): Promise<CheckResult> => ({
			ok: false,
			errors: ['derivative "x" sha256 mismatch (content drift)'],
			derivativeCount: 4,
		})
		await expect(
			syncRelease(optionsFor(release, client, { deps: { checkRelease: failing } })),
		).rejects.toThrow(/local integrity check failed, 0 bucket calls made/)
		expect(client.callCount()).toBe(0)
		expect(await readLedger(release.root)).toEqual([])
	})

	it('plans the uploads on a dry run, with no put and no ledger', async () => {
		const release = writeRelease()
		const client = createFakeR2Client()
		const summary = await syncRelease(optionsFor(release, client, { dryRun: true }))
		expect(summary).toMatchObject({ dryRun: true, uploaded: 0, alreadyPresent: 0 })
		expect(summary.plannedUploads).toEqual([...release.files.keys()].sort())
		expect(client.calls.put).toBe(0)
		expect(await readLedger(release.root)).toEqual([])
	})

	it('uploads with the headers and the sha256 metadata, verifies, and records the ledger', async () => {
		const release = writeRelease()
		const client = createFakeR2Client()
		const summary = await syncRelease(optionsFor(release, client))
		expect(summary).toMatchObject({ uploaded: 4, verified: 4, ledgerAppended: true })
		for (const [key, bytes] of release.files)
			expect(client.objects.get(key)).toMatchObject({
				contentType: 'image/avif',
				cacheControl: IMMUTABLE_CACHE_CONTROL,
				checksumSha256: sha256(bytes),
			})
		const [entry, ...rest] = await readLedger(release.root)
		expect(rest).toEqual([])
		expect(entry).toMatchObject({
			releaseId: 'synthetic-01',
			photoIds: PHOTOS,
			publicOrigin: PUBLIC_ORIGIN,
			rightsUrl: CONFIG.rights.webStatement,
			watermarkProfiles: ['none'],
			publishedAt: '2023-11-14T22:13:20.000Z',
		})
		expect(ledgerKey(entry!)).toMatch(/^synthetic-01:[0-9a-f]{64}$/)
	})

	it('is idempotent on a second run: nothing uploaded, no second ledger row', async () => {
		const release = writeRelease()
		const client = createFakeR2Client()
		await syncRelease(optionsFor(release, client))
		const second = await syncRelease(optionsFor(release, client))
		expect(second).toMatchObject({ uploaded: 0, alreadyPresent: 4, ledgerAppended: false })
		expect(await readLedger(release.root)).toHaveLength(1)
	})

	it('resumes after a partial upload without a duplicate ledger row', async () => {
		const release = writeRelease()
		const failing = createFakeR2Client({ failPutAfter: 2 })
		await expect(syncRelease(optionsFor(release, failing))).rejects.toThrow(
			/simulated put failure/,
		)
		expect(failing.calls.put).toBe(3)
		expect(await readLedger(release.root)).toEqual([])
		const resumed = createFakeR2Client()
		for (const [key, object] of failing.objects)
			resumed.seed(key, object.body, object.checksumSha256!)
		const summary = await syncRelease(optionsFor(release, resumed))
		expect(summary).toMatchObject({ alreadyPresent: 2, uploaded: 2, ledgerAppended: true })
		expect(await readLedger(release.root)).toHaveLength(1)
	})

	it('aborts on a present object with another checksum, putting nothing', async () => {
		const release = writeRelease()
		const client = createFakeR2Client()
		const [key, bytes] = [...release.files][0]!
		client.seedRaw(key, { body: bytes, checksumSha256: 'f'.repeat(64) })
		await expect(syncRelease(optionsFor(release, client))).rejects.toThrow(
			/stored checksum mismatch/,
		)
		expect(client.calls.put).toBe(0)
		expect(await readLedger(release.root)).toEqual([])
	})

	it('fails without a ledger row when an upload succeeds but does not verify', async () => {
		const release = writeRelease()
		const client = createFakeR2Client()
		const put = client.put
		client.put = (key, body, options) =>
			put(key, body, { ...options, checksumSha256: 'f'.repeat(64) })
		await expect(syncRelease(optionsFor(release, client))).rejects.toThrow(
			/stored checksum mismatch/,
		)
		expect(client.calls.put).toBe(release.files.size)
		expect(await readLedger(release.root)).toEqual([])
	})

	it('aborts when a derivative changes after the integrity check, putting nothing', async () => {
		const release = writeRelease()
		const [key] = [...release.files.keys()]
		writeFileSync(path.join(release.releaseDir, key!), 'tampered-bytes-post-check')
		const client = createFakeR2Client()
		await expect(syncRelease(optionsFor(release, client))).rejects.toThrow(/sha256 drift/)
		expect(client.calls.put).toBe(0)
	})

	it.each(['{', 'null', '{"releaseId":"partial"}'])(
		'reads a malformed ledger before any bucket call: %s',
		async (bad) => {
			const release = writeRelease()
			mkdirSync(path.dirname(ledgerPath(release.root)), { recursive: true })
			writeFileSync(ledgerPath(release.root), `${JSONL_HEADER}${bad}\n`)
			for (const dryRun of [false, true]) {
				const client = createFakeR2Client()
				await expect(syncRelease(optionsFor(release, client, { dryRun }))).rejects.toThrow(
					'publication-ledger.jsonl:2',
				)
				expect(client.callCount()).toBe(0)
			}
		},
	)
})
