import { describe, expect, it } from 'vitest'

import {
	contentSecurityPolicy,
	cspDirectives,
	headersFile,
	IMMUTABLE_CACHE_CONTROL,
	inlineScriptHashes,
	inlineScripts,
	longHeaderLines,
	MAX_HEADER_LINE,
	parseCsp,
	parseHeadersFile,
	scriptHash,
} from './security-headers.ts'

const sources = { imagesOrigin: 'https://media.test', turnstileOrigin: 'https://challenge.test' }

describe('inlineScripts', () => {
	it('keeps classic, JavaScript-typed and module scripts', () => {
		const html =
			'<script>a()</script><script type="">b()</script>' +
			'<script type="text/JavaScript">c()</script><script type="module">d()</script>'
		expect(inlineScripts(html)).toEqual(['a()', 'b()', 'c()', 'd()'])
	})

	it('skips data blocks and external scripts', () => {
		const html =
			'<script type="application/ld+json">{"@type":"Thing"}</script>' +
			'<script type="application/json">{}</script>' +
			'<script src="/_astro/x.js">ignored()</script>' +
			'<script type="module" src="/_astro/y.js"></script>'
		expect(inlineScripts(html)).toEqual([])
	})

	it('finds scripts in head, body and template content', () => {
		const html =
			'<html><head><script>head()</script></head>' +
			'<body><template><script>later()</script></template></body></html>'
		expect(inlineScripts(html)).toEqual(['head()', 'later()'])
	})
})

describe('scriptHash', () => {
	it('is the base64 sha256 CSP source of the exact text', () => {
		expect(scriptHash('')).toBe('sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=')
		expect(scriptHash('a()')).not.toBe(scriptHash('a() '))
	})

	it('dedupes the hashes of one page', () => {
		expect(inlineScriptHashes('<script>a()</script><script>a()</script>')).toEqual([
			scriptHash('a()'),
		])
	})
})

describe('cspDirectives', () => {
	const directives = new Map(
		cspDirectives({ ...sources, scriptHashes: [scriptHash('b()'), scriptHash('a()')] }),
	)

	it('allows scripts only from self, the Turnstile origin and the page hashes', () => {
		const scriptSrc = directives.get('script-src') ?? []
		expect(scriptSrc.slice(0, 2)).toEqual(["'self'", sources.turnstileOrigin])
		expect(scriptSrc.slice(2).sort()).toEqual(
			[`'${scriptHash('a()')}'`, `'${scriptHash('b()')}'`].sort(),
		)
		expect(scriptSrc).not.toContain("'unsafe-inline'")
		expect(scriptSrc).not.toContain("'unsafe-eval'")
	})

	it('takes the image and frame sources from its input', () => {
		expect(directives.get('img-src')).toEqual(["'self'", 'data:', sources.imagesOrigin])
		expect(directives.get('frame-src')).toEqual([sources.turnstileOrigin])
	})

	it('allows images from no other host when the site serves them itself', () => {
		const policy = contentSecurityPolicy({
			turnstileOrigin: sources.turnstileOrigin,
			scriptHashes: [],
		})
		expect(parseCsp(policy).get('img-src')).toEqual(["'self'", 'data:'])
	})

	it('locks down framing, plugins, base and form targets', () => {
		expect(directives.get('default-src')).toEqual(["'self'"])
		expect(directives.get('frame-ancestors')).toEqual(["'none'"])
		expect(directives.get('object-src')).toEqual(["'none'"])
		expect(directives.get('base-uri')).toEqual(["'self'"])
		expect(directives.get('form-action')).toEqual(["'self'"])
		expect(directives.get('connect-src')).toEqual(["'self'"])
		expect(directives.get('font-src')).toEqual(["'self'"])
		expect(directives.get('style-src')).toEqual(["'self'", "'unsafe-inline'"])
	})

	it('merges a hash shared by several pages into one source', () => {
		const shared = scriptHash('shared()')
		const policy = contentSecurityPolicy({ ...sources, scriptHashes: [shared, shared] })
		expect(policy.split(`'${shared}'`)).toHaveLength(2)
	})

	it.each([
		['a path', 'https://media.test/images'],
		['a trailing slash', 'https://media.test/'],
		['plain http', 'http://media.test'],
		['no URL', 'media.test'],
	])('refuses an image origin with %s', (_, imagesOrigin) => {
		expect(() => cspDirectives({ ...sources, imagesOrigin, scriptHashes: [] })).toThrow(
			'imagesOrigin must be a bare https origin',
		)
	})
})

describe('headersFile', () => {
	const input = { ...sources, scriptHashes: [scriptHash('a()')] }
	const rules = parseHeadersFile(headersFile(input))

	it('sends the policy and the static security headers on every path', () => {
		const all = rules.get('/*')
		expect(all?.get('content-security-policy')).toBe(contentSecurityPolicy(input))
		expect(all?.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
		expect(all?.get('x-content-type-options')).toBe('nosniff')
		expect(all?.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
		expect(all?.get('permissions-policy')).toBe(
			'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
		)
	})

	it('caches hashed assets and fonts as immutable', () => {
		expect(rules.get('/_astro/*')?.get('cache-control')).toBe(IMMUTABLE_CACHE_CONTROL)
		expect(rules.get('/fonts/*')?.get('cache-control')).toBe(IMMUTABLE_CACHE_CONTROL)
		expect(IMMUTABLE_CACHE_CONTROL).toBe('public, max-age=31536000, immutable')
	})

	it('keeps every line within the Cloudflare Pages limit', () => {
		for (const line of headersFile(input).split('\n'))
			expect(line.length).toBeLessThanOrEqual(MAX_HEADER_LINE)
	})

	it('holds the Cloudflare Pages limit of 2000 characters per line', () => {
		expect(longHeaderLines('x'.repeat(2000))).toEqual([])
		expect(longHeaderLines(`a\n${'x'.repeat(2001)}`)).toEqual([{ line: 2, length: 2001 }])
	})

	it('refuses a policy line over the limit', () => {
		const scriptHashes = Array.from({ length: 60 }, (_, index) => scriptHash(`s${index}()`))
		expect(() => headersFile({ ...sources, scriptHashes })).toThrow(
			`over the ${MAX_HEADER_LINE} limit`,
		)
	})
})

describe('parsers', () => {
	it('reads rules, skipping comments and joining a repeated header', () => {
		const rules = parseHeadersFile('# note\n/a/*\n  X-One: 1\n  x-one: 2\n\n/b\n  Y: z: w\n')
		expect(rules.get('/a/*')?.get('x-one')).toBe('1, 2')
		expect(rules.get('/b')?.get('y')).toBe('z: w')
	})

	it('splits a policy into directives and sources', () => {
		const csp = parseCsp("default-src 'self'; img-src 'self' data: ;  ")
		expect([...csp]).toEqual([
			['default-src', ["'self'"]],
			['img-src', ["'self'", 'data:']],
		])
	})
})
