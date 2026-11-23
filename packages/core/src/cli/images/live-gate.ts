import type { Manifest } from '../../lib/images/manifest.ts'
import { evaluatePolicy } from '../../lib/images/policy.ts'

// decided before any secret is read, so a run that needs no bucket never touches credentials:
//   configDigest mismatch                 → fail, no network calls
//   inactive + non-empty / active + empty → fail (evaluatePolicy)
//   inactive + empty                      → pass without a bucket client
//   active + non-empty manifest           → verify against the bucket and the public origin

export type LiveGateDecision =
	{ kind: 'pass-inactive-empty' } | { kind: 'fail'; reason: string } | { kind: 'verify' }

export function decideLiveGate(
	active: boolean,
	manifest: Manifest,
	expectedConfigDigest: string,
): LiveGateDecision {
	if (manifest.configDigest !== expectedConfigDigest)
		return {
			kind: 'fail',
			reason: `manifest.configDigest ${manifest.configDigest} != config digest ${expectedConfigDigest}`,
		}
	const evaluation = evaluatePolicy(active, manifest)
	if (!evaluation.ok) return { kind: 'fail', reason: evaluation.reason }
	// a passing policy implies an inactive manifest is empty
	return active ? { kind: 'verify' } : { kind: 'pass-inactive-empty' }
}
