import { isMobileContainer, resolveGalleryJustified } from '../lib/blocks/gallery/geometry.ts'
import type { ImageSetOrder } from '../lib/blocks/gallery/image-sets.ts'
import type { GalleryOrderItem } from '../lib/blocks/gallery/order.ts'
import { orderGalleryItems } from '../lib/blocks/gallery/order.ts'
import { defaultRandomSource, sampleWithoutReplacement } from '../lib/blocks/gallery/random.ts'
import { mount as mountPhotoSwipeViewers } from './photoswipe-bootstrap.ts'

// client coordinator for content galleries (docs/blocks/gallery.md, dynamic random and lazy loading
// sections); on each `astro:page-load`, in DOM order, a dynamic gallery samples from its inert
// `<template>` per page view (no seed, no persistence), applies order and priority to the sample,
// keeps cross-gallery dedup best-effort, and only then moves the figures into the live DOM, which
// is what starts lazy loading; a justified gallery of any mode derives its row height from the real
// width and recomputes on resize; mobileFirstOnly tiles past the first are hidden by CSS, and
// dynamic galleries also keep them in an inert template until a desktop resize
//
// ordering against the PhotoSwipe island does not matter: after populating the live DOM the
// coordinator calls the idempotent bootstrap `mount()` itself, so dynamic `a.album-photo` anchors
// reach the lightbox whichever page-load listener ran first

export type CandidateItem = GalleryOrderItem & { element: HTMLElement }

const resizeObservers = new Set<ResizeObserver>()

function readCandidate(figure: HTMLElement): CandidateItem {
	const { imageId = '', favorite, publishedAt, capturedAt } = figure.dataset
	return {
		imageId,
		favorite: favorite === 'true',
		publishedAt: publishedAt || undefined,
		capturedAt: capturedAt || undefined,
		element: figure,
	}
}

// prefers photos not yet shown on the page and tops up from ones shown in other galleries, never
// repeating within the block; `exclude` is hard because the build already left excluded photos out
// of the template
export function sampleWithDedup<T extends { imageId: string }>(
	candidates: readonly T[],
	count: number,
	usedIds: ReadonlySet<string>,
	random: () => number,
): T[] {
	const fresh = candidates.filter((candidate) => !usedIds.has(candidate.imageId))
	if (fresh.length >= count) return sampleWithoutReplacement(fresh, count, random)
	const reused = candidates.filter((candidate) => usedIds.has(candidate.imageId))
	return [...fresh, ...sampleWithoutReplacement(reused, count - fresh.length, random)]
}

function usesMobileFirstOnly(gallery: HTMLElement): boolean {
	return (
		gallery.hasAttribute('data-gallery-mobile-first-only') &&
		gallery.clientWidth > 0 &&
		isMobileContainer(gallery.clientWidth)
	)
}

function materializeDeferred(gallery: HTMLElement): void {
	const deferred = gallery.querySelector<HTMLTemplateElement>('template[data-gallery-deferred]')
	const live = gallery.querySelector<HTMLElement>('[data-gallery-live]')
	if (!deferred || !live) return
	live.append(deferred.content)
	deferred.remove()
	if (gallery.dataset.galleryLayout === 'justified') applyJustifiedGeometry(gallery)
}

function populateDynamic(gallery: HTMLElement, usedIds: Set<string>, random: () => number): void {
	const template = gallery.querySelector<HTMLTemplateElement>('template[data-gallery-candidates]')
	const live = gallery.querySelector<HTMLElement>('[data-gallery-live]')
	if (!template || !live) return

	const candidates = [...template.content.querySelectorAll<HTMLElement>('.gallery__item')].map(
		readCandidate,
	)
	const count = Number(gallery.dataset.galleryRandomCount ?? 0)
	if (!(count > 0) || candidates.length === 0) return

	const sampled = sampleWithDedup(candidates, count, usedIds, random)
	for (const item of sampled) usedIds.add(item.imageId)

	// priority applies after sampling, so it never changes the odds of being picked
	const order = (gallery.dataset.galleryOrder as ImageSetOrder | undefined) ?? 'source'
	const priority = gallery.dataset.galleryPriority?.split(' ').filter(Boolean) ?? []
	const ordered = orderGalleryItems(sampled, order, priority)

	// images get a working src only once in the live DOM; with mobileFirstOnly the rest stay inert
	// until a desktop resize
	const elements = ordered.map((item) => item.element.cloneNode(true))
	if (usesMobileFirstOnly(gallery)) {
		const [first, ...deferredElements] = elements
		live.replaceChildren(first ?? '')
		if (deferredElements.length > 0) {
			const deferred = document.createElement('template')
			deferred.dataset.galleryDeferred = ''
			for (const element of deferredElements) deferred.content.append(element)
			live.after(deferred)
		}
	} else {
		live.replaceChildren(...elements)
	}

	// the height reserve only kept the empty gallery from collapsing; the real content sets the
	// height now, and keeping the estimate would leave a gap when it is off
	gallery.style.setProperty('--gallery-reserve-rows', '0')
}

// fades in on image load, not on insertion; the CSS transition is gated on `scripting: enabled`, so
// without JS images are visible by default
function markLoaded(image: HTMLImageElement): void {
	image.classList.add('gallery__img--loaded')
}

function setupFadeIn(): void {
	for (const image of document.querySelectorAll<HTMLImageElement>(
		'[data-gallery] .gallery__img',
	)) {
		if (image.complete) markLoaded(image)
		else image.addEventListener('load', () => markLoaded(image), { once: true })
	}
}

