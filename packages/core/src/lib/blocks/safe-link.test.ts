import { describe, expect, it } from 'vitest'

import { resolveSafeLink } from './safe-link.ts'

describe('resolveSafeLink', () => {
	it('keeps an internal path exactly as authored', () => {
		expect(resolveSafeLink('/ru/articles/glass-and-light/')).toEqual({
			href: '/ru/articles/glass-and-light/',
			external: false,
		})
	})

	it('accepts fragments and relative paths', () => {
		expect(resolveSafeLink('#gear')?.href).toBe('#gear')
		expect(resolveSafeLink('../portfolio/')?.href).toBe('../portfolio/')
	})

	it('accepts http(s) and marks it external', () => {
		expect(resolveSafeLink('https://example.com/a')).toEqual({
			href: 'https://example.com/a',
			external: true,
		})
		expect(resolveSafeLink('HTTP://Example.com')?.external).toBe(true)
	})

	it.each([
		['javascript:alert(1)', 'script scheme'],
		['JaVaScRiPt:alert(1)', 'script scheme in mixed case'],
		['data:text/html;base64,PHN2Zz4=', 'inline document'],
		['vbscript:msgbox', 'legacy script scheme'],
		['mailto:someone@example.com', 'non-http scheme'],
		['//evil.example/path', 'protocol-relative host'],
		['\\\\evil.example/path', 'backslash network path'],
		['/\\evil.example/path', 'mixed slash network path'],
		['   ', 'blank'],
		['java\u0000script:alert(1)', 'control character smuggling'],
	])('rejects %s (%s)', (href) => {
		expect(resolveSafeLink(href)).toBeNull()
	})

	// a new tab without `rel` hands `window.opener` to a foreign page; the shared helper sets it
	it('adds a safe rel and target for a new tab', () => {
		expect(resolveSafeLink('https://example.com', { newTab: true })).toEqual({
			href: 'https://example.com/',
			external: true,
			target: '_blank',
			rel: 'noopener noreferrer',
		})
	})

	it('adds no rel when the link opens in place', () => {
		expect(resolveSafeLink('https://example.com', { newTab: false })?.rel).toBeUndefined()
	})
})
