import type { Manifest } from '../../lib/images/manifest.ts'
import { listManifestObjects } from './manifest-objects.ts'
import type { R2Client } from './r2-client.ts'
import { verifyRemoteObject } from './remote-verify.ts'

// every object of a manifest is in the bucket with the manifest's bytes; one error per bad object

export type LiveCheckResult = { ok: boolean; errors: string[]; verified: number; total: number }

export async function checkLive(options: {
	manifest: Manifest
	client: R2Client
}): Promise<LiveCheckResult> {
	const objects = listManifestObjects(options.manifest)
	const errors: string[] = []
	for (const object of objects) {
		try {
			await verifyRemoteObject(options.client, object.objectKey, object)
		} catch (error) {
			errors.push((error as Error).message)
		}
	}
	return {
		ok: errors.length === 0,
		errors,
		verified: objects.length - errors.length,
		total: objects.length,
	}
}
