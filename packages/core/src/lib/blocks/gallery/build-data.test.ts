import { describe, expect, it } from 'vitest'

import { resolveGallery } from './build-data.ts'
import { parseGalleryProps } from './schema.ts'
import { galleryContext } from './test-fixtures.ts'

const ids = (candidates: { imageId: string }[]): string[] => candidates.map((c) => c.imageId)

describe('resolveGallery — static', () => {
	it('preserves the requested symmetric outside breakout in the view model', () => {
		const vm = resolveGallery(
			parseGalleryProps({ albumId: 'al-a', outside: 20 }),
			galleryContext(),
		)
		expect(vm.outside).toBe(20)
	})

	it('renders a full album pool in canonical order, no template candidates', () => {
		const vm = resolveGallery(parseGalleryProps({ albumId: 'al-a' }), galleryContext())
		expect(vm.dynamic).toBe(false)
		expect(ids(vm.active)).toEqual(['p-land', 'p-square'])
		expect(vm.candidates).toEqual([])
		expect(vm.active[0]!.model.width).toBe(800)
	})

	it('applies image-set order + priority to the full static pool', () => {
		const vm = resolveGallery(
			parseGalleryProps({ imageSetId: 'set-main', layout: 'square' }),
			galleryContext(),
		)
		// pool source order [p-land, p-square, p-tall, p-land2]; favorites-first -> [p-tall,p-land2,p-land,p-square];
		// priority [p-tall] already on top.
		expect(ids(vm.active)).toEqual(['p-tall', 'p-land2', 'p-land', 'p-square'])
		expect(vm.candidates).toEqual([])
	})
})

describe('resolveGallery — dynamic', () => {
	it('keeps the full pool as template candidates and a canonical first-N noscript slice', () => {
		const vm = resolveGallery(
			parseGalleryProps({ imageSetId: 'set-main', layout: 'square', randomCount: 3 }),
			galleryContext(),
		)
		expect(vm.dynamic).toBe(true)
		expect(ids(vm.candidates)).toEqual(['p-land', 'p-square', 'p-tall', 'p-land2'])
		// noscript = order+priority then first 3
		expect(ids(vm.active)).toEqual(['p-tall', 'p-land2', 'p-land'])
		expect(vm.order).toBe('favorites-first')
		expect(vm.priorityPhotoIds).toEqual(['p-tall'])
	})

	it('filters a dynamic rect gallery to width/height >= 4/3 before the pool check', () => {
		const vm = resolveGallery(
			parseGalleryProps({ imageSetId: 'set-main', layout: 'rect', randomCount: 2 }),
			galleryContext(),
		)
		// p-square (1.0) and p-tall (0.667) dropped; landscapes remain
		expect(ids(vm.candidates)).toEqual(['p-land', 'p-land2'])
	})

	it('errors when the permanent pool is smaller than randomCount', () => {
		expect(() =>
			resolveGallery(
				parseGalleryProps({ imageSetId: 'set-main', layout: 'rect', randomCount: 3 }),
				galleryContext(),
			),
		).toThrow(/pool has 2 images after permanent filters but randomCount=3/)
	})

	it('reports ignored lower sources but keeps the top source', () => {
		const vm = resolveGallery(
			parseGalleryProps({
				imageSetId: 'set-main',
				albumId: 'al-a',
				layout: 'square',
				randomCount: 2,
			}),
			galleryContext(),
		)
		expect(vm.ignoredSources).toEqual(['album'])
	})
})

describe('resolveGallery — overrides, focal point and captions', () => {
	it('applies explicit image overrides (alt="", caption=false, action, focalPoint)', () => {
		const vm = resolveGallery(
			parseGalleryProps({
				images: [
					{
						imageId: 'p-tall',
						alt: '',
						caption: false,
						action: { type: 'album', albumId: 'al-a' },
						focalPoint: { x: 10, y: 20 },
					},
					'p-square',
				],
			}),
			galleryContext(),
		)
		const tall = vm.active[0]!
		expect(tall.model.alt).toBe('')
		expect(tall.caption).toBeUndefined()
		expect(tall.focalPoint).toEqual({ x: 10, y: 20 })
		expect(tall.action.kind).toBe('link')
		if (tall.action.kind === 'link') {
			expect(tall.action.href).toContain('/al-a/')
			// decorative image still gets an accessible name from the catalog
			expect(tall.action.label).toBeTruthy()
		}

		const square = vm.active[1]!
		expect(square.caption).toBe('Square caption')
		expect(square.action.kind).toBe('lightbox')
	})

	it('reads focal point from the catalog for album/set sources and defaults to centre', () => {
		const vm = resolveGallery(parseGalleryProps({ albumId: 'al-b' }), galleryContext())
		const byId = new Map(vm.active.map((c) => [c.imageId, c]))
		expect(byId.get('p-tall')!.focalPoint).toEqual({ x: 42.5, y: 30 })
		expect(byId.get('p-square')!.focalPoint).toEqual({ x: 50, y: 50 })
	})
})

