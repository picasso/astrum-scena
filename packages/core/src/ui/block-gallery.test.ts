// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
	BLOCK_GALLERY_CHILD_SELECTOR,
	blockGalleryChildSelector,
	blockGalleryRoot,
	groupBlockGalleries,
	groupShowHideAnimationType,
	mountBlockGalleries,
} from './block-gallery.ts'
import type { AlbumViewerConfig } from './photoswipe-island.ts'

// these tests cover the grouping scope, not the viewer, so real PhotoSwipe is not needed in jsdom
const initAlbumPhotoSwipe = vi.hoisted(() => vi.fn(() => ({ destroy: vi.fn() })))
vi.mock('./photoswipe-island.ts', () => ({ initAlbumPhotoSwipe }))

function gallery(groupId?: string, photos = 2, layout?: 'rect' | 'square' | 'justified'): string {
	const attribute = groupId === undefined ? '' : ` data-block-gallery-group="${groupId}"`
	const layoutAttribute = layout === undefined ? '' : ` data-gallery-layout="${layout}"`
	const anchors = Array.from(
		{ length: photos },
		(_, index) => `<a class="album-photo" href="/p/${index}/"></a>`,
	).join('')
	return `<div data-block-gallery${attribute}${layoutAttribute}>${anchors}</div>`
}

function roots(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>('[data-block-gallery]')]
}

beforeEach(() => {
	initAlbumPhotoSwipe.mockClear()
	document.body.innerHTML = ''
})

describe('groupBlockGalleries', () => {
	it('keeps a container without a group id in its own block group', () => {
		document.body.innerHTML = `<article>${gallery()}${gallery()}</article>`
		const groups = groupBlockGalleries(roots())
		expect(groups).toHaveLength(2)
		expect(groups.every((group) => group.scope === 'block')).toBe(true)
	})

	it('merges containers that share a page group id', () => {
		document.body.innerHTML = `<article>${gallery('doc')}${gallery('doc')}</article>`
		const [group, ...rest] = groupBlockGalleries(roots())
		expect(rest).toHaveLength(0)
		expect(group).toMatchObject({ scope: 'page', groupId: 'doc' })
		expect(group!.roots).toHaveLength(2)
	})

	it('keeps different page group ids apart', () => {
		document.body.innerHTML = `<article>${gallery('a')}${gallery('b')}${gallery('a')}</article>`
		const groups = groupBlockGalleries(roots())
		expect(groups.map((group) => group.groupId)).toEqual(['a', 'b'])
		expect(groups[0]!.roots).toHaveLength(2)
		expect(groups[1]!.roots).toHaveLength(1)
	})
})

describe('blockGalleryRoot', () => {
	it('is the container itself for a block group', () => {
		document.body.innerHTML = `<article>${gallery()}</article>`
		const [group] = groupBlockGalleries(roots())
		expect(blockGalleryRoot(group!)).toBe(roots()[0])
	})

	it('climbs to the ancestor that holds every container of a page group', () => {
		document.body.innerHTML = `<article><section>${gallery('doc')}</section><section>${gallery('doc')}</section></article>`
		const [group] = groupBlockGalleries(roots())
		expect(blockGalleryRoot(group!)).toBe(document.querySelector('article'))
	})
})

describe('mountBlockGalleries', () => {
	it('feeds one PhotoSwipe gallery with the photos of every container in a page group', () => {
		document.body.innerHTML = `<article><section>${gallery('doc')}</section><section>${gallery('doc')}</section></article>`
		mountBlockGalleries()

		expect(initAlbumPhotoSwipe).toHaveBeenCalledTimes(1)
		const [root, config] = initAlbumPhotoSwipe.mock.calls[0] as unknown as [
			HTMLElement,
			AlbumViewerConfig,
		]
		expect(root).toBe(document.querySelector('article'))
		expect(root.querySelectorAll(config.childSelector!)).toHaveLength(4)
		// chrome comes from the block container, since the shared ancestor has no data attributes
		expect(config.chromeSource).toBe(roots()[0])
	})

	it('mounts separate galleries for separate groups', () => {
		document.body.innerHTML = `<article>${gallery('a')}${gallery('b')}${gallery()}</article>`
		mountBlockGalleries()
		expect(initAlbumPhotoSwipe).toHaveBeenCalledTimes(3)
	})

	it('scopes a block group to its own container', () => {
		document.body.innerHTML = `<article>${gallery()}${gallery()}</article>`
		mountBlockGalleries()

		const [root, config] = initAlbumPhotoSwipe.mock.calls[0] as unknown as [
			HTMLElement,
			AlbumViewerConfig,
		]
		expect(config.childSelector).toBe(BLOCK_GALLERY_CHILD_SELECTOR)
		expect(root.querySelectorAll(config.childSelector!)).toHaveLength(2)
	})

	it('forces fade for a page group containing cropped previews', () => {
		document.body.innerHTML = `<article>${gallery('doc', 2, 'justified')}${gallery('doc', 2, 'square')}</article>`
		const [group] = groupBlockGalleries(roots())

		expect(groupShowHideAnimationType(group!)).toBe('fade')
		mountBlockGalleries()
		const [, config] = initAlbumPhotoSwipe.mock.calls[0] as unknown as [
			HTMLElement,
			AlbumViewerConfig,
		]
		expect(config.showHideAnimationType).toBe('fade')
	})

	it('keeps the site animation for a justified-only page group', () => {
		document.body.innerHTML = `<article>${gallery('doc', 2, 'justified')}${gallery('doc', 2, 'justified')}</article>`
		const [group] = groupBlockGalleries(roots())

		expect(groupShowHideAnimationType(group!)).toBeUndefined()
	})
})

describe('blockGalleryChildSelector', () => {
	it('narrows a page group to the containers carrying its id', () => {
		expect(blockGalleryChildSelector({ scope: 'page', groupId: 'doc-1', roots: [] })).toBe(
			`[data-block-gallery-group="doc-1"] ${BLOCK_GALLERY_CHILD_SELECTOR}`,
		)
	})
})
