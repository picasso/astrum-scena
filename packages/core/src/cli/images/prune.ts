import type { Manifest } from '../../lib/images/manifest.ts'
import { listManifestObjects } from './manifest-objects.ts'
import type { R2Client } from './r2-client.ts'

// report-only on purpose: immutable objects must stay available for rollback, so orphans are only
// listed and deleting them is a manual step after a retention window

export type PruneReport = {
	orphans: string[]
	// informational only: sync uploads them
	missing: string[]
	remoteCount: number
	referencedCount: number
}

// a key any of the manifests references is no orphan
export async function planPrune(options: {
	manifests: readonly Manifest[]
	client: R2Client
	prefix?: string
}): Promise<PruneReport> {
	// the prefix narrows both sides; otherwise referenced keys outside it would show up as missing
	const prefix = options.prefix ?? ''
	const referenced = new Set(
		options.manifests
			.flatMap(listManifestObjects)
			.map((object) => object.objectKey)
			.filter((key) => key.startsWith(prefix)),
	)
	const remote = await options.client.list(options.prefix)
	const remoteSet = new Set(remote)
	return {
		orphans: remote.filter((key) => !referenced.has(key)).sort(),
		missing: [...referenced].filter((key) => !remoteSet.has(key)).sort(),
		remoteCount: remote.length,
		referencedCount: referenced.size,
	}
}