describe('resolveGallery — actions and lightbox', () => {
	it('builds lightbox pswp payload with the resolved caption when enabled', () => {
		const vm = resolveGallery(parseGalleryProps({ images: ['p-square'] }), galleryContext())
		const action = vm.active[0]!.action
		expect(action.kind).toBe('lightbox')
		if (action.kind === 'lightbox') {
			expect(action.pswp.width).toBe(1000)
			expect(action.pswp.caption).toBe('Square caption')
			expect(action.pswp.srcset).toContain('1000w')
		}
		expect(vm.hasLightbox).toBe(true)
	})

	it('resolves a single-album photo action and errors on ambiguous / orphan photos', () => {
		const single = resolveGallery(
			parseGalleryProps({ images: [{ imageId: 'p-land', action: 'photo' }] }),
			galleryContext(),
		)
		if (single.active[0]!.action.kind === 'link') {
			expect(single.active[0]!.action.href).toContain('/al-a/p-land/')
		}
		expect(() =>
			resolveGallery(
				parseGalleryProps({ images: [{ imageId: 'p-square', action: 'photo' }] }),
				galleryContext(),
			),
		).toThrow(/ambiguous/)
		expect(() =>
			resolveGallery(
				parseGalleryProps({ images: [{ imageId: 'p-orphan', action: 'photo' }] }),
				galleryContext(),
			),
		).toThrow(/no routable/)
	})

	it('errors on an unsafe custom link and an unpublished album target', () => {
		expect(() =>
			resolveGallery(
				parseGalleryProps({
					images: [
						{
							imageId: 'p-land',
							action: { type: 'custom', href: 'javascript:alert(1)' },
						},
					],
				}),
				galleryContext(),
			),
		).toThrow(/not an allowed link/)
		expect(() =>
			resolveGallery(
				parseGalleryProps({
					images: [
						{ imageId: 'p-land', action: { type: 'album', albumId: 'al-orphan' } },
					],
				}),
				galleryContext(),
			),
		).toThrow(/not a published album/)
	})

	it('marks action=none non-interactive and excludes it from the lightbox group', () => {
		const vm = resolveGallery(
			parseGalleryProps({ albumId: 'al-a', action: 'none' }),
			galleryContext(),
		)
		expect(vm.active.every((c) => c.action.kind === 'none')).toBe(true)
		expect(vm.hasLightbox).toBe(false)
	})
})

describe('resolveGallery — embeddability, animation and tokens', () => {
	it('errors when an explicit image is a draft (non-embeddable)', () => {
		expect(() =>
			resolveGallery(parseGalleryProps({ images: ['p-draft'] }), galleryContext()),
		).toThrow(/not a published, embeddable managed photo/)
	})

	it('errors when an image set references a non-embeddable direct photo', () => {
		const ctx = galleryContext({ imageSets: { bad: { photoIds: ['p-draft'] } } })
		expect(() => resolveGallery(parseGalleryProps({ imageSetId: 'bad' }), ctx)).toThrow(
			/non-embeddable photoId "p-draft"/,
		)
	})

	it('derives lightbox animation from layout and maps gap/frame tokens to px', () => {
		expect(
			resolveGallery(parseGalleryProps({ albumId: 'al-a' }), galleryContext()).animation,
		).toBe('fade')
		expect(
			resolveGallery(
				parseGalleryProps({ albumId: 'al-a', layout: 'justified' }),
				galleryContext(),
			).animation,
		).toBe('zoom')
		const vm = resolveGallery(
			parseGalleryProps({ albumId: 'al-a', gap: 'large', frame: 'thick' }),
			galleryContext(),
		)
		expect(vm.gap).toBe('large')
		expect(vm).not.toHaveProperty('gapPx')
		expect(vm.framePx).toBe(5)
	})
})
