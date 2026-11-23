import { describe, expect, it } from 'vitest'

import { cleanText, firstSentence, truncateSentences } from './text'

// a long multi-sentence RU description (500+ characters)
const LONG_RU =
	'Съёмка этого кадра заняла у меня несколько часов ожидания на холодном ветру. ' +
	'Свет менялся каждую минуту, и я боялся упустить тот единственный момент, ради которого приехал. ' +
	'Наконец облака разошлись, и долина наполнилась тёплым золотым сиянием. ' +
	'Я сделал серию снимков, стараясь не дышать, чтобы не смазать длинную выдержку. ' +
	'Этот момент навсегда остался в моей памяти как один из самых красивых закатов.'

describe('truncateSentences', () => {
	it('cuts long text at a sentence boundary within 400 characters', () => {
		const out = truncateSentences(LONG_RU)
		expect(out.length).toBeLessThanOrEqual(400)
		expect(/[.!?…]$/.test(out)).toBe(true)
		expect(out.startsWith('Съёмка этого кадра')).toBe(true)
	})

	it('returns an empty string for an empty string', () => {
		expect(truncateSentences('')).toBe('')
	})

	it('keeps unterminated text shorter than the budget whole', () => {
		expect(truncateSentences('Просто короткая подпись')).toBe('Просто короткая подпись')
	})

	it('returns a first sentence longer than the budget whole', () => {
		const long = 'a'.repeat(500) + '. Второе.'
		expect(truncateSentences(long, 400)).toBe('a'.repeat(500) + '.')
	})

	it('keeps the ellipsis character intact', () => {
		const out = truncateSentences('Свет уходил медленно… Я ждал ещё немного.', 400)
		expect(out).toBe('Свет уходил медленно… Я ждал ещё немного.')
		expect(out).toContain('…')
	})
})

describe('cleanText', () => {
	it('strips HTML tags and [...] markers', () => {
		expect(cleanText('<p>Текст [:ru] тут [caption]подпись[/caption]</p>')).toBe(
			'Текст тут подпись',
		)
	})

	it('collapses and trims whitespace', () => {
		expect(cleanText('  много    пробелов \n тут  ')).toBe('много пробелов тут')
	})

	it('returns an empty string for empty input', () => {
		expect(cleanText('')).toBe('')
	})
})

describe('firstSentence', () => {
	it('returns the first sentence', () => {
		expect(firstSentence('Первое. Второе.')).toBe('Первое.')
	})

	it('returns the whole text without a terminator', () => {
		expect(firstSentence('Без точки')).toBe('Без точки')
	})
})
