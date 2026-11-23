import { type ContactRawEnv, readContactEnv } from './env.ts'
import { byteLength, isHoneypotTripped, parseContactSubmission } from './schema.ts'
import { buildTelegramText, sendTelegramMessage } from './telegram.ts'
import { verifyTurnstile } from './turnstile.ts'

// kept apart from the Pages wrapper `functions/api/contact.ts` so unit tests run it with a mock
// Request/env/fetch and no worker runtime; responses stay generic and never carry PII, tokens or
// upstream bodies

const MAX_BODY_BYTES = 10_000

// compares the media type itself: a substring check would accept `text/html; x=application/json`
function isJsonContentType(header: string | null): boolean {
	return (header ?? '').split(';')[0]!.trim().toLowerCase() === 'application/json'
}

// reads incrementally and aborts at the limit instead of reading the whole body first, so a chunked
// body without Content-Length cannot exhaust memory; null means the body is over the limit
async function readBodyCapped(request: Request, max: number): Promise<string | null> {
	const declared = request.headers.get('content-length')
	if (declared && Number(declared) > max) return null

	if (!request.body) {
		const text = await request.text()
		return byteLength(text) > max ? null : text
	}

	const reader = request.body.getReader()
	const chunks: Uint8Array[] = []
	let total = 0
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			if (!value) continue
			total += value.byteLength
			if (total > max) {
				await reader.cancel()
				return null
			}
			chunks.push(value)
		}
	} finally {
		reader.releaseLock?.()
	}

	const merged = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		merged.set(chunk, offset)
		offset += chunk.byteLength
	}
	return new TextDecoder().decode(merged)
}

export type ContactDeps = {
	fetch?: typeof fetch
	turnstileTimeoutMs?: number
	telegramTimeoutMs?: number
}

// the body is generic within a failure category and never names the internal reason
function json(status: number, body: Record<string, unknown>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8' },
	})
}
const ok = () => json(200, { ok: true })
const badRequest = () => json(400, { ok: false, error: 'invalid_request' })
const serverError = () => json(500, { ok: false, error: 'server_error' })
const upstreamError = () => json(502, { ok: false, error: 'delivery_failed' })

export async function handleContact(
	request: Request,
	rawEnv: ContactRawEnv,
	deps: ContactDeps = {},
): Promise<Response> {
	if (!isJsonContentType(request.headers.get('content-type'))) return badRequest()

	// browsers always send Origin on POST, so a missing one is not a same-origin form submission
	const requestUrl = new URL(request.url)
	const origin = request.headers.get('origin')
	if (!origin || origin !== requestUrl.origin) return badRequest()

	const rawBody = await readBodyCapped(request, MAX_BODY_BYTES)
	if (rawBody === null) return badRequest()

	let parsedJson: unknown
	try {
		parsedJson = JSON.parse(rawBody)
	} catch {
		return badRequest()
	}

	// the client is not trusted: the server re-validates with the shared schema
	const parsed = parseContactSubmission(parsedJson)
	if (!parsed.ok) return badRequest()
	const submission = parsed.data

	// a bot gets a fake success and no upstream is called
	if (isHoneypotTripped(submission)) return ok()

	// the missing variable's name goes to the server log only, never to the response
	let env
	try {
		env = readContactEnv(rawEnv)
	} catch (error) {
		console.error('[contact] env misconfigured:', (error as Error).message)
		return serverError()
	}

	const turnstileOk = await verifyTurnstile({
		secret: env.turnstileSecret,
		token: submission.token,
		remoteip: request.headers.get('CF-Connecting-IP') ?? undefined,
		expectedAction: env.turnstileAction,
		expectedHostname: env.turnstileHostname ?? requestUrl.hostname,
		verifyUrl: env.turnstileVerifyUrl,
		fetch: deps.fetch,
		timeoutMs: deps.turnstileTimeoutMs,
	})
	if (!turnstileOk) return badRequest()

	const delivered = await sendTelegramMessage({
		botToken: env.telegramBotToken,
		chatId: env.telegramChatId,
		text: buildTelegramText(submission),
		apiBase: env.telegramApiBase,
		fetch: deps.fetch,
		timeoutMs: deps.telegramTimeoutMs,
	})
	return delivered ? ok() : upstreamError()
}
