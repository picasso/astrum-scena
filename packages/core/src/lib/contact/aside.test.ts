import { describe, expect, it } from 'vitest'

import { contactsAsideCropScale, contactsAsideFrameAspect } from './aside.ts'

describe('contactsAsideFrameAspect', () => {
	it('keeps the natural height for original and maps numeric ratios to CSS', () => {
		expect(contactsAsideFrameAspect('original')).toBeUndefined()
		expect(contactsAsideFrameAspect('1:1')).toBe('1 / 1')
		expect(contactsAsideFrameAspect('4:5')).toBe('4 / 5')
		expect(contactsAsideFrameAspect('9:16')).toBe('9 / 16')
	})
})

describe('contactsAsideCropScale', () => {
	const portrait = { width: 400, height: 600 }
	const landscape = { width: 600, height: 400 }

	it('is 1 when the frame is not narrower than the photo', () => {
		expect(contactsAsideCropScale('original', landscape)).toBe(1)
		expect(contactsAsideCropScale('1:1', portrait)).toBe(1)
		expect(contactsAsideCropScale('2:3', portrait)).toBeCloseTo(1)
	})

	it('grows when a narrow frame crops the photo at the sides', () => {
		expect(contactsAsideCropScale('9:16', portrait)).toBeCloseTo(16 / 9 / 1.5)
		expect(contactsAsideCropScale('1:1', landscape)).toBeCloseTo(1.5)
	})
})
