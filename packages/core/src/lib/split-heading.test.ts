import { describe, expect, it } from 'vitest'

import { SPLIT_POINTS, splitHeading } from './split-heading'

describe('SPLIT_POINTS', () => {
	it('matches the legacy PHP table', () => {
		expect(SPLIT_POINTS).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 4])
	})
})

describe('splitHeading — automatic split (several words)', () => {
	// the boundary space opens the tail (inside the accent span), otherwise
	// `{head}<span>{tail}</span>` would lose it
	it('2 words: "Quiet Light"', () => {
		expect(splitHeading('Quiet Light')).toEqual({
			clean: 'Quiet Light',
			head: 'Quiet',
			tail: ' Light',
		})
	})

	it('6 words: break_index = 1', () => {
		expect(splitHeading('Look into the light of dawn')).toEqual({
			clean: 'Look into the light of dawn',
			head: 'Look into',
			tail: ' the light of dawn',
		})
	})

	it('4 words (Cyrillic): break_index = 0', () => {
		expect(splitHeading('В поисках тихой воды')).toEqual({
			clean: 'В поисках тихой воды',
			head: 'В',
			tail: ' поисках тихой воды',
		})
	})

	it('normalizes whitespace in clean', () => {
		expect(splitHeading('  Quiet   Light  ')).toEqual({
			clean: 'Quiet Light',
			head: 'Quiet',
			tail: ' Light',
		})
	})

	it('keeps head + tail === clean', () => {
		for (const title of [
			'Quiet Light',
			'Look into the light of dawn',
			'В поисках тихой воды',
		]) {
			const { clean, head, tail } = splitHeading(title)
			expect(head + tail).toBe(clean)
		}
	})
})

describe('splitHeading — single word', () => {
	it('is not split without a hyphen or a marker', () => {
		expect(splitHeading('Portfolio')).toEqual({
			clean: 'Portfolio',
			head: 'Portfolio',
			tail: '',
		})
	})

	it('is split after the hyphen by the legacy dash branch', () => {
		expect(splitHeading('Санкт-Петербург')).toEqual({
			clean: 'Санкт-Петербург',
			head: 'Санкт-',
			tail: 'Петербург',
		})
	})
})

describe('splitHeading — manual | marker', () => {
	it('splits a single word without adding spaces', () => {
		expect(splitHeading('Portfo|lio')).toEqual({
			clean: 'Portfolio',
			head: 'Portfo',
			tail: 'lio',
		})
	})

	it('keeps author spacing as is', () => {
		expect(splitHeading('Look into |the light of dawn')).toEqual({
			clean: 'Look into the light of dawn',
			head: 'Look into ',
			tail: 'the light of dawn',
		})
	})
})

describe('splitHeading — empty input', () => {
	it('empty string', () => {
		expect(splitHeading('')).toEqual({ clean: '', head: '', tail: '' })
	})

	it('whitespace only', () => {
		expect(splitHeading('   ')).toEqual({ clean: '', head: '', tail: '' })
	})
})

describe('splitHeading — ≥ 12 words: break_index = floor(n/2) - 1', () => {
	it('12 words → break_index = 5', () => {
		const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']
		expect(splitHeading(words.join(' '))).toEqual({
			clean: words.join(' '),
			head: 'a b c d e f',
			tail: ' g h i j k l',
		})
	})

	it('13 words → break_index = 5', () => {
		const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm']
		expect(splitHeading(words.join(' '))).toEqual({
			clean: words.join(' '),
			head: 'a b c d e f',
			tail: ' g h i j k l m',
		})
	})
})
