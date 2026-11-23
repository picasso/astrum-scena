import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { ImageConfig } from '../../lib/images/build/config.ts'
import { sha256Bytes } from '../../lib/images/build/hashing.ts'
import type { Manifest } from '../../lib/images/manifest.ts'
import { loadManifestFile, releaseManifestPath } from '../../lib/images/release.ts'
import { checkRelease as defaultCheckRelease } from './check-derivatives.ts'
import { readLedger, recordPublication } from './ledger.ts'
import { listManifestObjects, type ManifestObject } from './manifest-objects.ts'
import { contentTypeForFormat, IMMUTABLE_CACHE_CONTROL, type R2Client } from './r2-client.ts'
import { verifyAgainstHead, verifyRemoteObject } from './remote-verify.ts'
import { validateCandidateRelease } from './validate-candidate.ts'

// every local gate runs before the first bucket call, so any drift fails with zero requests. The
// ledger is written only after every upload verified, so a partial upload is safe: a rerun uploads
// only what is missing. Objects go up one by one, with no retry and no concurrency

export type SyncDeps = {
	// lets tests replace the exiftool-backed integrity gate
	checkRelease?: typeof defaultCheckRelease
	// a fixed clock for a deterministic publishedAt in tests
	now?: () => number
}

export type SyncOptions = {
	releaseId: string
	releaseDir: string
	config: ImageConfig
	root: string
	client: R2Client
	publicOrigin: string
	dryRun?: boolean
	deps?: SyncDeps
}

export type SyncSummary = {
	dryRun: boolean
	total: number
	alreadyPresent: number
	uploaded: number
	verified: number
	ledgerAppended: boolean
	// filled on a dry run too, for its report
	plannedUploads: string[]
}

const watermarkProfiles = (manifest: Manifest): string[] =>
	[
		...new Set(
			Object.values(manifest.photos).flatMap((entry) =>
				entry.derivatives.map((derivative) => derivative.watermarkProfile),
			),
		),
	].sort()

async function uploadObject(
	client: R2Client,
	releaseDir: string,
	object: ManifestObject,
): Promise<void> {
	const body = await readFile(path.join(releaseDir, object.objectKey))
	// the bytes actually read are hashed again: this closes the window after the integrity check (a
	// same-size or symlink swap), which the verify after upload would miss, comparing our own
	// metadata checksum with itself
	const actual = sha256Bytes(body)
	if (actual !== object.sha256)
		throw new Error(
			`local derivative "${object.objectKey}" changed after the integrity check ` +
				`(sha256 drift ${actual} != manifest ${object.sha256}); upload aborted`,
		)
	await client.put(object.objectKey, body, {
		contentType: contentTypeForFormat(object.format),
		cacheControl: IMMUTABLE_CACHE_CONTROL,
		checksumSha256: object.sha256,
	})
}

export async function syncRelease(options: SyncOptions): Promise<SyncSummary> {
	const { releaseDir, config, root, client, releaseId, publicOrigin } = options
	const dryRun = options.dryRun ?? false
	const now = options.deps?.now ?? Date.now
	const runCheck = options.deps?.checkRelease ?? defaultCheckRelease

	const { manifest, raw: manifestRaw } = loadManifestFile(releaseManifestPath(releaseDir))
	validateCandidateRelease(manifest)
	const check = await runCheck({ releaseDir, config, root })
	if (!check.ok)
		throw new Error(
			`local integrity check failed, 0 bucket calls made:\n  - ${check.errors.join('\n  - ')}`,
		)
	// a malformed ledger fails here, before the bucket is contacted
	await readLedger(root)
	const objects = listManifestObjects(manifest)

	// an existing key must match the manifest; a mismatch is a collision and aborts the run
	const missing: ManifestObject[] = []
	for (const object of objects) {
		const head = await client.head(object.objectKey)
		if (head) await verifyAgainstHead(client, object.objectKey, head, object)
		else missing.push(object)
	}
	const alreadyPresent = objects.length - missing.length
	const plannedUploads = missing.map((object) => object.objectKey)
	if (dryRun)
		return {
			dryRun,
			total: objects.length,
			alreadyPresent,
			uploaded: 0,
			verified: alreadyPresent,
			ledgerAppended: false,
			plannedUploads,
		}

	// keys are content-addressed, so an upload never replaces different bytes
	for (const object of missing) await uploadObject(client, releaseDir, object)
	for (const object of missing) await verifyRemoteObject(client, object.objectKey, object)

	const { appended } = await recordPublication(root, {
		releaseId,
		manifestDigest: sha256Bytes(Buffer.from(manifestRaw, 'utf8')),
		photoIds: Object.keys(manifest.photos).sort(),
		derivativeSha256: objects.map((object) => object.sha256).sort(),
		objectKeys: objects.map((object) => object.objectKey).sort(),
		publicOrigin,
		rightsUrl: config.rights.webStatement,
		watermarkProfiles: watermarkProfiles(manifest),
		publishedAt: new Date(now()).toISOString(),
	})
	return {
		dryRun,
		total: objects.length,
		alreadyPresent,
		uploaded: missing.length,
		verified: objects.length,
		ledgerAppended: appended,
		plannedUploads,
	}
}
