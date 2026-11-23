import type { ConsumerEnvName } from '../../consumer-env.ts'

// secrets live only in Cloudflare, never in the repo or with values in `.env.example`

export const TURNSTILE_DEFAULT_ACTION = 'contact'

// the contact names of the core's env list (src/consumer-env.ts), which documents each of them
export type ContactRawEnv = Partial<
	Record<
		Extract<
			ConsumerEnvName,
			`TURNSTILE_${string}` | `TELEGRAM_${string}` | 'CONTACT_E2E_MOCK_UPSTREAMS'
		>,
		string
	>
>

export type ContactEnv = {
	turnstileSecret: string
	telegramBotToken: string
	telegramChatId: string
	turnstileAction: string
	// undefined: check against the request hostname
	turnstileHostname?: string
	// undefined: the canonical Cloudflare siteverify URL
	turnstileVerifyUrl?: string
	// undefined: the canonical api.telegram.org
	telegramApiBase?: string
}

function required(env: ContactRawEnv, name: keyof ContactRawEnv): string {
	const value = env[name]
	if (typeof value !== 'string' || value.length === 0) {
		// name only, so a secret value never reaches a message or log
		throw new Error(`missing required contact env: ${name}`)
	}
	return value
}

export function readContactEnv(env: ContactRawEnv): ContactEnv {
	const mockUpstreams = env.CONTACT_E2E_MOCK_UPSTREAMS === '1'
	return {
		turnstileSecret: required(env, 'TURNSTILE_SECRET_KEY'),
		telegramBotToken: required(env, 'TELEGRAM_BOT_TOKEN'),
		telegramChatId: required(env, 'TELEGRAM_CHAT_ID'),
		turnstileAction: env.TURNSTILE_EXPECTED_ACTION || TURNSTILE_DEFAULT_ACTION,
		turnstileHostname: env.TURNSTILE_EXPECTED_HOSTNAME || undefined,
		turnstileVerifyUrl: (mockUpstreams && env.TURNSTILE_VERIFY_URL) || undefined,
		telegramApiBase: (mockUpstreams && env.TELEGRAM_API_BASE) || undefined,
	}
}
