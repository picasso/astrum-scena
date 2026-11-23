import { describe, expect, it, vi } from 'vitest'

import {
	byteLength,
	CONTACT_LIMITS,
	type ContactSubmission,
	contactSubmissionSchema,
} from './schema.ts'
import { buildTelegramText, sendTelegramMessage } from './telegram.ts'

const submission: ContactSubmission = {
	locale: 'ru',
	name: 'Jane',
	email: 'jane@example.com',
	message: 'Hello *world* [link]',
	token: 'tok',
	company: '',
}

describe('buildTelegramText', () => {
	it('includes name, email, locale and the raw message verbatim (plain text)', () => {
		const text = buildTelegramText(submission)
		expect(text).toContain('Jane')
		expect(text).toContain('jane@example.com')
		expect(text).toContain('(ru)')
		// markdown-like characters are kept literally — no parse_mode, so no escaping games.
		expect(text).toContain('Hello *world* [link]')
	})
})

describe('sendTelegramMessage', () => {
	const okResponse = { ok: true } as unknown as Response

	it('POSTs chat_id and text as JSON WITHOUT parse_mode and with link previews disabled', async () => {
		const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
			void init
			return okResponse
		})
		await sendTelegramMessage({
			botToken: 'BOT',
			chatId: '42',
			text: 'hi',
			fetch: fetchMock,
		})
		const url = fetchMock.mock.calls[0]![0]
		const init = fetchMock.mock.calls[0]![1]
		expect(String(url)).toContain('/botBOT/sendMessage')
		const body = JSON.parse(init!.body as string)
		expect(body).toEqual({
			chat_id: '42',
			text: 'hi',
			link_preview_options: { is_disabled: true },
		})
		expect(body).not.toHaveProperty('parse_mode')
	})

	it('returns true on ok and false on non-ok / throw', async () => {
		expect(
			await sendTelegramMessage({
				botToken: 'B',
				chatId: '1',
				text: 't',
				fetch: async () => okResponse,
			}),
		).toBe(true)
		expect(
			await sendTelegramMessage({
				botToken: 'B',
				chatId: '1',
				text: 't',
				fetch: async () => ({ ok: false }) as unknown as Response,
			}),
		).toBe(false)
		expect(
			await sendTelegramMessage({
				botToken: 'B',
				chatId: '1',
				text: 't',
				fetch: async () => {
					throw new Error('net')
				},
			}),
		).toBe(false)
	})

	it('does not retry — a failed send calls fetch exactly once', async () => {
		const fetchMock = vi.fn(async () => ({ ok: false }) as unknown as Response)
		await sendTelegramMessage({ botToken: 'B', chatId: '1', text: 't', fetch: fetchMock })
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('uses the apiBase override when provided, else api.telegram.org', async () => {
		const fetchMock = vi.fn(async (_url: RequestInfo | URL) => {
			void _url
			return okResponse
		})
		await sendTelegramMessage({
			botToken: 'BOT',
			chatId: '1',
			text: 't',
			apiBase: 'http://127.0.0.1:9/mock',
			fetch: fetchMock,
		})
		expect(String(fetchMock.mock.calls[0]![0])).toBe(
			'http://127.0.0.1:9/mock/botBOT/sendMessage',
		)

		fetchMock.mockClear()
		await sendTelegramMessage({ botToken: 'BOT', chatId: '1', text: 't', fetch: fetchMock })
		expect(String(fetchMock.mock.calls[0]![0])).toBe(
			'https://api.telegram.org/botBOT/sendMessage',
		)
	})
})

it.each(['M', 'Ж', '😀'])(
	'delivers the entire %s boundary payload in one Telegram message with headroom',
	async (unit) => {
		const base = { ...submission, name: 'N'.repeat(80) }
		const available = CONTACT_LIMITS.total - byteLength(base.name) - byteLength(base.email)
		const message =
			unit.repeat(Math.floor(available / byteLength(unit))) +
			'x'.repeat(available % byteLength(unit))
		const accepted = contactSubmissionSchema.parse({ ...base, message })
		const text = buildTelegramText(accepted)
		expect(text.length).toBeLessThan(4096)
		expect(text.endsWith(message)).toBe(true)
		expect(contactSubmissionSchema.safeParse({ ...base, message: message + 'x' }).success).toBe(
			false,
		)
		const transport = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			expect(JSON.parse(String(init?.body)).text).toBe(text)
			return { ok: true } as Response
		})
		expect(
			await sendTelegramMessage({ botToken: 'fixture', chatId: '1', text, fetch: transport }),
		).toBe(true)
		expect(transport).toHaveBeenCalledTimes(1)
	},
)
