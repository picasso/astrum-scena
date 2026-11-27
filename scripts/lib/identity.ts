// leak gate: the repository becomes public, so nothing in it may name the reference site, its
// owner, domains, account or bucket IDs. Generic leaks are caught by the patterns here; the owner's
// concrete strings are never committed: they come from the IDENTITY_DENYLIST variable (the CI secret)
// or the gitignored `.identity-denylist`, one per line. Without a list the gate fails in CI and, outside
// it, skips the list with a warning, so a contributor without the owner's strings can run it. A line
// `!<context>` allows an entry only inside that context (the owner's npm scope, the repository URL),
// so the entry still fails anywhere else in the text.

import { readFile } from 'node:fs/promises'

export const DENYLIST_ENV = 'IDENTITY_DENYLIST'
export const DENYLIST_FILE = '.identity-denylist'
export const MISSING_DENYLIST_HINT = `Locally put one string per line into the gitignored ${DENYLIST_FILE}; in CI set the ${DENYLIST_ENV} secret (a set but empty ${DENYLIST_ENV} also counts as no list).`

// hosts that are public and name nobody; any other host in a URL is a leak. An entry also covers its
// subdomains, and the reserved TLDs (RFC 2606) cover every name under them.
export const PUBLIC_HOSTS = [
	'example',
	'invalid',
	'localhost',
	'test',
	'example.com',
	'example.net',
	'example.org',
	'apache.org',
	'app.com',
	'astro.build',
	'bmad-code-org.github.io',
	'c2pa.org',
	'claude.com',
	'cloudflare.com',
	'confluence.corp',
	'contentauthenticity.org',
	'copytrack.com',
	'creativecommons.org',
	'cursor.com',
	'cypress.io',
	'darktable.org',
	'developers.google.com',
	'digimarc.com',
	'dimsemenov.com',
	'docs.aws.amazon.com',
	'docs.bmad-method.org',
	'excalidraw.com',
	'exiftool.org',
	'expo.dev',
	'flickr.com',
	'github.com',
	'glaze.cs.uchicago.edu',
	'helpx.adobe.com',
	'imagemagick.org',
	'iptc.org',
	'jestjs.io',
	'keepachangelog.com',
	'launchdarkly.com',
	'lucide.dev',
	'nodejs.org',
	'npmjs.com',
	'npmjs.org',
	// a project name under Cloudflare Pages is a tenant, so the owner's project is a denylist entry
	'pages.dev',
	'pixsy.com',
	'playwright.dev',
	'pnpm.io',
	'purl.org',
	// the S3 endpoint of R2; the account ID in front of it is 32 hex digits, which HEX_ID catches
	'r2.cloudflarestorage.com',
	'semver.org',
	'steg.ai',
	'stitch.withgoogle.com',
	'support.google.com',
	't.me',
	'tailwindcss.com',
	'telegram.org',
	'testing-library.com',
	'tineye.com',
	'vitest.dev',
	'w3.org',
	'webhook.site',
	'www.adobe.com',
] as const

export type Leak =
	| { kind: 'denylist'; column: number; entry: number }
	| { kind: 'domain' | 'hex-id'; column: number }

// the authority of a URL, optionally JSON-escaped (`https:\/\/`); a `<placeholder>` captures nothing
const URL_HOST = /\bhttps?:\\?\/\\?\/([^\s/\\?#'"`<>()[\]{}|,;]*)/gi
// a Cloudflare account ID, an R2 access key ID or a bucket in `pub-<id>.r2.dev` is 32 hex digits
const HEX_ID = /(?<![0-9a-z])[0-9a-f]{32}(?![0-9a-z])/gi

export type Denylist = { entries: readonly string[]; allowed: readonly string[] }

export function parseDenylist(text: string): Denylist {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'))
	return {
		entries: lines.filter((line) => !line.startsWith('!')),
		allowed: lines
			.filter((line) => line.startsWith('!'))
			.map((line) => line.slice(1).trim())
			.filter((line) => line !== ''),
	}
}

// a set variable wins even when empty, so `IDENTITY_DENYLIST=` stands for no list; the file is read
// from cwd, the repository root for every gate
export async function readDenylistText(): Promise<string> {
	return process.env[DENYLIST_ENV] ?? (await readFile(DENYLIST_FILE, 'utf8').catch(() => ''))
}

export async function loadDenylist(): Promise<Denylist> {
	return parseDenylist(await readDenylistText())
}

// GitHub Actions and other CI services set `CI`; there the owner's list is mandatory
export const inCi = (env: NodeJS.ProcessEnv = process.env): boolean => env.CI !== undefined

export const isPublicHost = (host: string): boolean =>
	PUBLIC_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))

// a `$` ends the host where a template (`${path}`) follows it; a templated label (`cdn.${domain}`),
// an IP address or a single-label name is no public domain
function leakedHost(authority: string): string | undefined {
	const host = authority
		.replace(/\$$/, '')
		.replace(/^[^@]*@/, '')
		.replace(/:\d*$/, '')
		.replace(/\.$/, '')
		.toLowerCase()
	if (!host.includes('.') || host.includes('$') || /^[\d.]+$/.test(host)) return undefined
	return isPublicHost(host) ? undefined : host
}

// allowed contexts are blanked out at the same length, so columns of the remaining matches stay true
function maskAllowed(haystack: string, allowed: readonly string[]): string {
	return allowed.reduce((text, context) => {
		const needle = context.toLowerCase()
		return text.replaceAll(needle, '\0'.repeat(needle.length))
	}, haystack)
}

export function findDenylisted(text: string, { entries, allowed }: Denylist): Leak[] {
	const haystack = maskAllowed(text.toLowerCase(), allowed)
	const leaks: Leak[] = []
	entries.forEach((entry, index) => {
		const needle = entry.toLowerCase()
		for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1))
			leaks.push({ kind: 'denylist', column: at + 1, entry: index + 1 })
	})
	return leaks
}

export function findLeaks(line: string, denylist: Denylist): Leak[] {
	const leaks = findDenylisted(line, denylist)
	for (const match of line.matchAll(URL_HOST))
		if (leakedHost(match[1]!)) leaks.push({ kind: 'domain', column: match.index + 1 })
	for (const match of line.matchAll(HEX_ID))
		leaks.push({ kind: 'hex-id', column: match.index + 1 })
	return leaks.sort((a, b) => a.column - b.column)
}

export const describeLeak = (leak: Leak): string =>
	leak.kind === 'denylist' ? `denylist entry #${leak.entry}` : leak.kind
