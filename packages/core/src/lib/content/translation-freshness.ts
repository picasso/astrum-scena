import { createHash } from 'node:crypto'

import { stripManagedNoteRegion } from './errata-edit.ts'

// translation freshness contract (ADR-0012): an EN document carries `translatedFromDigest`, the
// sha256 of the canonical RU body at translation time. The baseline marker writer,
// `/translate --compute` and the `/status/` resolver must all use these functions; a digest computed
// any other way would show a false `needs review`

// the only normalization, so a raw file and a loaded Astro entry give the same digest whatever the
// loader does with the trailing newline
export function normalizeTranslationSourceBody(body: string): string {
	return body.replace(/\r\n?/g, '\n').trim()
}

// synchronous so the build-time resolver stays sync. The errata region (`:::note{claim="…"}`) is
// excluded: notes are maintained per locale by `/factcheck-apply` and are not translation source,
// so editing one must not mark the EN translation outdated
export function digestTranslationSource(referenceBody: string): string {
	const withoutErrata = stripManagedNoteRegion(referenceBody)
	return createHash('sha256')
		.update(normalizeTranslationSourceBody(withoutErrata), 'utf8')
		.digest('hex')
}

export type TranslationFreshness = 'current' | 'needs-review'

// `/status/` shows the reason only as the translation column state (Unverified / Outdated); markers
// and SHAs never leave the build
export type TranslationFreshnessReason = 'missing-marker' | 'digest-mismatch'

export type TranslationFreshnessResult = {
	status: TranslationFreshness
	reason?: TranslationFreshnessReason
}

// a malformed (non 64-hex) marker never reaches here: the zod schema and `astrum-scena check content`
// reject it as a schema error rather than a runtime fallback (ADR-0012), so the resolver deliberately
// does not recover it
export function resolveTranslationFreshness(input: {
	referenceBody: string
	translationMarker: string | undefined
}): TranslationFreshnessResult {
	if (input.translationMarker === undefined)
		return { status: 'needs-review', reason: 'missing-marker' }
	if (input.translationMarker !== digestTranslationSource(input.referenceBody)) {
		return { status: 'needs-review', reason: 'digest-mismatch' }
	}
	return { status: 'current' }
}
