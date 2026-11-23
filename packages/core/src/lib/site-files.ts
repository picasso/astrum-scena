import { access, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AstroIntegration } from 'astro'

import type { Locale } from '../config/locale-schema.ts'
import { headersFile, type HeaderSources, inlineScriptHashes } from './security-headers.ts'

// build-time site files that depend on the site config: robots.txt, the root redirect of the
// Cloudflare Pages `_redirects` and `_headers`. `public/_redirects` holds only the config-independent
// legacy rules; `_headers` has no public/ source at all.

export function robotsTxt(origin: string): string {
	return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap-index.xml\n`
}

export function rootRedirectRule(locale: Locale): string {
	return `/ /${locale}/ 301`
}

const isRootRule = (line: string): boolean => line.trim().split(/\s+/)[0] === '/'

// the rule goes after the file's leading comment lines, which document it
export function withRootRedirect(redirects: string, locale: Locale): string {
	const lines = redirects.split('\n')
	if (lines.some(isRootRule)) throw new Error('_redirects already has a rule for "/"')
	const header = lines.findIndex((line) => !line.startsWith('#'))
	const at = header === -1 ? lines.length : header
	return [...lines.slice(0, at), rootRedirectRule(locale), ...lines.slice(at)].join('\n')
}

// the script hashes come from every built page, so a script on a single page is allowed too
async function builtScriptHashes(dir: URL): Promise<string[]> {
	const root = fileURLToPath(dir)
	const entries = await readdir(root, { recursive: true })
	const pages = entries.filter((entry) => entry.endsWith('.html'))
	const hashes = new Set<string>()
	for (const page of pages)
		for (const hash of inlineScriptHashes(await readFile(path.join(root, page), 'utf8')))
			hashes.add(hash)
	return [...hashes]
}

async function writeHeaders(dir: URL, sources: HeaderSources): Promise<void> {
	const headers = new URL('_headers', dir)
	const exists = await access(headers).then(
		() => true,
		() => false,
	)
	if (exists) throw new Error('_headers is generated at build; remove it from public/')
	await writeFile(
		headers,
		headersFile({ ...sources, scriptHashes: await builtScriptHashes(dir) }),
	)
}

export type SiteFilesConfig = HeaderSources & {
	origin: string
	defaultLocale: Locale
}

export function siteFiles({
	origin,
	defaultLocale,
	...headerSources
}: SiteFilesConfig): AstroIntegration {
	return {
		name: 'site-files',
		hooks: {
			'astro:build:done': async ({ dir }) => {
				await writeFile(new URL('robots.txt', dir), robotsTxt(origin))
				const redirects = new URL('_redirects', dir)
				const source = await readFile(redirects, 'utf8').catch((error: unknown) => {
					if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
					throw error
				})
				await writeFile(redirects, withRootRedirect(source, defaultLocale))
				await writeHeaders(dir, headerSources)
			},
		},
	}
}
