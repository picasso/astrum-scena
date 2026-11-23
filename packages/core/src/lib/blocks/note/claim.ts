// single source of the claim format, shared by the block schema and `../../content/errata-edit.ts`
// so scripts and the renderer cannot drift; digest8 is the first 8 lowercase hex chars of
// `recommendationDigest`, and the colon is the only separator, so finding ids never contain one

export const NOTE_FINDING_ID_PATTERN = /^[A-Za-z0-9._-]+$/
export const NOTE_DIGEST8_PATTERN = /^[0-9a-f]{8}$/
export const NOTE_CLAIM_PATTERN = /^[A-Za-z0-9._-]+:[0-9a-f]{8}$/

export type NoteClaim = { findingId: string; digest8: string }

// returns null on any non-canonical form and lets the caller decide whether that is an error
export function parseNoteClaim(value: string): NoteClaim | null {
	if (!NOTE_CLAIM_PATTERN.test(value)) return null
	const separator = value.indexOf(':')
	return { findingId: value.slice(0, separator), digest8: value.slice(separator + 1) }
}

// throws because unsafe parts break a format invariant; they are never user input here
export function formatNoteClaim(findingId: string, digest8: string): string {
	if (!NOTE_FINDING_ID_PATTERN.test(findingId)) {
		throw new Error(`unsafe note finding id: "${findingId}"`)
	}
	if (!NOTE_DIGEST8_PATTERN.test(digest8)) {
		throw new Error(`note digest8 must be 8 lowercase hex chars, got "${digest8}"`)
	}
	return `${findingId}:${digest8}`
}
