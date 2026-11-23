import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { headersFile, scriptHash } from './security-headers.ts'
import { robotsTxt, siteFiles, withRootRedirect } from './site-files.ts'

const origin = 'https://site.test'
const sources = { imagesOrigin: 'https://media.test', turnstileOrigin: 'https://challenge.test' }

describe('robotsTxt', () => {
	it('allows everything and points at the sitemap index of the origin', () => {
		expect(robotsTxt(origin)).toBe(
			'User-agent: *\nAllow: /\n\nSitemap: https://site.test/sitemap-index.xml\n',
		)
	})
})

describe('withRootRedirect', () => {
	it('puts the root rule after the leading comment', () => {
		expect(withRootRedirect('# root\n\n# legacy\n/old/ /ru/new/ 301\n', 'ru')).toBe(
			'# root\n/ /ru/ 301\n\n# legacy\n/old/ /ru/new/ 301\n',
		)
	})

	it('starts a file without a leading comment with the root rule', () => {
		expect(withRootRedirect('/old/ /en/new/ 301\n', 'en')).toBe(
			'/ /en/ 301\n/old/ /en/new/ 301\n',
		)
		expect(withRootRedirect('', 'en')).toBe('/ /en/ 301\n')
	})

	it('refuses a file that already redirects the root', () => {
		expect(() => withRootRedirect('# root\n/ /en/ 301\n', 'ru')).toThrow('rule for "/"')
	})
})

describe('siteFiles integration', () => {
	const run = async (dir: string) => {
		const hook = siteFiles({ origin, defaultLocale: 'ru', ...sources }).hooks[
			'astro:build:done'
		]
		await (hook as (options: { dir: URL }) => Promise<void>)({
			dir: pathToFileURL(`${dir}${path.sep}`),
		})
	}

	it('writes robots.txt and appends the root rule to the copied _redirects', async () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'site-files-'))
		try {
			writeFileSync(path.join(dir, '_redirects'), '# root\n\n/old/ /ru/new/ 301\n')
			await run(dir)
			expect(readFileSync(path.join(dir, 'robots.txt'), 'utf8')).toBe(robotsTxt(origin))
			expect(readFileSync(path.join(dir, '_redirects'), 'utf8')).toBe(
				'# root\n/ /ru/ 301\n\n/old/ /ru/new/ 301\n',
			)
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	it('creates _redirects when public/ has none', async () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'site-files-'))
		try {
			await run(dir)
			expect(readFileSync(path.join(dir, '_redirects'), 'utf8')).toBe('/ /ru/ 301\n')
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	it('writes _headers allowing the inline scripts of every built page', async () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'site-files-'))
		try {
			mkdirSync(path.join(dir, 'en', 'about'), { recursive: true })
			writeFileSync(path.join(dir, 'en', 'index.html'), '<script>shared()</script>')
			writeFileSync(
				path.join(dir, 'en', 'about', 'index.html'),
				'<script>shared()</script><script type="module">only()</script>',
			)
			await run(dir)
			expect(readFileSync(path.join(dir, '_headers'), 'utf8')).toBe(
				headersFile({
					...sources,
					scriptHashes: [scriptHash('shared()'), scriptHash('only()')],
				}),
			)
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	it('refuses a _headers copied from public/', async () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'site-files-'))
		try {
			writeFileSync(path.join(dir, '_headers'), '/*\n  X-Test: 1\n')
			await expect(run(dir)).rejects.toThrow('_headers is generated at build')
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})
})
