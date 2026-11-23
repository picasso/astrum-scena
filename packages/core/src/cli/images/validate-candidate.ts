import { KEBAB_CASE_PATTERN } from '../../config/kebab-case.ts'
import type { Manifest } from '../../lib/images/manifest.ts'

// the owner picks the photo set (ADR-0012), so a candidate release is checked only for internal
// consistency; that each photo has a content file is checked by check-derivatives

export function validateCandidateRelease(manifest: Manifest): void {
	const ids = Object.keys(manifest.photos)
	if (ids.length === 0) throw new Error('candidate release manifest is empty')
	const seen = new Set<string>()
	for (const id of ids) {
		if (!KEBAB_CASE_PATTERN.test(id))
			throw new Error(`candidate release photo id "${id}" is not a kebab-case slug`)
		if (seen.has(id)) throw new Error(`candidate release has duplicate photo id "${id}"`)
		seen.add(id)
	}
}
