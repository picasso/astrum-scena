import { describe, expect, it } from 'vitest'

import {
	byteLength,
	CONTACT_LIMITS,
	contactSubmissionSchema,
	isHoneypotTripped,
	parseContactSubmission,
} from './schema.ts'

const valid = () => ({
	locale: 'en',
	name: 'Jane Doe',
	email: 'jane@example.com',
	message: 'Hello, I would like a print.',
	token: 'turnstile-token',
	company: '',
})

describe('contactSubmissionSchema', () => {
	it('accepts a valid submission and trims string fields', () => {
		const result = contactSubmissionSchema.safeParse({
			...valid(),
			name: '  Jane Doe  ',
			email: '  jane@example.com ',
			message: '  Hello  ',
		})
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.name).toBe('Jane Doe')
			expect(result.data.email).toBe('jane@example.com')
			expect(result.data.message).toBe('Hello')
		}
	})

	it('requires name, message and a non-empty token', () => {
		expect(contactSubmissionSchema.safeParse({ ...valid(), name: '   ' }).success).toBe(false)
		expect(contactSubmissionSchema.safeParse({ ...valid(), message: '' }).success).toBe(false)
		expect(contactSubmissionSchema.safeParse({ ...valid(), token: '' }).success).toBe(false)
	})

	// the Worker has no site config, so it checks the locale's format only
	it('rejects an invalid email and a malformed locale code', () => {
		expect(
			contactSubmissionSchema.safeParse({ ...valid(), email: 'not-an-email' }).success,
		).toBe(false)
		for (const locale of ['EN', 'english', 'e'])
			expect(contactSubmissionSchema.safeParse({ ...valid(), locale }).success, locale).toBe(
				false,
			)
		expect(contactSubmissionSchema.safeParse({ ...valid(), locale: 'de' }).success).toBe(true)
	})

	it('is strict — rejects unknown keys', () => {
		expect(contactSubmissionSchema.safeParse({ ...valid(), extra: 1 }).success).toBe(false)
	})

	it('enforces per-field byte limits', () => {
		expect(
			contactSubmissionSchema.safeParse({
				...valid(),
				name: 'a'.repeat(CONTACT_LIMITS.name + 1),
			}).success,
		).toBe(false)
		expect(
			contactSubmissionSchema.safeParse({
				...valid(),
				message: 'a'.repeat(CONTACT_LIMITS.message + 1),
			}).success,
		).toBe(false)
	})

	it('enforces the combined total-size budget', () => {
		const big = 'a'.repeat(CONTACT_LIMITS.message)
		const result = contactSubmissionSchema.safeParse({
			...valid(),
			name: 'a'.repeat(CONTACT_LIMITS.name),
			message: big,
		})
		expect(result.success).toBe(false)
	})

	it('counts bytes, not characters, for multibyte input', () => {
		expect(byteLength('é')).toBe(2)
		expect(byteLength('日')).toBe(3)
	})
})

describe('isHoneypotTripped', () => {
	it('treats an empty/whitespace company field as human', () => {
		expect(isHoneypotTripped({ company: '' })).toBe(false)
		expect(isHoneypotTripped({ company: '   ' })).toBe(false)
	})
	it('treats a filled company field as a bot', () => {
		expect(isHoneypotTripped({ company: 'Acme' })).toBe(true)
	})
})

describe('parseContactSubmission', () => {
	it('returns ok:false for garbage without throwing', () => {
		expect(parseContactSubmission(null).ok).toBe(false)
		expect(parseContactSubmission({ foo: 'bar' }).ok).toBe(false)
	})
	it('returns ok:true with parsed data for a valid payload', () => {
		const parsed = parseContactSubmission(valid())
		expect(parsed.ok).toBe(true)
	})
})

it('rejects the formerly accepted ASCII payload before formatting', () => {
	expect(
		contactSubmissionSchema.safeParse({
			...valid(),
			name: 'N'.repeat(80),
			message: 'M'.repeat(4000),
		}).success,
	).toBe(false)
})
