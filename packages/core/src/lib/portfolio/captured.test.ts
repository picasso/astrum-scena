import { describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE_CATALOG } from '../../config/locale-schema.ts'
import { formatCapturedAt } from './captured.ts'

const EN = DEFAULT_LOCALE_CATALOG.en.intl
const RU = DEFAULT_LOCALE_CATALOG.ru.intl

describe('formatCapturedAt', () => {
	it('returns the bare year for a YYYY value', () => {
		expect(formatCapturedAt('2008', EN)).toBe('2008')
		expect(formatCapturedAt('2008', RU)).toBe('2008')
	})

	it('formats YYYY-MM as a localized month and year', () => {
		expect(formatCapturedAt('2008-03', EN)).toBe('March 2008')
		// ru month name is lowercase in Intl long format
		expect(formatCapturedAt('2008-03', RU)).toMatch(/март.*2008/)
	})

	it("formats with the tag of any locale's catalog entry", () => {
		expect(formatCapturedAt('2008-03', 'de-DE')).toBe('März 2008')
	})

	it('is timezone-stable (UTC) — no month drift at boundaries', () => {
		expect(formatCapturedAt('2008-01', EN)).toBe('January 2008')
		expect(formatCapturedAt('2008-12', EN)).toBe('December 2008')
	})

	it('does not remap two-digit years into the 1900s', () => {
		// Date.UTC(50, …) would yield 1950; setUTCFullYear keeps the literal year.
		expect(formatCapturedAt('0050-06', EN)).toBe('June 50')
		expect(formatCapturedAt('0007', EN)).toBe('0007')
	})

	it('throws on a malformed value', () => {
		expect(() => formatCapturedAt('2008-3', EN)).toThrow(/capturedAt/)
		expect(() => formatCapturedAt('not-a-date', EN)).toThrow(/capturedAt/)
	})
})
