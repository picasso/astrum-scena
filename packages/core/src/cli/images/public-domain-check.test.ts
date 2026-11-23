import { describe, expect, it } from 'vitest'

import { checkPublicDomain, type FetchLike } from './public-domain-check.ts'
import { IMMUTABLE_CACHE_CONTROL } from './r2-client.ts'
import { syntheticManifest } from './test-fixtures.ts'

const ORIGIN = 'https://img.example.com'
const BYTES = Buffer.from('x'.repeat(100))
const manifest = syntheticManifest({ 'photo-a': BYTES })
const KEY = manifest.photos['photo-a']!.derivatives[0]!.objectKey

const respond =
	(status: number, map: Record<string, string>): FetchLike =>
	async () => ({
		ok: status >= 200 && status < 300,
		status,
		headers: { get: (name) => map[name.toLowerCase()] ?? null },
	})

const GOOD = {
	'content-type': 'image/avif',
	'cache-control': IMMUTABLE_CACHE_CONTROL,
	'content-length': String(BYTES.length),
}

const check = (fetchImpl: FetchLike) =>
	checkPublicDomain({ manifest, publicOrigin: ORIGIN, fetchImpl })

describe('checkPublicDomain', () => {
	it('sends a HEAD of the origin and the key, and passes on the right headers', async () => {
		const urls: string[] = []
		const result = await check(async (url, init) => {
			urls.push(`${init.method} ${init.redirect} ${url}`)
			return respond(200, GOOD)(url, init)
		})
		expect(result).toEqual({ ok: true, errors: [], verified: 1, total: 1 })
		expect(urls).toEqual([`HEAD manual ${ORIGIN}/${KEY}`])
	})

	it.each([
		['a 404', respond(404, {}), 'status 404'],
		[
			'a wrong content type',
			respond(200, { ...GOOD, 'content-type': 'image/webp' }),
			'content-type',
		],
		[
			'mutable caching',
			respond(200, { ...GOOD, 'cache-control': 'no-store' }),
			'not immutable',
		],
		[
			'no-store beside immutable',
			respond(200, { ...GOOD, 'cache-control': 'no-store, immutable' }),
			'not immutable',
		],
		[
			'a directive that only contains immutable',
			respond(200, { ...GOOD, 'cache-control': 'public, not-immutable' }),
			'not immutable',
		],
		[
			'a redirect to another host',
			async () => ({
				ok: false,
				status: 301,
				headers: {
					get: (name: string) => (name === 'location' ? 'https://other.test/x' : null),
				},
			}),
			`public HEAD "${KEY}" redirected with status 301`,
		],
		[
			'a wrong length',
			respond(200, { ...GOOD, 'content-length': '999' }),
			'content-length 999',
		],
		[
			'a network error',
			async () => {
				throw new Error('ECONNRESET')
			},
			'ECONNRESET',
		],
	] satisfies [string, FetchLike, string][])('fails closed on %s', async (_, fetchImpl, text) => {
		const result = await check(fetchImpl)
		expect(result.ok).toBe(false)
		expect(result.errors[0]).toContain(text)
	})

	it('accepts a response without a content length', async () => {
		const withoutLength = {
			'content-type': GOOD['content-type'],
			'cache-control': GOOD['cache-control'],
		}
		expect((await check(respond(200, withoutLength))).ok).toBe(true)
	})
})
