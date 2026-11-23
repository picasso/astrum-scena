import { describe, expect, it } from 'vitest'

import { ALBUM_LAYOUTS } from '../../config/variants.ts'
import { type AlbumLayoutConfig, isCropLayout, resolveAlbumLayout } from './album-layout.ts'

describe('resolveAlbumLayout', () => {
	const config: AlbumLayoutConfig = {
		layout: 'justified',
		justified: { targetRowHeight: 200, gap: 10, tolerance: 0.3 },
		masonry: { minColumnWidth: 280, gap: 14, maxColumns: 4 },
		square: { columns: 3, gap: 8, minColumns: 1 },
		rect: { columns: 5, gap: 6, minColumns: 2 },
	}

	it('returns only the settings block of the selected mode', () => {
		expect(resolveAlbumLayout(config)).toEqual({
			layout: 'justified',
			settings: config.justified,
		})
		expect(resolveAlbumLayout({ ...config, layout: 'masonry' })).toEqual({
			layout: 'masonry',
			settings: config.masonry,
		})
		expect(resolveAlbumLayout({ ...config, layout: 'square' })).toEqual({
			layout: 'square',
			settings: config.square,
		})
		expect(resolveAlbumLayout({ ...config, layout: 'rect' })).toEqual({
			layout: 'rect',
			settings: config.rect,
		})
	})

	it('resolves every declared mode (no enum value without a renderer branch)', () => {
		for (const layout of ALBUM_LAYOUTS) {
			expect(resolveAlbumLayout({ ...config, layout }).layout).toBe(layout)
		}
	})

	it('lets an explicit override win over the site default', () => {
		expect(resolveAlbumLayout(config, 'masonry').layout).toBe('masonry')
		expect(resolveAlbumLayout({ ...config, layout: 'masonry' }, 'justified').layout).toBe(
			'justified',
		)
	})

	it('marks only crop modes as crop (viewer opens with fade)', () => {
		expect(isCropLayout('square')).toBe(true)
		expect(isCropLayout('rect')).toBe(true)
		expect(isCropLayout('justified')).toBe(false)
		expect(isCropLayout('masonry')).toBe(false)
	})

	it('fails loudly on a mode that bypassed the schema', () => {
		expect(() => resolveAlbumLayout({ ...config, layout: 'carousel' as never })).toThrow(
			/has no renderer/,
		)
	})
})
