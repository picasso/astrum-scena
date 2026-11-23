import { describe, expect, it, vi } from 'vitest'

import { type ContactRawEnv } from './env.ts'
import { handleContact } from './handle.ts'
import { CONTACT_LIMITS } from './schema.ts'

const URL_STR = 'https://site.test/api/contact'
const ORIGIN = 'https://site.test'

const validEnv: ContactRawEnv = {
	TURNSTILE_SECRET_KEY: 'secret',
	TELEGRAM_BOT_TOKEN: 'bot',
	TELEGRAM_CHAT_ID: '42',
}

const validBody = () => ({
	locale: 'en',
	name: 'Jane',
	email: 'jane@example.com',
	message: 'Hello there',
	token: 'tok',
	company: '',
})

function makeRequest(
	body: unknown,
	{ contentType = 'application/json', origin = ORIGIN as string | null } = {},
): Request {
	const headers = new Headers()
	if (contentType) headers.set('content-type', contentType)
	if (origin) headers.set('origin', origin)
	return new Request(URL_STR, {
		method: 'POST',
		headers,
		body: typeof body === 'string' ? body : JSON.stringify(body),
	})
}

// routes siteverify to the Turnstile stub and api.telegram.org to the Telegram stub
function makeFetch(opts: { turnstile?: boolean; telegram?: boolean } = {}) {
	const { turnstile = true, telegram = true } = opts
	return vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input)
		if (url.includes('siteverify')) {
			return {
				ok: true,
				json: async () => ({
					success: turnstile,
					action: 'contact',
					hostname: 'site.test',
				}),
			} as unknown as Response
		}
		if (url.includes('api.telegram.org')) {
			return { ok: telegram } as unknown as Response
		}
		throw new Error(`unexpected fetch: ${url}`)
	})
}

