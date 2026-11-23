// the randomness source is injected so tests can stay deterministic (docs/blocks/gallery.md); no
// DOM, Astro or node imports because the browser coordinator uses it too

// returns a number in `[0, 1)`
export type RandomSource = () => number

// partial Fisher–Yates for an unbiased sample; the build already guarantees `count <= poolSize`,
// the clamp only keeps a larger count from reading past the pool
export function sampleWithoutReplacement<T>(
	items: readonly T[],
	count: number,
	random: RandomSource,
): T[] {
	const pool = [...items]
	const total = pool.length
	const take = Math.max(0, Math.min(count, total))
	for (let index = 0; index < take; index += 1) {
		const swap = index + Math.floor(random() * (total - index))
		const picked = pool[swap]!
		pool[swap] = pool[index]!
		pool[index] = picked
	}
	return pool.slice(0, take)
}

// unseeded on purpose: every page view samples independently and RU/EN are not kept in sync
export function defaultRandomSource(): RandomSource {
	const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
	if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
		return () => {
			const buffer = new Uint32Array(1)
			cryptoObj.getRandomValues(buffer)
			return buffer[0]! / 2 ** 32
		}
	}
	return () => Math.random()
}
