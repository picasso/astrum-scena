import { describe, expect, it } from 'vitest'

import { isPhotoPageUnlisted } from './photo-page.ts'

describe('isPhotoPageUnlisted', () => {
	it('inherits unlisted from the album and keeps a photo-level flag', () => {
		expect(isPhotoPageUnlisted({ unlisted: true }, {})).toBe(true)
		expect(isPhotoPageUnlisted({}, { unlisted: true })).toBe(true)
		expect(isPhotoPageUnlisted({}, {})).toBe(false)
		expect(isPhotoPageUnlisted({ unlisted: false }, { unlisted: false })).toBe(false)
	})
})
