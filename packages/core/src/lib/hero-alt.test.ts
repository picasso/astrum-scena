import { describe, expect, it } from 'vitest'

import { computeAlt } from './hero-alt'

// the fallback is the caller's input; its value is built here, not read from site.yaml
const FALLBACK = 'Photograph by Example Author'

describe('computeAlt', () => {
	it('uses the clean title for a regular slide', () => {
		expect(computeAlt({ title: 'Quiet Light', desc: 'что-то', fallback: FALLBACK })).toBe(
			'Quiet Light',
		)
	})

	it('drops the | marker from the title', () => {
		expect(computeAlt({ title: 'Portfo|lio', desc: '', fallback: FALLBACK })).toBe('Portfolio')
	})

	it('falls back to the first sentence of the description when the title is empty', () => {
		expect(
			computeAlt({ title: '', desc: 'Первое предложение. Второе.', fallback: FALLBACK }),
		).toBe('Первое предложение.')
	})

	it('strips HTML and markers from the description before picking the sentence', () => {
		expect(
			computeAlt({
				title: '',
				desc: '<p>[:ru]Закат над морем. Тишина.</p>',
				fallback: FALLBACK,
			}),
		).toBe('Закат над морем.')
	})

	it('strips HTML and markers from the title like from the description', () => {
		expect(computeAlt({ title: '<b>[:x]Quiet</b> Light', desc: '', fallback: FALLBACK })).toBe(
			'Quiet Light',
		)
	})

	it('uses the title when the description is empty', () => {
		expect(computeAlt({ title: 'Санкт-Петербург', desc: '', fallback: FALLBACK })).toBe(
			'Санкт-Петербург',
		)
	})

	it('returns the given fallback when both are empty', () => {
		expect(computeAlt({ title: '', desc: '', fallback: FALLBACK })).toBe(FALLBACK)
	})
})
