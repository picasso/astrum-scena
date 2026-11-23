import { describe, expect, it } from 'vitest'

import { contentBoxThumbBounds } from './photoswipe-thumb-bounds.ts'

describe('contentBoxThumbBounds', () => {
	it('removes the thumbnail border from the PhotoSwipe zoom origin', () => {
		expect(
			contentBoxThumbBounds(
				{ left: 704.8, top: 695.2, width: 453.6 },
				{ left: 5, right: 5, top: 5 },
			),
		).toEqual({ x: 709.8, y: 700.2, w: 443.6 })
	})

	it('preserves an unframed thumbnail', () => {
		expect(
			contentBoxThumbBounds({ left: 20, top: 30, width: 400 }, { left: 0, right: 0, top: 0 }),
		).toEqual({ x: 20, y: 30, w: 400 })
	})
})