function activeGrid(gallery: HTMLElement): HTMLElement | null {
	return gallery.hasAttribute('data-gallery-dynamic')
		? gallery.querySelector<HTMLElement>('[data-gallery-live]')
		: gallery.querySelector<HTMLElement>('.gallery__grid')
}

function clearJustifiedRows(grid: HTMLElement, items: HTMLElement[]): void {
	if (!grid.classList.contains('gallery__grid--justified-ready')) return
	grid.replaceChildren(...items)
	grid.classList.remove('gallery__grid--justified-ready')
	delete grid.dataset.galleryJustifiedRows
}

function applyJustifiedRows(
	grid: HTMLElement,
	rows: ReturnType<typeof resolveGalleryJustified>,
	byId: ReadonlyMap<string, HTMLElement>,
): void {
	const signature = rows.map((row) => row.cells.map((cell) => cell.id).join(',')).join('/')
	if (grid.dataset.galleryJustifiedRows === signature) return

	const fragment = document.createDocumentFragment()
	for (const row of rows) {
		const element = document.createElement('div')
		element.className = 'gallery__row'
		for (const cell of row.cells) {
			const figure = byId.get(cell.id)
			if (figure) element.append(figure)
		}
		fragment.append(element)
	}
	grid.replaceChildren(fragment)
	grid.dataset.galleryJustifiedRows = signature
}

// the pure row-packer resolves the actual container width, gap, frame, column cap, and chosen set into
// exact cell dimensions and materialized rows. Aspect-based flex-grow alone is not enough: a varied
// set would otherwise wrap unpredictably. Separate nowrap rows prevent old flex dimensions from moving
// the final cell between rows before the next resize pass.
function applyJustifiedGeometry(gallery: HTMLElement): void {
	const grid = activeGrid(gallery)
	if (!grid) return
	const width = gallery.clientWidth
	if (!(width > 0)) return

	const items = [...grid.querySelectorAll<HTMLElement>('.gallery__item')].map((figure) => ({
		id: figure.dataset.imageId ?? '',
		width: Number(figure.dataset.aspectWidth ?? 1),
		height: Number(figure.dataset.aspectHeight ?? 1),
		figure,
	}))
	if (items.length === 0) return
	// the CSS `::after` spacer is only for the no-JS fallback. Once the coordinator has exact geometry,
	// it competes with the final cell during resize, so disable it after the first successful measurement.
	grid.classList.add('gallery__grid--justified-ready')

	const columns = Number(gallery.dataset.galleryColumns ?? 1)
	const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0
	const frame = Number(gallery.dataset.galleryFrame ?? 0)
	if (gallery.hasAttribute('data-gallery-mobile-first-only') && isMobileContainer(width)) {
		clearJustifiedRows(
			grid,
			items.map((item) => item.figure),
		)
		// mobile CSS keeps and stretches only the first item. Clear desktop inline geometry before it applies.
		for (const item of items) {
			item.figure.style.flex = ''
			item.figure.style.height = ''
		}
		return
	}
	const rows = resolveGalleryJustified(items, width, { columns, gap, frame })
	const byId = new Map(items.map((item) => [item.id, item.figure]))

	for (const row of rows) {
		for (const cell of row.cells) {
			const figure = byId.get(cell.id)
			if (!figure) continue
			figure.style.flex = `0 0 ${cell.width}px`
			figure.style.height = `${cell.height}px`
		}
	}
	applyJustifiedRows(grid, rows, byId)
}

function setupJustified(gallery: HTMLElement): void {
	applyJustifiedGeometry(gallery)
	if (typeof ResizeObserver === 'undefined') return
	// ResizeObserver runs before paint. Deferring to requestAnimationFrame lets flex paint old inline
	// dimensions for one frame. Only descendants change, so this synchronous pass cannot resize the
	// observed Gallery or form an observer loop.
	const observer = new ResizeObserver(() => {
		applyJustifiedGeometry(gallery)
	})
	observer.observe(gallery)
	resizeObservers.add(observer)
}

function setupMobileFirst(gallery: HTMLElement): void {
	if (typeof ResizeObserver === 'undefined') return
	let frame = 0
	const observer = new ResizeObserver(() => {
		if (frame) return
		frame = requestAnimationFrame(() => {
			frame = 0
			if (!usesMobileFirstOnly(gallery)) materializeDeferred(gallery)
		})
	})
	observer.observe(gallery)
	resizeObservers.add(observer)
}

function coordinate(): void {
	const random = defaultRandomSource()
	// dedup spans the galleries of the current page view, in DOM order
	const usedIds = new Set<string>()
	let populatedDynamic = false
	for (const gallery of document.querySelectorAll<HTMLElement>('[data-gallery]')) {
		if (gallery.dataset.galleryReady !== undefined) continue
		gallery.dataset.galleryReady = ''
		if (gallery.hasAttribute('data-gallery-dynamic')) {
			populateDynamic(gallery, usedIds, random)
			populatedDynamic = true
		}
		if (gallery.dataset.galleryLayout === 'justified') {
			setupJustified(gallery)
		}
		if (
			gallery.hasAttribute('data-gallery-dynamic') &&
			gallery.hasAttribute('data-gallery-mobile-first-only')
		) {
			setupMobileFirst(gallery)
		}
	}
	// dynamic anchors reached the live DOM only now; static galleries were already mounted by the
	// bootstrap's own page-load listener
	if (populatedDynamic) mountPhotoSwipeViewers()

	setupFadeIn()
}

function teardown(): void {
	for (const observer of resizeObservers) observer.disconnect()
	resizeObservers.clear()
}

document.addEventListener('astro:page-load', coordinate)
document.addEventListener('astro:before-swap', teardown)