describe('handleContact', () => {
	it('rejects a non-JSON content-type without any upstream call', async () => {
		const fetchMock = makeFetch()
		const res = await handleContact(
			makeRequest(validBody(), { contentType: 'text/plain' }),
			validEnv,
			{
				fetch: fetchMock,
			},
		)
		expect(res.status).toBe(400)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('rejects a missing or mismatched Origin', async () => {
		const fetchMock = makeFetch()
		expect(
			(
				await handleContact(makeRequest(validBody(), { origin: null }), validEnv, {
					fetch: fetchMock,
				})
			).status,
		).toBe(400)
		expect(
			(
				await handleContact(
					makeRequest(validBody(), { origin: 'https://evil.example' }),
					validEnv,
					{ fetch: fetchMock },
				)
			).status,
		).toBe(400)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('accepts application/json with a charset parameter', async () => {
		const fetchMock = makeFetch()
		const res = await handleContact(
			makeRequest(validBody(), { contentType: 'application/json; charset=utf-8' }),
			validEnv,
			{ fetch: fetchMock },
		)
		expect(res.status).toBe(200)
	})

	it('rejects an oversized body before any parsing or upstream call', async () => {
		const fetchMock = makeFetch()
		const huge = { ...validBody(), company: 'a'.repeat(11_000) }
		const res = await handleContact(makeRequest(huge), validEnv, { fetch: fetchMock })
		expect(res.status).toBe(400)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('rejects invalid JSON and invalid submissions with no upstream call', async () => {
		const fetchMock = makeFetch()
		expect(
			(await handleContact(makeRequest('{bad json', {}), validEnv, { fetch: fetchMock }))
				.status,
		).toBe(400)
		expect(
			(
				await handleContact(makeRequest({ ...validBody(), email: 'nope' }), validEnv, {
					fetch: fetchMock,
				})
			).status,
		).toBe(400)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('honeypot: returns success WITHOUT any upstream call', async () => {
		const fetchMock = makeFetch()
		const res = await handleContact(
			makeRequest({ ...validBody(), company: 'Acme' }),
			validEnv,
			{
				fetch: fetchMock,
			},
		)
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ ok: true })
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('fails closed with 500 when a required secret is missing', async () => {
		const fetchMock = makeFetch()
		const res = await handleContact(
			makeRequest(validBody()),
			{ TELEGRAM_BOT_TOKEN: 'b' },
			{ fetch: fetchMock },
		)
		expect(res.status).toBe(500)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('rejects a failed Turnstile and never calls Telegram', async () => {
		const fetchMock = makeFetch({ turnstile: false })
		const res = await handleContact(makeRequest(validBody()), validEnv, { fetch: fetchMock })
		expect(res.status).toBe(400)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(String(fetchMock.mock.calls[0]![0])).toContain('siteverify')
	})

	it('delivers to Telegram exactly once on the happy path', async () => {
		const fetchMock = makeFetch()
		const res = await handleContact(makeRequest(validBody()), validEnv, { fetch: fetchMock })
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ ok: true })
		const telegramCalls = fetchMock.mock.calls.filter((c) =>
			String(c[0]).includes('api.telegram.org'),
		)
		expect(telegramCalls).toHaveLength(1)
	})

	it('returns 502 when Telegram delivery fails', async () => {
		const fetchMock = makeFetch({ telegram: false })
		const res = await handleContact(makeRequest(validBody()), validEnv, { fetch: fetchMock })
		expect(res.status).toBe(502)
	})

	it('routes upstream calls through the env base-URL overrides under the e2e flag', async () => {
		const envWithOverrides: ContactRawEnv = {
			...validEnv,
			CONTACT_E2E_MOCK_UPSTREAMS: '1',
			TURNSTILE_VERIFY_URL: 'http://127.0.0.1:5555/mock/siteverify',
			TELEGRAM_API_BASE: 'http://127.0.0.1:5555/mock/telegram',
		}
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url === 'http://127.0.0.1:5555/mock/siteverify') {
				return {
					ok: true,
					json: async () => ({
						success: true,
						action: 'contact',
						hostname: 'site.test',
					}),
				} as unknown as Response
			}
			if (url.startsWith('http://127.0.0.1:5555/mock/telegram/bot')) {
				return { ok: true } as unknown as Response
			}
			throw new Error(`unexpected fetch: ${url}`)
		})
		const res = await handleContact(makeRequest(validBody()), envWithOverrides, {
			fetch: fetchMock,
		})
		expect(res.status).toBe(200)
		expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
			'http://127.0.0.1:5555/mock/siteverify',
			'http://127.0.0.1:5555/mock/telegram/botbot/sendMessage',
		])
	})

	it.each([
		['absent', undefined],
		['not exactly 1', 'true'],
	])('ignores the base-URL overrides when the e2e flag is %s (production)', async (_, flag) => {
		const env: ContactRawEnv = {
			...validEnv,
			CONTACT_E2E_MOCK_UPSTREAMS: flag,
			TURNSTILE_VERIFY_URL: 'http://127.0.0.1:5555/mock/siteverify',
			TELEGRAM_API_BASE: 'http://127.0.0.1:5555/mock/telegram',
		}
		const fetchMock = makeFetch()
		const res = await handleContact(makeRequest(validBody()), env, { fetch: fetchMock })
		expect(res.status).toBe(200)
		expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
			'https://challenges.cloudflare.com/turnstile/v0/siteverify',
			'https://api.telegram.org/botbot/sendMessage',
		])
	})
})

it.each([
	{ name: 'N'.repeat(80), message: 'M'.repeat(4000) },
	{ name: 'N', message: 'M'.repeat(CONTACT_LIMITS.total) },
	{ name: 'N', message: '😀'.repeat(Math.ceil(CONTACT_LIMITS.total / 4)) },
])('rejects an excessive field budget with zero upstream requests', async (fields) => {
	const transport = makeFetch()
	const response = await handleContact(makeRequest({ ...validBody(), ...fields }), validEnv, {
		fetch: transport,
	})
	expect(response.status).toBe(400)
	expect(transport).not.toHaveBeenCalled()
})
