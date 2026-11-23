import { describe, expect, it } from 'vitest'

import { footerColumnCount } from './footer-columns.ts'

describe('footerColumnCount', () => {
	it('keeps the configured count while enough columns are visible', () => {
		expect(footerColumnCount(3, 3)).toBe(3)
		expect(footerColumnCount(2, 3)).toBe(2)
		expect(footerColumnCount(1, 3)).toBe(1)
	})

	it('shrinks to the visible columns so no empty track remains', () => {
		expect(footerColumnCount(3, 2)).toBe(2)
		expect(footerColumnCount(3, 1)).toBe(1)
		expect(footerColumnCount(2, 1)).toBe(1)
	})

	it('never drops below one column', () => {
		expect(footerColumnCount(3, 0)).toBe(1)
	})
})
