import { describe, expect, it } from 'vitest'

import { type RandomSource, sampleWithoutReplacement } from './random.ts'

function sequence(values: number[]): RandomSource {
	let index = 0
	return () => values[index++ % values.length]!
}

describe('sampleWithoutReplacement', () => {
	const pool = ['a', 'b', 'c', 'd', 'e']

	it('returns exactly count unique items from the pool', () => {
		const sample = sampleWithoutReplacement(pool, 3, sequence([0, 0, 0]))
		expect(sample).toHaveLength(3)
		expect(new Set(sample).size).toBe(3)
		for (const id of sample) expect(pool).toContain(id)
	})

	it('is deterministic under an injected RNG and differs when the RNG differs', () => {
		const a = sampleWithoutReplacement(pool, 3, sequence([0, 0, 0]))
		const b = sampleWithoutReplacement(pool, 3, sequence([0, 0, 0]))
		expect(a).toEqual(b)
		const c = sampleWithoutReplacement(pool, 3, sequence([0.99, 0.99, 0.99]))
		expect(c).not.toEqual(a)
	})

	it('does not mutate the input pool', () => {
		const input = [...pool]
		sampleWithoutReplacement(input, 2, sequence([0.5, 0.5]))
		expect(input).toEqual(pool)
	})

	it('returns a full permutation when count >= pool size', () => {
		const sample = sampleWithoutReplacement(pool, 99, sequence([0.1, 0.4, 0.7, 0.2, 0.9]))
		expect(sample).toHaveLength(pool.length)
		expect(new Set(sample)).toEqual(new Set(pool))
	})

	it('selects a uniform-looking spread across the pool (first pick tracks the RNG)', () => {
		// index 0 swap target = floor(r * 5): r=0 -> a, r=0.2 -> b, r=0.4 -> c, r=0.6 -> d, r=0.8 -> e
		expect(sampleWithoutReplacement(pool, 1, sequence([0]))[0]).toBe('a')
		expect(sampleWithoutReplacement(pool, 1, sequence([0.4]))[0]).toBe('c')
		expect(sampleWithoutReplacement(pool, 1, sequence([0.8]))[0]).toBe('e')
	})
})
