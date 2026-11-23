import { describe, expect, it } from 'vitest'

import { formatCapturedAt } from './captured.ts'

describe('formatCapturedAt', () => {
	it('returns the bare year for a YYYY value', () => {
		expect(formatCapturedAt('2008', 'en')).toBe('2008')
		expect(formatCapturedAt('2008', 'ru')).toBe('2008')
	})

	it('formats YYYY-MM as a localized month and year', () => {
		expect(formatCapturedAt('2008-03', 'en')).toBe('March 2008')
		// ru month name is lowercase in Intl long format
		expect(formatCapturedAt('2008-03', 'ru')).toMatch(/март.*2008/)
	})

	it('is timezone-stable (UTC) — no month drift at boundaries', () => {
		expect(formatCapturedAt('2008-01', 'en')).toBe('January 2008')
		expect(formatCapturedAt('2008-12', 'en')).toBe('December 2008')
	})

	it('does not remap two-digit years into the 1900s', () => {
		// Date.UTC(50, …) would yield 1950; setUTCFullYear keeps the literal year.
		expect(formatCapturedAt('0050-06', 'en')).toBe('June 50')
		expect(formatCapturedAt('0007', 'en')).toBe('0007')
	})

	it('throws on a malformed value', () => {
		expect(() => formatCapturedAt('2008-3', 'en')).toThrow(/capturedAt/)
		expect(() => formatCapturedAt('not-a-date', 'en')).toThrow(/capturedAt/)
	})
})
