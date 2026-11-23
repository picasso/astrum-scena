import type { ContactSubmission } from './schema.ts'

// plain text with no parse_mode, so user input can neither break formatting nor inject markup; only
// a boolean comes out, never upstream bodies, tokens or PII

const TELEGRAM_API = 'https://api.telegram.org'

// no escaping needed: without parse_mode Telegram shows the text as is
export function buildTelegramText(submission: ContactSubmission): string {
	return [
		`New contact message (${submission.locale})`,
		`Name: ${submission.name}`,
		`Email: ${submission.email}`,
		'',
		submission.message,
	].join('\n')
}

export type SendTelegramInput = {
	botToken: string
	chatId: string
	text: string
	// set only by the contact e2e (see env.ts), never derived from the request; unset means
	// api.telegram.org
	apiBase?: string
	fetch?: typeof fetch
	timeoutMs?: number
}

// a single attempt with no retry: a duplicate message is worse than a missed one
export async function sendTelegramMessage(input: SendTelegramInput): Promise<boolean> {
	const doFetch = input.fetch ?? fetch
	const timeoutMs = input.timeoutMs ?? 5000
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const response = await doFetch(
			`${input.apiBase ?? TELEGRAM_API}/bot${input.botToken}/sendMessage`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				// a preview would make Telegram fetch every URL a visitor typed
				body: JSON.stringify({
					chat_id: input.chatId,
					text: input.text,
					link_preview_options: { is_disabled: true },
				}),
				signal: controller.signal,
			},
		)
		return response.ok
	} catch {
		return false
	} finally {
		clearTimeout(timer)
	}
}
