import type { ImageSetOrder } from './image-sets.ts'

// pure ordering (docs/blocks/gallery.md) runs at build on a static pool and in the browser on a
// dynamic sample, so the `ImageSetOrder` import stays type-only; only image sets carry `order` and
// `priorityPhotoIds`, albums and explicit images arrive as `source` with no priority

// build and browser candidates extend these sort keys
export type GalleryOrderItem = {
	imageId: string
	favorite: boolean
	// ISO date the photo appeared on this site; always set on a published photo
	publishedAt?: string
	// `YYYY` or `YYYY-MM`
	capturedAt?: string
}

// month 0 for a bare year so `2011` sorts before `2011-06`
function capturedKey(value: string | undefined): number | undefined {
	if (!value) return undefined
	const [year, month] = value.split('-')
	return Number(year) * 100 + (month ? Number(month) : 0)
}

function publishedKey(value: string | undefined): number | undefined {
	if (!value) return undefined
	const time = Date.parse(value)
	return Number.isNaN(time) ? undefined : time
}

// items without a key always go last regardless of direction (the `capturedAt` contract); ties keep
// their input order
function sortByKey<T>(
	items: readonly T[],
	key: (item: T) => number | undefined,
	direction: 'asc' | 'desc',
): T[] {
	return items
		.map((item, index) => ({ item, index, value: key(item) }))
		.sort((a, b) => {
			if (a.value === undefined && b.value === undefined) return a.index - b.index
			if (a.value === undefined) return 1
			if (b.value === undefined) return -1
			if (a.value !== b.value)
				return direction === 'asc' ? a.value - b.value : b.value - a.value
			return a.index - b.index
		})
		.map((entry) => entry.item)
}

export function applyOrder<T extends GalleryOrderItem>(
	items: readonly T[],
	order: ImageSetOrder,
): T[] {
	switch (order) {
		case 'source':
			return [...items]
		case 'favorites-first':
			return [
				...items.filter((item) => item.favorite),
				...items.filter((item) => !item.favorite),
			]
		case 'published-newest':
			return sortByKey(items, (item) => publishedKey(item.publishedAt), 'desc')
		case 'published-oldest':
			return sortByKey(items, (item) => publishedKey(item.publishedAt), 'asc')
		case 'captured-newest':
			return sortByKey(items, (item) => capturedKey(item.capturedAt), 'desc')
		case 'captured-oldest':
			return sortByKey(items, (item) => capturedKey(item.capturedAt), 'asc')
	}
}

// a priority ID missing here is skipped, not an error: it need not be in a random sample, and its
// absence from the pool is caught at build when the image set is expanded
export function applyPriority<T extends { imageId: string }>(
	items: readonly T[],
	priorityPhotoIds: readonly string[],
): T[] {
	if (priorityPhotoIds.length === 0) return [...items]
	const byId = new Map(items.map((item) => [item.imageId, item]))
	const promoted: T[] = []
	const seen = new Set<string>()
	for (const id of priorityPhotoIds) {
		const item = byId.get(id)
		if (item && !seen.has(id)) {
			promoted.push(item)
			seen.add(id)
		}
	}
	return [...promoted, ...items.filter((item) => !seen.has(item.imageId))]
}

export function orderGalleryItems<T extends GalleryOrderItem>(
	items: readonly T[],
	order: ImageSetOrder,
	priorityPhotoIds: readonly string[],
): T[] {
	return applyPriority(applyOrder(items, order), priorityPhotoIds)
}
