import type { Manifest } from './manifest.ts'

// only ties `active` to manifest emptiness (ADR-0012): the manifest keys are the release photo set,
// with no separate allowlist; integrity, privacy and content checks live in check-derivatives, and
// atomic activation in activate

export type PolicyEvaluation = { ok: true } | { ok: false; reason: string }

export function evaluatePolicy(active: boolean, manifest: Manifest): PolicyEvaluation {
	const manifestIds = Object.keys(manifest.photos)

	if (!active) {
		if (manifestIds.length > 0) {
			return {
				ok: false,
				reason: `policy is inactive but manifest contains ${manifestIds.length} photo(s); tracked manifest must be canonical-empty`,
			}
		}
		return { ok: true }
	}

	if (manifestIds.length === 0) {
		return { ok: false, reason: 'active policy requires a non-empty manifest' }
	}

	return { ok: true }
}
