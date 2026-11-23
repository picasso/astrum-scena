// only a boolean comes out, so no upstream body, token or PII reaches a caller or a log

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type VerifyTurnstileInput = {
	secret: string
	token: string
	// CF-Connecting-IP; optional, strengthens the check
	remoteip?: string
	// the client sets `action: 'contact'`
	expectedAction: string
	// compared for exact equality
	expectedHostname: string
	// set only by the contact e2e (see env.ts), never derived from the request; unset means the
	// canonical Cloudflare URL
	verifyUrl?: string
	fetch?: typeof fetch
	timeoutMs?: number
}

type SiteverifyResponse = {
	success?: boolean
	action?: string
	hostname?: string
}

// any network, timeout or parse error and any action or hostname mismatch fails closed
export async function verifyTurnstile(input: VerifyTurnstileInput): Promise<boolean> {
	const doFetch = input.fetch ?? fetch
	const timeoutMs = input.timeoutMs ?? 5000
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const body = new URLSearchParams()
		body.set('secret', input.secret)
		body.set('response', input.token)
		if (input.remoteip) body.set('remoteip', input.remoteip)

		const response = await doFetch(input.verifyUrl ?? SITEVERIFY_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body,
			signal: controller.signal,
		})
		if (!response.ok) return false

		const outcome = (await response.json()) as SiteverifyResponse
		return (
			outcome.success === true &&
			outcome.action === input.expectedAction &&
			outcome.hostname === input.expectedHostname
		)
	} catch {
		return false
	} finally {
		clearTimeout(timer)
	}
}
