import { describe, expect, it } from 'vitest'

import { formatNoteClaim, NOTE_CLAIM_PATTERN, parseNoteClaim } from './claim.ts'

describe('note claim format', () => {
	it('parses a canonical findingId:digest8', () => {
		expect(parseNoteClaim('prod-d602206b:64cf2f9d')).toEqual({
			findingId: 'prod-d602206b',
			digest8: '64cf2f9d',
		})
		expect(parseNoteClaim('claim-4c230d69:03f8def0')).toEqual({
			findingId: 'claim-4c230d69',
			digest8: '03f8def0',
		})
	})

	it('rejects malformed claims', () => {
		for (const bad of [
			'bad:id', // digest8 not 8 hex
			'x:ZZZ', // non-hex digest
			'x:64CF2F9D', // uppercase hex
			'no-colon', // missing separator
			'a:b:64cf2f9d', // extra colon in id part
			'prod-1:64cf2f9', // 7 hex
			'prod-1:64cf2f9de', // 9 hex
			'', // empty
		]) {
			expect(parseNoteClaim(bad), bad).toBeNull()
			expect(NOTE_CLAIM_PATTERN.test(bad), bad).toBe(false)
		}
	})

	it('formats a claim and round-trips through parse', () => {
		const claim = formatNoteClaim('prod-d602206b', '64cf2f9d')
		expect(claim).toBe('prod-d602206b:64cf2f9d')
		expect(parseNoteClaim(claim)).toEqual({ findingId: 'prod-d602206b', digest8: '64cf2f9d' })
	})

	it('fails to format unsafe parts', () => {
		expect(() => formatNoteClaim('bad:id', '64cf2f9d')).toThrow(/unsafe note finding id/)
		expect(() => formatNoteClaim('prod-1', 'ZZZ')).toThrow(/digest8/)
		expect(() => formatNoteClaim('prod-1', '64CF2F9D')).toThrow(/digest8/)
	})
})
