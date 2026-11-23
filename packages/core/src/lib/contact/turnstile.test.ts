import { describe, expect, it, vi } from 'vitest'

import { verifyTurnstile } from './turnstile.ts'

const base = {
	secret: 'secret',
	token: 'tok',
	expectedAction: 'contact',
	expectedHostname: 'site.test',
}

const jsonResponse = (body: unknown, ok = true) =>
	({ ok, json: async () => body }) as unknown as Response

describe('verifyTurnstile', () => {
	it('passes when success, action and hostname all match', async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse({ success: true, action: 'contact', hostname: 'site.test' }),
		)
		expect(await verifyTurnstile({ ...base, fetch: fetchMock })).toBe(true)
	})

	it('sends secret and token as form-encoded body', async () => {
		const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
			void init
			return jsonResponse({ success: true, action: 'contact', hostname: 'site.test' })
		})
		await verifyTurnstile({ ...base, remoteip: '1.2.3.4', fetch: fetchMock })
		const init = fetchMock.mock.calls[0]![1]
		const body = init!.body as URLSearchParams
		expect(body.get('secret')).toBe('secret')
		expect(body.get('response')).toBe('tok')
		expect(body.get('remoteip')).toBe('1.2.3.4')
	})

	it('uses the verifyUrl override when provided, else the canonical endpoint', async () => {
		const fetchMock = vi.fn(async (_url: RequestInfo | URL) => {
			void _url
			return jsonResponse({ success: true, action: 'contact', hostname: 'site.test' })
		})
		await verifyTurnstile({
			...base,
			verifyUrl: 'http://127.0.0.1:9/mock/siteverify',
			fetch: fetchMock,
		})
		expect(String(fetchMock.mock.calls[0]![0])).toBe('http://127.0.0.1:9/mock/siteverify')

		fetchMock.mockClear()
		await verifyTurnstile({ ...base, fetch: fetchMock })
		expect(String(fetchMock.mock.calls[0]![0])).toContain(
			'challenges.cloudflare.com/turnstile/v0/siteverify',
		)
	})

	it('fails on action or hostname mismatch', async () => {
		const wrongAction = vi.fn(async () =>
			jsonResponse({ success: true, action: 'other', hostname: 'site.test' }),
		)
		const wrongHost = vi.fn(async () =>
			jsonResponse({ success: true, action: 'contact', hostname: 'evil.com' }),
		)
		expect(await verifyTurnstile({ ...base, fetch: wrongAction })).toBe(false)
		expect(await verifyTurnstile({ ...base, fetch: wrongHost })).toBe(false)
	})

	it('fails on success:false and on non-ok responses', async () => {
		const notSuccess = vi.fn(async () => jsonResponse({ success: false }))
		const notOk = vi.fn(async () => jsonResponse({ success: true }, false))
		expect(await verifyTurnstile({ ...base, fetch: notSuccess })).toBe(false)
		expect(await verifyTurnstile({ ...base, fetch: notOk })).toBe(false)
	})

	it('fails closed when fetch throws', async () => {
		const boom = vi.fn(async () => {
			throw new Error('network')
		})
		expect(await verifyTurnstile({ ...base, fetch: boom })).toBe(false)
	})
})
