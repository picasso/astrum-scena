import { describe, expect, it } from 'vitest'

import { CalloutValidationError, parseCalloutAttributes } from './schema.ts'

describe('parseCalloutAttributes', () => {
	it('applies defaults for a minimal directive', () => {
		expect(parseCalloutAttributes(null)).toEqual({
			variant: 'block',
			tone: 'default',
			transparent: false,
		})
		expect(parseCalloutAttributes({})).toEqual({
			variant: 'block',
			tone: 'default',
			transparent: false,
		})
	})

	it('accepts every variant, tone and icon value', () => {
		for (const variant of ['block', 'line'] as const) {
			expect(parseCalloutAttributes({ variant }).variant).toBe(variant)
		}
		for (const tone of ['default', 'accent', 'alt'] as const) {
			expect(parseCalloutAttributes({ tone }).tone).toBe(tone)
		}
		for (const icon of [
			'home',
			'image',
			'video',
			'calendar',
			'bookmark',
			'mail',
			'person',
			'text',
		] as const) {
			expect(parseCalloutAttributes({ icon }).icon).toBe(icon)
		}
	})

	it('accepts bare transparent and rejects string forms', () => {
		expect(parseCalloutAttributes({ transparent: '' }).transparent).toBe(true)
		expect(() => parseCalloutAttributes({ transparent: 'true' })).toThrow(
			CalloutValidationError,
		)
		expect(() => parseCalloutAttributes({ transparent: 'false' })).toThrow(
			CalloutValidationError,
		)
	})

	it('rejects unknown parameters, enum values and directive shortcuts', () => {
		expect(() => parseCalloutAttributes({ variant: 'huge' })).toThrow(/unknown variant/)
		expect(() => parseCalloutAttributes({ tone: 'blue' })).toThrow(/unknown tone/)
		expect(() => parseCalloutAttributes({ icon: 'calender' })).toThrow(/unknown icon/)
		expect(() => parseCalloutAttributes({ width: '90' })).toThrow(/unknown parameter/)
		expect(() => parseCalloutAttributes({ class: 'fancy' })).toThrow(/shortcut/)
		expect(() => parseCalloutAttributes({ id: 'x' })).toThrow(/shortcut/)
	})

	it('omits icon when absent', () => {
		expect('icon' in parseCalloutAttributes({})).toBe(false)
	})
})
