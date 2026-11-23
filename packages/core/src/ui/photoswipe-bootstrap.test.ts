// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

const destroy = vi.hoisted(() => vi.fn())
const mountAlbumViewers = vi.hoisted(() => vi.fn(() => [{ destroy }]))
const mountBlockGalleries = vi.hoisted(() => vi.fn(() => [{ destroy }]))

vi.mock('./photoswipe-island.ts', () => ({ mountAlbumViewers }))
vi.mock('./block-gallery.ts', () => ({ mountBlockGalleries }))

await import('./photoswipe-bootstrap.ts')

describe('PhotoSwipe bootstrap lifecycle', () => {
	it('mounts immediately, remounts on page-load and tears down before swap', () => {
		// initial module evaluation: two portfolio surfaces and one block-gallery pass.
		expect(mountAlbumViewers).toHaveBeenNthCalledWith(1, '.album-grid')
		expect(mountAlbumViewers).toHaveBeenNthCalledWith(2, '.photo__viewer')
		expect(mountBlockGalleries).toHaveBeenCalledTimes(1)

		document.dispatchEvent(new Event('astro:page-load'))
		expect(destroy).toHaveBeenCalledTimes(3)
		expect(mountAlbumViewers).toHaveBeenCalledTimes(4)
		expect(mountBlockGalleries).toHaveBeenCalledTimes(2)

		document.dispatchEvent(new Event('astro:before-swap'))
		expect(destroy).toHaveBeenCalledTimes(6)
	})
})
