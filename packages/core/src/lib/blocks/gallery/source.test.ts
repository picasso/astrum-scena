import { describe, expect, it } from 'vitest'

import { parseGalleryProps } from './schema.ts'
import { type GallerySourceContext, resolveGallerySource } from './source.ts'

function context(overrides: Partial<GallerySourceContext> = {}): GallerySourceContext {
	return {
		imageSets: {
			'set-a': {
				albumIds: ['al1'],
				photoIds: ['p-direct', 'p1'],
				priorityPhotoIds: ['p1'],
				order: 'favorites-first',
			},
		},
		albumPhotoIds: new Map([
			['al1', ['p1', 'p2']],
			['al2', ['p2', 'p3']],
		]),
		knownPhotoIds: new Set(['p1', 'p2', 'p3', 'p-direct', 'pa', 'pb', 'pX']),
		...overrides,
	}
}

describe('resolveGallerySource', () => {
	it('follows strict priority imageSetId > albumId > images and reports ignored lower sources', () => {
		const props = parseGalleryProps({ imageSetId: 'set-a', albumId: 'al1', images: ['pa'] })
		const result = resolveGallerySource(props, context())
		expect(result.kind).toBe('imageSet')
		expect(result.ignoredSources).toEqual(['album', 'images'])
	})

	it('expands albums then direct photos, dedup by first occurrence, carrying order + priority', () => {
		const props = parseGalleryProps({ imageSetId: 'set-a' })
		const result = resolveGallerySource(props, context())
		// al1 -> p1,p2 ; then direct p-direct, p1(dup skip)
		expect(result.poolIds).toEqual(['p1', 'p2', 'p-direct'])
		expect(result.order).toBe('favorites-first')
		expect(result.priorityPhotoIds).toEqual(['p1'])
	})

	it('dedups a photo shared across two albums keeping the first occurrence', () => {
		const ctx = context({
			imageSets: { multi: { albumIds: ['al1', 'al2'] } },
		})
		const result = resolveGallerySource(parseGalleryProps({ imageSetId: 'multi' }), ctx)
		expect(result.poolIds).toEqual(['p1', 'p2', 'p3'])
	})

	it('uses album canonical order with source ordering and no priority for an album source', () => {
		const result = resolveGallerySource(parseGalleryProps({ albumId: 'al1' }), context())
		expect(result).toMatchObject({
			kind: 'album',
			poolIds: ['p1', 'p2'],
			order: 'source',
			priorityPhotoIds: [],
		})
	})

	it('uses the explicit author order for an images source', () => {
		const result = resolveGallerySource(parseGalleryProps({ images: ['pb', 'pa'] }), context())
		expect(result).toMatchObject({ kind: 'images', poolIds: ['pb', 'pa'] })
	})

	it('applies exclude before any layout filter or random, across all sources', () => {
		const result = resolveGallerySource(
			parseGalleryProps({ imageSetId: 'set-a', exclude: ['p2'] }),
			context(),
		)
		expect(result.poolIds).toEqual(['p1', 'p-direct'])
	})

	it('errors on an unknown top-level imageSetId or albumId (no silent fallback)', () => {
		expect(() =>
			resolveGallerySource(parseGalleryProps({ imageSetId: 'nope' }), context()),
		).toThrow(/unknown imageSetId/)
		expect(() =>
			resolveGallerySource(parseGalleryProps({ albumId: 'nope' }), context()),
		).toThrow(/unknown or unpublished albumId/)
	})

	it('errors on an unknown exclude ID even when absent from the pool', () => {
		expect(() =>
			resolveGallerySource(
				parseGalleryProps({ albumId: 'al1', exclude: ['ghost'] }),
				context(),
			),
		).toThrow(/unknown exclude ID/)
	})

	it('errors when priorityPhotoIds is not present in the expanded pool', () => {
		const ctx = context({ imageSets: { bad: { photoIds: ['p1'], priorityPhotoIds: ['pX'] } } })
		expect(() => resolveGallerySource(parseGalleryProps({ imageSetId: 'bad' }), ctx)).toThrow(
			/priorityPhotoIds "pX" is not in the expanded pool/,
		)
	})

	it('errors on a non-embeddable direct photo in an image set', () => {
		const ctx = context({ imageSets: { bad: { photoIds: ['draft-photo'] } } })
		expect(() => resolveGallerySource(parseGalleryProps({ imageSetId: 'bad' }), ctx)).toThrow(
			/non-embeddable photoId "draft-photo"/,
		)
	})
})
