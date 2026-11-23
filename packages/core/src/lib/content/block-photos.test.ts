import { describe, expect, it } from 'vitest'

import type { GallerySourceContext } from '../blocks/gallery/source.ts'
import { extractBlockPhotoIds } from './block-photos.ts'

const ctx: GallerySourceContext = {
	imageSets: { intro: { albumIds: ['al1'], photoIds: ['p-direct'] } },
	albumPhotoIds: new Map([
		['al1', ['p1', 'p2']],
		['al2', ['p3', 'p4']],
	]),
	knownPhotoIds: new Set(['p1', 'p2', 'p3', 'p4', 'p-direct', 'pa', 'pb']),
}

describe('extractBlockPhotoIds', () => {
	it('returns nothing for a body without blocks', () => {
		expect(extractBlockPhotoIds('# Title\n\nJust prose with <b>html</b>.\n', ctx)).toEqual([])
	})

	it('takes the imageId of every WrapAround, flow and inline', () => {
		const body = [
			'<WrapAround imageId="pa" position="right" width={70} outside={30} />',
			'',
			'Text <WrapAround imageId="pb" position="left" width={80} /> inline.',
		].join('\n')
		expect(extractBlockPhotoIds(body, ctx)).toEqual(['pa', 'pb'])
		const images = `<WrapAround images={[{ imageId: 'p3' }, { imageId: 'p4' }]} position="right" width={70} />`
		expect(extractBlockPhotoIds(images, ctx)).toEqual(['p3', 'p4'])
	})

	it('takes the whole pool of a Gallery, including a dynamic random one', () => {
		const body = '<Gallery imageSetId="intro" layout="rect" randomCount={1} frame="thick" />'
		expect(extractBlockPhotoIds(body, ctx)).toEqual(['p1', 'p2', 'p-direct'])
	})

	it('resolves album and explicit image sources with exclude', () => {
		const album = '<Gallery albumId="al2" exclude={["p4"]} />'
		expect(extractBlockPhotoIds(album, ctx)).toEqual(['p3'])
		const images = `<Gallery images={['pa', { imageId: 'pb', alt: '' }]} />`
		expect(extractBlockPhotoIds(images, ctx)).toEqual(['pa', 'pb'])
	})

	it('finds blocks nested in other content and deduplicates ids', () => {
		const body = [
			':::callout',
			'<WrapAround imageId="p1" position="right" width={70} />',
			':::',
			'',
			'- item',
			'',
			'  <Gallery albumId="al1" />',
		].join('\n')
		expect(extractBlockPhotoIds(body, ctx)).toEqual(['p1', 'p2'])
	})

	it('fails the build on a non-literal attribute instead of skipping the block', () => {
		expect(() => extractBlockPhotoIds('<WrapAround imageId={someVar} />', ctx)).toThrow(
			/must be a literal/,
		)
		expect(() => extractBlockPhotoIds('<Gallery {...props} />', ctx)).toThrow(/spread/)
	})

	it('surfaces block schema errors', () => {
		expect(() => extractBlockPhotoIds('<Gallery imageSetId="missing" />', ctx)).toThrow(
			/unknown imageSetId/,
		)
	})
})
