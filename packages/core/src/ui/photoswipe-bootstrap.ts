import { mountBlockGalleries } from './block-gallery.ts'
import { type AlbumViewerHandle, mountAlbumViewers } from './photoswipe-island.ts'

// PhotoSwipe island lifecycle, loaded through `photoswipe-loader.astro`; each `astro:page-load`
// remounts so exactly one handle set is live, and `astro:before-swap` destroys it before the DOM
// swap; without JS the `a.album-photo` anchors stay links (the photo page in the portfolio, possibly
// the image file in content blocks)

let handles: AlbumViewerHandle[] = []

function teardown(): void {
	for (const handle of handles) handle.destroy()
	handles = []
}

// exported for the gallery coordinator, whose dynamic anchors appear only after it fills the live
// DOM; a full teardown and remount makes the coordinator call and the page-load listener converge
// on one handle set in either order
export function mount(): void {
	teardown()
	// album grids, the single photo (legacy `aclick=lightbox`) and content blocks share the
	// `a.album-photo` + `data-pswp-*` contract; blocks only add their own grouping scope
	handles = [
		...mountAlbumViewers('.album-grid'),
		...mountAlbumViewers('.photo__viewer'),
		...mountBlockGalleries(),
	]
}

// mounting on import covers the current DOM wherever the loader sits in the component tree; Astro
// events cover later navigations
mount()
document.addEventListener('astro:page-load', mount)
document.addEventListener('astro:before-swap', teardown)
