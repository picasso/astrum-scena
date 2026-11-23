import { describe, expect, it } from 'vitest'

import { resolveWrapPhotoHref } from './photo-route.ts'
import { albums, photosById } from './test-fixtures.ts'

const base = { albums, photosById, locale: 'en' as const }

describe('resolveWrapPhotoHref', () => {
	it('links to the single published album that owns the photo', () => {
		expect(resolveWrapPhotoHref({ ...base, imageId: 'portrait-b' })).toBe(
			'/en/portfolio/northland/portrait-b/',
		)
	})

	it('fails when the photo belongs to several published albums (ambiguous)', () => {
		expect(() => resolveWrapPhotoHref({ ...base, imageId: 'portrait-a' })).toThrow(/ambiguous/)
	})

	it('fails when the photo has no routable public photo page', () => {
		expect(() => resolveWrapPhotoHref({ ...base, imageId: 'orphan' })).toThrow(/no routable/)
	})
})
