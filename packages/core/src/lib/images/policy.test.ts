import { describe, expect, it } from 'vitest'

import { buildEmptyManifest, type ManifestV3 } from './manifest.ts'
import { evaluatePolicy } from './policy.ts'

const DIGEST = 'a'.repeat(64)

function manifestWith(ids: string[]): ManifestV3 {
	const photos: ManifestV3['photos'] = {}
	for (const id of ids) {
		photos[id] = {
			masterSha256: DIGEST,
			sourceWidth: 400,
			sourceHeight: 300,
			orientation: 1,
			dominantColor: '#123456',
			rightsId: 'demo-rights',
			derivatives: [],
		}
	}
	return { schemaVersion: 3, configDigest: DIGEST, photos }
}

describe('evaluatePolicy — truth table', () => {
	it('inactive + empty manifest passes', () => {
		expect(evaluatePolicy(false, buildEmptyManifest(DIGEST)).ok).toBe(true)
	})

	it('inactive + non-empty manifest fails', () => {
		expect(evaluatePolicy(false, manifestWith(['photo'])).ok).toBe(false)
	})

	it('active + non-empty manifest passes', () => {
		expect(evaluatePolicy(true, manifestWith(['a-photo', 'b-photo'])).ok).toBe(true)
	})

	it('active + empty manifest fails', () => {
		expect(evaluatePolicy(true, buildEmptyManifest(DIGEST)).ok).toBe(false)
	})
})
