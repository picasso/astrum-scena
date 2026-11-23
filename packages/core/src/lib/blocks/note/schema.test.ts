import { describe, expect, it } from 'vitest'

import { NOTE_TONES, NoteValidationError, parseNoteAttributes } from './schema.ts'

const CLAIM = 'prod-d602206b:64cf2f9d'

describe('parseNoteAttributes', () => {
	it('applies defaults for a minimal claim-only directive', () => {
		expect(parseNoteAttributes({ claim: CLAIM })).toEqual({
			claim: CLAIM,
			tone: 'outdated',
			icon: 'history',
			notitle: false,
		})
	})

	it('requires a claim and rejects a malformed one', () => {
		expect(() => parseNoteAttributes(null)).toThrow(/claim is required/)
		expect(() => parseNoteAttributes({})).toThrow(/claim is required/)
		expect(() => parseNoteAttributes({ claim: 'bad:id' })).toThrow(/malformed claim/)
		expect(() => parseNoteAttributes({ claim: 'x:ZZZ' })).toThrow(/malformed claim/)
	})

	it('accepts every tone in the closed set and the icon, and rejects unknown values', () => {
		expect(NOTE_TONES).toEqual(['outdated', 'info', 'alert'])
		for (const tone of NOTE_TONES) {
			expect(parseNoteAttributes({ claim: CLAIM, tone }).tone).toBe(tone)
		}
		expect(parseNoteAttributes({ claim: CLAIM, icon: 'history' }).icon).toBe('history')
		expect(() => parseNoteAttributes({ claim: CLAIM, tone: 'amber' })).toThrow(/unknown tone/)
		expect(() => parseNoteAttributes({ claim: CLAIM, icon: 'clock' })).toThrow(/unknown icon/)
	})

	it('accepts a title override rendered later as escaped text', () => {
		expect(parseNoteAttributes({ claim: CLAIM, title: 'Обновление' }).title).toBe('Обновление')
		expect(() => parseNoteAttributes({ claim: CLAIM, title: '  ' })).toThrow(/non-empty/)
	})

	it('accepts bare notitle and rejects string forms', () => {
		expect(parseNoteAttributes({ claim: CLAIM, notitle: '' }).notitle).toBe(true)
		expect(() => parseNoteAttributes({ claim: CLAIM, notitle: 'true' })).toThrow(
			NoteValidationError,
		)
	})

	it('rejects title together with notitle', () => {
		expect(() => parseNoteAttributes({ claim: CLAIM, title: 'x', notitle: '' })).toThrow(
			/mutually exclusive/,
		)
	})

	it('rejects unknown parameters and directive shortcuts', () => {
		expect(() => parseNoteAttributes({ claim: CLAIM, width: '90' })).toThrow(
			/unknown parameter/,
		)
		expect(() => parseNoteAttributes({ claim: CLAIM, class: 'fancy' })).toThrow(/shortcut/)
		expect(() => parseNoteAttributes({ claim: CLAIM, id: 'x' })).toThrow(/shortcut/)
	})

	it('omits title when absent', () => {
		expect('title' in parseNoteAttributes({ claim: CLAIM })).toBe(false)
	})
})
