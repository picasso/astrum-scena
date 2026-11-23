import { createHash } from 'node:crypto'

import { type DefaultTreeAdapterMap, parse } from 'parse5'

// the Cloudflare Pages `_headers` file: one builder for the build and for the production gate, so the
// gate checks exactly what the build was meant to write

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']

// a longer header line is rejected by Cloudflare Pages
export const MAX_HEADER_LINE = 2000

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

// `/_astro/*` names carry a content hash. Fonts do not, so a changed font file must ship under a
// new file name: browsers keep the old one for a year without asking.
export const IMMUTABLE_PATHS: readonly string[] = ['/_astro/*', '/fonts/*']

export const SECURITY_HEADERS_PATH = '/*'

export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = {
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
}

export const CSP_HEADER = 'Content-Security-Policy'

// `script-src` sources that would let an injected script run
export const FORBIDDEN_SCRIPT_SOURCES: readonly string[] = ["'unsafe-inline'", "'unsafe-eval'"]

export type HeaderSources = {
	// absent when the site serves its images itself (`publicPath`)
	imagesOrigin?: string
	turnstileOrigin: string
}

export type HeadersInput = HeaderSources & {
	scriptHashes: readonly string[]
}

// the JavaScript MIME type essences of the HTML spec; any other `type` makes a data block the browser
// never runs (`application/ld+json`)
const JAVASCRIPT_TYPES = new Set([
	'application/ecmascript',
	'application/javascript',
	'application/x-ecmascript',
	'application/x-javascript',
	'text/ecmascript',
	'text/javascript',
	'text/javascript1.0',
	'text/javascript1.1',
	'text/javascript1.2',
	'text/javascript1.3',
	'text/javascript1.4',
	'text/javascript1.5',
	'text/jscript',
	'text/livescript',
	'text/x-ecmascript',
	'text/x-javascript',
])
// executed or interpreted inline content that CSP checks against `script-src` as well
const SCRIPT_TYPES = new Set(['module', 'importmap', 'speculationrules'])

export function isExecutableScriptType(type: string | undefined): boolean {
	if (type === undefined) return true
	const essence = type.trim().toLowerCase()
	return essence === '' || JAVASCRIPT_TYPES.has(essence) || SCRIPT_TYPES.has(essence)
}

const attribute = (node: Element, name: string): string | undefined =>
	node.attrs.find((item) => item.name === name)?.value

const textOf = (node: Element): string =>
	node.childNodes.map((child) => ('value' in child ? child.value : '')).join('')

function* scriptElements(node: Node): Generator<Element> {
	if ('tagName' in node && node.tagName === 'script') yield node
	if ('childNodes' in node) for (const child of node.childNodes) yield* scriptElements(child)
	// a template's scripts run once its content is inserted
	if ('content' in node) yield* scriptElements(node.content)
}

// the source text of every inline script the browser would execute; an external one (`src`) is
// allowed by its origin, not by a hash
export function inlineScripts(html: string): string[] {
	return [...scriptElements(parse(html))]
		.filter(
			(node) =>
				attribute(node, 'src') === undefined &&
				isExecutableScriptType(attribute(node, 'type')),
		)
		.map(textOf)
}

export function scriptHash(source: string): string {
	return `sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}`
}

export function inlineScriptHashes(html: string): string[] {
	return [...new Set(inlineScripts(html).map(scriptHash))]
}

function assertHttpsOrigin(name: string, value: string): void {
	let url: URL | undefined
	try {
		url = new URL(value)
	} catch {
		url = undefined
	}
	if (url?.protocol !== 'https:' || url.origin !== value)
		throw new Error(`${name} must be a bare https origin, got "${value}"`)
}

const SELF = "'self'"

export function cspDirectives({
	imagesOrigin,
	turnstileOrigin,
	scriptHashes,
}: HeadersInput): [string, string[]][] {
	if (imagesOrigin !== undefined) assertHttpsOrigin('imagesOrigin', imagesOrigin)
	assertHttpsOrigin('turnstileOrigin', turnstileOrigin)
	const hashes = [...new Set(scriptHashes)].sort().map((hash) => `'${hash}'`)
	return [
		['default-src', [SELF]],
		['script-src', [SELF, turnstileOrigin, ...hashes]],
		// the markup carries style attributes; only scripts must stay off 'unsafe-inline'
		['style-src', [SELF, "'unsafe-inline'"]],
		['img-src', [SELF, 'data:', ...(imagesOrigin === undefined ? [] : [imagesOrigin])]],
		['font-src', [SELF]],
		['connect-src', [SELF]],
		['frame-src', [turnstileOrigin]],
		['object-src', ["'none'"]],
		['base-uri', [SELF]],
		['form-action', [SELF]],
		['frame-ancestors', ["'none'"]],
	]
}

export function contentSecurityPolicy(input: HeadersInput): string {
	return cspDirectives(input)
		.map(([name, sources]) => [name, ...sources].join(' '))
		.join('; ')
}

const rule = (path: string, headers: Record<string, string>): string =>
	[path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)].join('\n')

export function headersFile(input: HeadersInput): string {
	const text = `${[
		rule(SECURITY_HEADERS_PATH, {
			[CSP_HEADER]: contentSecurityPolicy(input),
			...STATIC_SECURITY_HEADERS,
		}),
		...IMMUTABLE_PATHS.map((path) => rule(path, { 'Cache-Control': IMMUTABLE_CACHE_CONTROL })),
	].join('\n\n')}\n`
	const [long] = longHeaderLines(text)
	if (long)
		throw new Error(
			`_headers line ${long.line} is ${long.length} characters, over the ${MAX_HEADER_LINE} limit`,
		)
	return text
}

export function longHeaderLines(text: string): { line: number; length: number }[] {
	return text
		.split('\n')
		.map((line, index) => ({ line: index + 1, length: line.length }))
		.filter(({ length }) => length > MAX_HEADER_LINE)
}

// path → lowercased header name → value; a repeated header is joined the way Pages joins it
export function parseHeadersFile(text: string): Map<string, Map<string, string>> {
	const rules = new Map<string, Map<string, string>>()
	let current: Map<string, string> | undefined
	for (const line of text.split('\n')) {
		const trimmed = line.trim()
		if (trimmed === '' || trimmed.startsWith('#')) continue
		if (!/^\s/.test(line)) {
			current = rules.get(trimmed) ?? new Map<string, string>()
			rules.set(trimmed, current)
			continue
		}
		const colon = trimmed.indexOf(':')
		if (!current || colon <= 0) continue
		const name = trimmed.slice(0, colon).trim().toLowerCase()
		const value = trimmed.slice(colon + 1).trim()
		const previous = current.get(name)
		current.set(name, previous === undefined ? value : `${previous}, ${value}`)
	}
	return rules
}

// directive name → its sources; a repeated directive is ignored, as browsers ignore it
export function parseCsp(policy: string): Map<string, string[]> {
	const directives = new Map<string, string[]>()
	for (const part of policy.split(';')) {
		const [name, ...sources] = part.trim().split(/\s+/)
		if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), sources)
	}
	return directives
}
