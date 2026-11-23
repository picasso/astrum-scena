import { describe, expect, it } from 'vitest'

import { parseWrapAroundProps } from './schema.ts'

describe('parseWrapAroundProps', () => {
	it('applies defaults and accepts a minimal single image', () => {
		const props = parseWrapAroundProps({ images: [{ imageId: 'a' }] })
		expect(props).toMatchObject({
			position: 'left',
			outside: 0,
			textGap: 'small',
			imageGap: 'small',
			frame: 'thick',
			frameColor: 'default',
			action: 'lightbox',
			inlineCaption: false,
			lightboxCaption: true,
			lightboxScope: 'page',
		})
		expect(props.width).toBeUndefined()
	})

	it('accepts outside with an explicit width and a viable float slot', () => {
		const props = parseWrapAroundProps({ imageId: 'a', width: 70, outside: 20 })
		expect(props).toMatchObject({ width: 70, outside: 20 })
	})

	it('rejects outside without a width or with less than 20 percent left for text wrapping', () => {
		expect(() => parseWrapAroundProps({ imageId: 'a', outside: 20 })).toThrow(/outside/)
		expect(() => parseWrapAroundProps({ imageId: 'a', width: 40, outside: 21 })).toThrow(
			/outside/,
		)
		expect(() => parseWrapAroundProps({ imageId: 'a', width: 80, outside: 60 })).not.toThrow()
	})

	it('normalizes the imageId shorthand while preserving block-level options', () => {
		const props = parseWrapAroundProps({
			imageId: 'a',
			position: 'right',
			width: 60,
			action: 'none',
			frame: 'thin',
		})
		expect(props).toMatchObject({
			images: [{ imageId: 'a' }],
			position: 'right',
			width: 60,
			action: 'none',
			frame: 'thin',
		})
		expect(props).not.toHaveProperty('imageId')
	})

	it('requires exactly one of imageId or images', () => {
		expect(() => parseWrapAroundProps({})).toThrow()
		expect(() => parseWrapAroundProps({ imageId: 'a', images: [{ imageId: 'b' }] })).toThrow()
	})

	it('keeps per-image overrides exclusive to the images form', () => {
		expect(() => parseWrapAroundProps({ imageId: { imageId: 'a', action: 'none' } })).toThrow()
	})

	it('accepts both positions, the width bounds and every action union member', () => {
		expect(
			parseWrapAroundProps({ images: [{ imageId: 'a' }], position: 'right' }).position,
		).toBe('right')
		expect(parseWrapAroundProps({ images: [{ imageId: 'a' }], width: 20 }).width).toBe(20)
		expect(parseWrapAroundProps({ images: [{ imageId: 'a' }], width: 80 }).width).toBe(80)
		for (const action of [
			'none',
			'lightbox',
			'photo',
			{ type: 'album', albumId: 'northland' },
			{ type: 'custom', href: '/x/', newTab: true },
		] as const) {
			expect(() => parseWrapAroundProps({ images: [{ imageId: 'a', action }] })).not.toThrow()
		}
	})

	it('rejects an empty images array', () => {
		expect(() => parseWrapAroundProps({ images: [] })).toThrow(/images/)
	})

	it('rejects a fractional, out-of-range or non-numeric width', () => {
		expect(() => parseWrapAroundProps({ images: [{ imageId: 'a' }], width: 33.5 })).toThrow(
			/width/,
		)
		expect(() => parseWrapAroundProps({ images: [{ imageId: 'a' }], width: 19 })).toThrow(
			/width/,
		)
		expect(() => parseWrapAroundProps({ images: [{ imageId: 'a' }], width: 81 })).toThrow(
			/width/,
		)
		expect(() => parseWrapAroundProps({ images: [{ imageId: 'a' }], width: '45' })).toThrow(
			/width/,
		)
	})

	it('rejects a fractional or out-of-range outside value', () => {
		expect(() => parseWrapAroundProps({ imageId: 'a', width: 70, outside: 20.5 })).toThrow(
			/outside/,
		)
		expect(() => parseWrapAroundProps({ imageId: 'a', width: 70, outside: -1 })).toThrow(
			/outside/,
		)
		expect(() => parseWrapAroundProps({ imageId: 'a', width: 80, outside: 61 })).toThrow(
			/outside/,
		)
	})

	it('rejects external src, ready srcset/sizes and legacy fields', () => {
		expect(() =>
			parseWrapAroundProps({ images: [{ imageId: 'a', src: 'https://x/y.jpg' }] }),
		).toThrow()
		expect(() => parseWrapAroundProps({ images: [{ imageId: 'a', srcset: 'x 1x' }] })).toThrow()
		expect(() => parseWrapAroundProps({ images: [{ imageId: 'a' }], sizes: '100vw' })).toThrow()
		expect(() => parseWrapAroundProps({ images: [{ imageId: 'a' }], alink: '/x/' })).toThrow()
		expect(() =>
			parseWrapAroundProps({ images: [{ imageId: 'a' }], csswidth: '50%' }),
		).toThrow()
		expect(() => parseWrapAroundProps({ images: [{ imageId: 'a' }], rsjs: true })).toThrow()
	})

	it('rejects an arbitrary className on the block or an image', () => {
		expect(() =>
			parseWrapAroundProps({ images: [{ imageId: 'a' }], className: 'fancy' }),
		).toThrow()
		expect(() => parseWrapAroundProps({ images: [{ imageId: 'a', className: 'x' }] })).toThrow()
	})

	it('accepts alt="" and caption=false overrides', () => {
		const props = parseWrapAroundProps({ images: [{ imageId: 'a', alt: '', caption: false }] })
		expect(props.images[0]).toMatchObject({ alt: '', caption: false })
	})
})
