import {
	type AlbumViewerConfig,
	type AlbumViewerHandle,
	initAlbumPhotoSwipe,
} from './photoswipe-island.ts'

// content-block lightbox on top of the existing PhotoSwipe island: no viewer logic of its own, only
// the grouping scope
//
// `scope='block'` is a group within one container, exactly what `initAlbumPhotoSwipe` does per
// root. `scope='page'` is ONE group across several blocks of the page: the renderer gives the
// containers a shared deterministic group id, and the adapter takes their common ancestor as the
// gallery root and narrows the children with a group selector, so PhotoSwipe sees photos of
// different blocks as one slide list rather than several galleries
//
// child anchors and their `data-pswp-*` follow the album grid contract (`a.album-photo`), so viewer
// data and progressive enhancement of blocks are the same as in the portfolio

export const BLOCK_GALLERY_SELECTOR = '[data-block-gallery]'
export const BLOCK_GALLERY_CHILD_SELECTOR = 'a.album-photo'
export const BLOCK_GALLERY_GROUP_ATTRIBUTE = 'data-block-gallery-group'

export type BlockGalleryGroup = {
	scope: 'block' | 'page'
	groupId: string | null
	roots: HTMLElement[]
}

function escapeAttributeValue(value: string): string {
	return typeof CSS?.escape === 'function' ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&')
}

// containers sharing a non-empty group id merge into one page group; a container without an id
// stays its own block group; groups and their containers keep document order
export function groupBlockGalleries(roots: readonly HTMLElement[]): BlockGalleryGroup[] {
	const groups: BlockGalleryGroup[] = []
	const byGroupId = new Map<string, BlockGalleryGroup>()

	for (const root of roots) {
		const groupId = root.getAttribute(BLOCK_GALLERY_GROUP_ATTRIBUTE)?.trim()
		if (!groupId) {
			groups.push({ scope: 'block', groupId: null, roots: [root] })
			continue
		}
		const existing = byGroupId.get(groupId)
		if (existing) {
			existing.roots.push(root)
			continue
		}
		const group: BlockGalleryGroup = { scope: 'page', groupId, roots: [root] }
		byGroupId.set(groupId, group)
		groups.push(group)
	}

	return groups
}

// the common ancestor of the group's containers is the PhotoSwipe gallery root; for one container,
// the container itself
export function blockGalleryRoot(group: BlockGalleryGroup): HTMLElement | null {
	const [first, ...rest] = group.roots
	if (!first) return null
	let candidate: HTMLElement | null = first
	while (candidate && !rest.every((root) => candidate!.contains(root))) {
		candidate = candidate.parentElement
	}
	return candidate
}

export function blockGalleryChildSelector(group: BlockGalleryGroup): string {
	if (group.scope === 'block' || !group.groupId) return BLOCK_GALLERY_CHILD_SELECTOR
	const value = escapeAttributeValue(group.groupId)
	return `[${BLOCK_GALLERY_GROUP_ATTRIBUTE}="${value}"] ${BLOCK_GALLERY_CHILD_SELECTOR}`
}

// PhotoSwipe opens a whole page group with one instance and one open animation; zooming from a
// cropped preview into the natural slide visibly jumps, so any cropped block downgrades the whole
// group to fade, while a justified-only group keeps the site default
export function groupShowHideAnimationType(
	group: BlockGalleryGroup,
): AlbumViewerConfig['showHideAnimationType'] | undefined {
	return group.roots.some(
		(root) => root.dataset.galleryLayout === 'rect' || root.dataset.galleryLayout === 'square',
	)
		? 'fade'
		: undefined
}

export function mountBlockGalleries(selector = BLOCK_GALLERY_SELECTOR): AlbumViewerHandle[] {
	const roots = [...document.querySelectorAll<HTMLElement>(selector)]
	const handles: AlbumViewerHandle[] = []

	for (const group of groupBlockGalleries(roots)) {
		const root = blockGalleryRoot(group)
		if (!root) continue
		const handle = initAlbumPhotoSwipe(root, {
			childSelector: blockGalleryChildSelector(group),
			chromeSource: group.roots[0],
			showHideAnimationType: groupShowHideAnimationType(group),
		})
		if (handle) handles.push(handle)
	}

	return handles
}
