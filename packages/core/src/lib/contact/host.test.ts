import { describe, expect, it, vi } from 'vitest'

import { guardApiHost, isPagesDevHost } from './host.ts'

describe('isPagesDevHost', () => {
	it('matches the project alias and per-deployment hosts', () => {
		expect(isPagesDevHost('https://demo-site.pages.dev/api/contact')).toBe(true)
		expect(isPagesDevHost('https://abc123.demo-site.pages.dev/api/contact')).toBe(true)
		expect(isPagesDevHost('https://DEMO-SITE.PAGES.DEV/api/contact')).toBe(true)
		expect(isPagesDevHost('https://demo-site.pages.dev./api/contact')).toBe(true)
		expect(isPagesDevHost('https://abc123.demo-site.pages.dev./api/contact')).toBe(true)
	})

	it('lets the site domain and local hosts through', () => {
		expect(isPagesDevHost('https://example.com/api/contact')).toBe(false)
		expect(isPagesDevHost('http://127.0.0.1:8788/api/contact')).toBe(false)
		expect(isPagesDevHost('http://localhost:8788/api/contact')).toBe(false)
	})

	it('requires the dot before the suffix', () => {
		expect(isPagesDevHost('https://pages.dev/api/contact')).toBe(false)
		expect(isPagesDevHost('https://pages.dev.example.com/api/contact')).toBe(false)
	})
})

describe('guardApiHost', () => {
	const post = (url: string) => new Request(url, { method: 'POST', body: '{}' })
	const handler = () => vi.fn(async () => new Response('handled', { status: 200 }))

	it.each([
		'https://demo-site.pages.dev/api/contact',
		'https://abc123.demo-site.pages.dev/api/contact',
		'https://demo-site.pages.dev./api/contact',
		'https://abc123.demo-site.pages.dev./api/contact',
	])('answers a bare 403 on %s without calling the handler', async (url) => {
		const next = handler()
		const response = await guardApiHost(post(url), next)
		expect(response.status).toBe(403)
		expect(await response.text()).toBe('')
		expect(next).not.toHaveBeenCalled()
	})

	it.each(['https://example.com/api/contact', 'http://127.0.0.1:8788/api/contact'])(
		'passes %s on to the handler',
		async (url) => {
			const next = handler()
			const response = await guardApiHost(post(url), next)
			expect(next).toHaveBeenCalledOnce()
			expect(await response.text()).toBe('handled')
		},
	)
})
