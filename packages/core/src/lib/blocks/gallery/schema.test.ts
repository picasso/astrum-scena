import { describe, expect, it } from 'vitest'

import { parseGalleryProps } from './schema.ts'

describe('parseGalleryProps', () => {
	it('applies contract defaults on a minimal source', () => {
		const props = parseGalleryProps({ imageSetId: 'about-intro' })
		expect(props).toMatchObject({
			layout: 'rect',
			columns: 3,
			outside: 0,
			mobileFirstOnly: true,
			gap: 'small',
			frame: 'thin',
			frameColor: 'default',
			action: 'lightbox',
			inlineCaption: false,
			lightboxCaption: true,
			lightboxScope: 'page',
			exclude: [],
		})
		expect(props.randomCount).toBeUndefined()
	})

	it('normalizes a string image shorthand to an overrides object', () => {
		const props = parseGalleryProps({ images: ['still-symmetry'] })
		expect(props.images).toEqual([{ imageId: 'still-symmetry' }])
	})

	it('accepts object overrides including alt="", caption=false and focalPoint', () => {
		const props = parseGalleryProps({
			images: [
				{ imageId: 'a', alt: '', caption: false, focalPoint: { x: 42.5, y: 30 } },
				{ imageId: 'b', action: { type: 'album', albumId: 'northland' } },
			],
		})
		expect(props.images?.[0]).toMatchObject({
			alt: '',
			caption: false,
			focalPoint: { x: 42.5, y: 30 },
		})
	})

	it('accepts every layout, gap, frame and action union member', () => {
		for (const layout of ['rect', 'square', 'justified'] as const) {
			expect(parseGalleryProps({ albumId: 'northland', layout }).layout).toBe(layout)
		}
		for (const gap of ['none', 'tiny', 'small', 'medium', 'large'] as const) {
			expect(parseGalleryProps({ albumId: 'northland', gap }).gap).toBe(gap)
		}
		for (const frame of ['none', 'thin', 'medium', 'thick'] as const) {
			expect(parseGalleryProps({ albumId: 'northland', frame }).frame).toBe(frame)
		}
		for (const action of [
			'none',
			'lightbox',
			'photo',
			{ type: 'album', albumId: 'northland' },
			{ type: 'custom', href: '/x/', newTab: true },
		] as const) {
			expect(() => parseGalleryProps({ albumId: 'northland', action })).not.toThrow()
		}
	})

	it('requires at least one source', () => {
		expect(() => parseGalleryProps({ layout: 'square' })).toThrow(
			/at least one of imageSetId, albumId or images/,
		)
	})

	it('allows several valid sources (priority + diagnostics belong to the resolver)', () => {
		expect(() =>
			parseGalleryProps({ imageSetId: 'about-intro', albumId: 'northland', images: ['a'] }),
		).not.toThrow()
	})

	it('rejects an empty explicit images list', () => {
		expect(() => parseGalleryProps({ images: [] })).toThrow(/images/)
	})

	it('rejects duplicate imageIds in an explicit images list', () => {
		expect(() => parseGalleryProps({ images: ['a', { imageId: 'a' }] })).toThrow(/repeat/)
	})

	it('rejects duplicate IDs in exclude', () => {
		expect(() => parseGalleryProps({ albumId: 'northland', exclude: ['a', 'a'] })).toThrow(
			/exclude/,
		)
	})

	it('rejects columns out of the 1..5 range and non-integers', () => {
		expect(() => parseGalleryProps({ albumId: 'northland', columns: 0 })).toThrow(/columns/)
		expect(() => parseGalleryProps({ albumId: 'northland', columns: 6 })).toThrow(/columns/)
		expect(() => parseGalleryProps({ albumId: 'northland', columns: 3.5 })).toThrow(/columns/)
	})

	it('accepts a symmetric outside breakout and rejects fractional or out-of-range values', () => {
		expect(parseGalleryProps({ albumId: 'northland', outside: 20 }).outside).toBe(20)
		expect(() => parseGalleryProps({ albumId: 'northland', outside: 20.5 })).toThrow(/outside/)
		expect(() => parseGalleryProps({ albumId: 'northland', outside: -1 })).toThrow(/outside/)
		expect(() => parseGalleryProps({ albumId: 'northland', outside: 61 })).toThrow(/outside/)
	})

	it('rejects a non-positive or fractional randomCount', () => {
		expect(() => parseGalleryProps({ albumId: 'northland', randomCount: 0 })).toThrow(
			/randomCount/,
		)
		expect(() => parseGalleryProps({ albumId: 'northland', randomCount: -2 })).toThrow(
			/randomCount/,
		)
		expect(() => parseGalleryProps({ albumId: 'northland', randomCount: 2.5 })).toThrow(
			/randomCount/,
		)
	})

	it('rejects focal point coordinates outside 0..100 or non-finite', () => {
		expect(() =>
			parseGalleryProps({ images: [{ imageId: 'a', focalPoint: { x: -1, y: 0 } }] }),
		).toThrow(/focalPoint/)
		expect(() =>
			parseGalleryProps({ images: [{ imageId: 'a', focalPoint: { x: 0, y: 100.5 } }] }),
		).toThrow(/focalPoint/)
		expect(() =>
			parseGalleryProps({ images: [{ imageId: 'a', focalPoint: { x: 0, y: Infinity } }] }),
		).toThrow(/focalPoint/)
	})

	it('rejects unknown enum values and unknown props via .strict()', () => {
		expect(() => parseGalleryProps({ albumId: 'northland', layout: 'masonry' })).toThrow(
			/layout/,
		)
		expect(() => parseGalleryProps({ albumId: 'northland', gap: 'huge' })).toThrow(/gap/)
		expect(() => parseGalleryProps({ albumId: 'northland', className: 'fancy' })).toThrow()
		expect(() => parseGalleryProps({ albumId: 'northland', adaptive: true })).toThrow()
		expect(() =>
			parseGalleryProps({ images: [{ imageId: 'a', src: 'https://x/y.jpg' }] }),
		).toThrow()
	})
})
