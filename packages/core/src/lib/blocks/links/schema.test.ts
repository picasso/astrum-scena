import { describe, expect, it } from 'vitest'

import { CONTENT_GAPS } from '../content-gap.ts'
import {
	LINKS_ALIGNS,
	LINKS_ICONS,
	LINKS_SIZES,
	LINKS_WIDTHS,
	LinksValidationError,
	parseLinksAttributes,
} from './schema.ts'

describe('parseLinksAttributes', () => {
	it('applies defaults for a minimal attribute-less directive', () => {
		expect(parseLinksAttributes(null)).toEqual({
			size: 'sm',
			gap: 'tiny',
			width: 'content',
			align: 'right',
			icon: 'heading',
			notitle: false,
		})
	})

	it('accepts every value in each closed enum', () => {
		for (const size of LINKS_SIZES) expect(parseLinksAttributes({ size }).size).toBe(size)
		for (const width of LINKS_WIDTHS) expect(parseLinksAttributes({ width }).width).toBe(width)
		for (const align of LINKS_ALIGNS) expect(parseLinksAttributes({ align }).align).toBe(align)
		for (const icon of LINKS_ICONS) expect(parseLinksAttributes({ icon }).icon).toBe(icon)
	})

	it('accepts every shared ContentGap value and rejects a private tight/normal/loose scale', () => {
		for (const gap of CONTENT_GAPS) expect(parseLinksAttributes({ gap }).gap).toBe(gap)
		expect(() => parseLinksAttributes({ gap: 'tight' })).toThrow(/unknown gap/)
		expect(() => parseLinksAttributes({ gap: 'normal' })).toThrow(/unknown gap/)
		expect(() => parseLinksAttributes({ gap: 'loose' })).toThrow(/unknown gap/)
	})

	it('rejects unknown enum values', () => {
		expect(() => parseLinksAttributes({ size: 'huge' })).toThrow(/unknown size/)
		expect(() => parseLinksAttributes({ width: 'half' })).toThrow(/unknown width/)
		expect(() => parseLinksAttributes({ align: 'top' })).toThrow(/unknown align/)
		expect(() => parseLinksAttributes({ icon: 'star' })).toThrow(/unknown icon/)
	})

	it('accepts a title override and rejects an empty/whitespace one', () => {
		expect(parseLinksAttributes({ title: 'Полезное' }).title).toBe('Полезное')
		expect(() => parseLinksAttributes({ title: '  ' })).toThrow(/non-empty/)
	})

	it('accepts bare notitle and rejects string forms', () => {
		expect(parseLinksAttributes({ notitle: '' }).notitle).toBe(true)
		expect(() => parseLinksAttributes({ notitle: 'true' })).toThrow(LinksValidationError)
	})

	it('rejects title together with notitle', () => {
		expect(() => parseLinksAttributes({ title: 'x', notitle: '' })).toThrow(
			/mutually exclusive/,
		)
	})

	it('rejects unknown parameters and directive shortcuts', () => {
		expect(() => parseLinksAttributes({ layout: 'inline' })).toThrow(/unknown parameter/)
		expect(() => parseLinksAttributes({ class: 'fancy' })).toThrow(/shortcut/)
		expect(() => parseLinksAttributes({ id: 'x' })).toThrow(/shortcut/)
	})

	it('omits title when absent', () => {
		expect('title' in parseLinksAttributes(null)).toBe(false)
	})
})
