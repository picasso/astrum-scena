import { z } from 'astro/zod'

import { localeCodeSchema } from '../../config/locale-schema.ts'

// one schema for the island and the Pages Function, and the server re-validates everything;
// `astro/zod` is a thin re-export of `zod/v4`, so the worker bundle gets zod, not the Astro runtime
//
// limits count bytes, not characters: abuse is payload bytes, and UTF-8 multiplies them for
// Cyrillic and emoji

export const CONTACT_LIMITS = {
	name: 100,
	email: 254, // RFC 5321 practical max
	message: 4000,
	token: 4096, // defensive upper bound for a Turnstile token
	// UTF-8 budget leaves room for Telegram service lines and a conservative delivery margin
	total: 3900,
} as const

const encoder = new TextEncoder()
// UTF-8 bytes without Buffer, so it runs in a Worker
export function byteLength(value: string): number {
	return encoder.encode(value).length
}

// must return a boolean: refine treats any truthy value as valid, so an error string would pass
const withinBytes = (limit: number) => (value: string) => byteLength(value) <= limit

// an object schema otherwise probes `Function` when it is built to pick a compiled parser; the site's
// CSP has no 'unsafe-eval', so in the browser the probe raises a CSP violation on every form load
z.config({ jitless: true })

// every string field is trimmed before its checks
export const contactSubmissionSchema = z
	.object({
		locale: localeCodeSchema,
		name: z
			.string()
			.transform((value) => value.trim())
			.refine((value) => value.length > 0, 'name is required')
			.refine(withinBytes(CONTACT_LIMITS.name), 'name is too long'),
		email: z
			.string()
			.transform((value) => value.trim())
			.refine((value) => z.email().safeParse(value).success, 'invalid email')
			.refine(withinBytes(CONTACT_LIMITS.email), 'email is too long'),
		message: z
			.string()
			.transform((value) => value.trim())
			.refine((value) => value.length > 0, 'message is required')
			.refine(withinBytes(CONTACT_LIMITS.message), 'message is too long'),
		// only shape is checked here; the server verifies the token with Cloudflare
		token: z
			.string()
			.refine((value) => value.length > 0, 'token is required')
			.refine(withinBytes(CONTACT_LIMITS.token), 'token is too long'),
		// honeypot: any string passes here and the server decides it is spam, so the client learns
		// nothing about the rule
		company: z.string().optional().default(''),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (
			byteLength(value.name) + byteLength(value.email) + byteLength(value.message) >
			CONTACT_LIMITS.total
		) {
			ctx.addIssue({ code: 'custom', message: 'submission is too large', path: ['message'] })
		}
	})

export type ContactSubmission = z.infer<typeof contactSubmissionSchema>

// an empty or whitespace-only value means a human
export function isHoneypotTripped(submission: Pick<ContactSubmission, 'company'>): boolean {
	return submission.company.trim().length > 0
}

// returns a discriminated result instead of throwing
export function parseContactSubmission(
	raw: unknown,
): { ok: true; data: ContactSubmission } | { ok: false } {
	const result = contactSubmissionSchema.safeParse(raw)
	return result.success ? { ok: true, data: result.data } : { ok: false }
}
