// the block link policy allows only relative paths and `http(s)` URLs, which also keeps out
// code-running schemes (`javascript:`, `data:`, `vbscript:`); the anchor attributes are returned
// ready so no block has to remember `rel` on its own

export type SafeLink = {
	href: string
	external: boolean
	target?: '_blank'
	rel?: string
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const SCHEME = /^[a-z][a-z0-9+.-]*:/i
// lets the standard URL parser handle relative input; it never leaks into the output
const RELATIVE_BASE = 'https://relative.invalid/'

export function resolveSafeLink(href: string, options: { newTab?: boolean } = {}): SafeLink | null {
	const trimmed = href.trim()
	if (!trimmed || CONTROL_CHARACTERS.test(trimmed)) return null

	const external = SCHEME.test(trimmed)
	let url: URL
	try {
		url = new URL(trimmed, RELATIVE_BASE)
	} catch {
		return null
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
	// `//host/path` and its backslash variants (`\\host`, `/\host`) look like paths but the parser
	// sends them to another host
	if (!external && url.origin !== new URL(RELATIVE_BASE).origin) return null

	// a relative path stays as written, since normalizing it would expose the placeholder base
	const resolved = external ? url.href : trimmed
	if (!options.newTab) return { href: resolved, external }
	return { href: resolved, external, target: '_blank', rel: 'noopener noreferrer' }
}
