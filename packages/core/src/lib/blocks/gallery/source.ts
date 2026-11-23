import type { ImageSet, ImageSetOrder, ImageSetsConfig } from './image-sets.ts'
import type { GalleryProps } from './schema.ts'

// pure gallery source resolution (docs/blocks/gallery.md) that runs before the layout filter and
// random sampling; the caller supplies album and photo existence from the collections, and the
// imports stay type-only because schema and image-sets pull in zod and node

export type GallerySourceKind = 'imageSet' | 'album' | 'images'

export type GallerySourceContext = {
	imageSets: ImageSetsConfig
	// published albums only, each in its canonical photo order
	albumPhotoIds: ReadonlyMap<string, readonly string[]>
	// published, embeddable photos that direct photo IDs and `exclude` are checked against
	knownPhotoIds: ReadonlySet<string>
}

export type GallerySourceResult = {
	kind: GallerySourceKind
	// expanded, deduplicated and excluded, but not yet ordered, filtered by layout or sampled
	poolIds: string[]
	// only image sets carry ordering; albums and explicit images get `source` and no priority
	order: ImageSetOrder
	priorityPhotoIds: string[]
	// lower-priority sources ignored when several valid ones are given (diagnostics, not an error)
	ignoredSources: GallerySourceKind[]
}

// albums come first in `albumIds` order, then the set's own `photoIds`; a repeat keeps its first
// position
function expandImageSet(set: ImageSet, ctx: GallerySourceContext, setId: string): string[] {
	const seen = new Set<string>()
	const pool: string[] = []
	const add = (id: string): void => {
		if (!seen.has(id)) {
			seen.add(id)
			pool.push(id)
		}
	}
	for (const albumId of set.albumIds ?? []) {
		const ids = ctx.albumPhotoIds.get(albumId)
		if (!ids) {
			throw new Error(
				`Gallery image set "${setId}": unknown or unpublished albumId "${albumId}"`,
			)
		}
		for (const id of ids) add(id)
	}
	for (const id of set.photoIds ?? []) {
		if (!ctx.knownPhotoIds.has(id)) {
			throw new Error(
				`Gallery image set "${setId}": unknown or non-embeddable photoId "${id}"`,
			)
		}
		add(id)
	}
	if (pool.length === 0) {
		throw new Error(`Gallery image set "${setId}": empty after expansion`)
	}
	for (const id of set.priorityPhotoIds ?? []) {
		if (!seen.has(id)) {
			throw new Error(
				`Gallery image set "${setId}": priorityPhotoIds "${id}" is not in the expanded pool`,
			)
		}
	}
	return pool
}

// an unknown exclude ID is an error even when it is not in the pool, so typos do not pass silently
function applyExclude(
	poolIds: readonly string[],
	exclude: readonly string[],
	knownPhotoIds: ReadonlySet<string>,
): string[] {
	if (exclude.length === 0) return [...poolIds]
	const removed = new Set<string>()
	for (const id of exclude) {
		if (!knownPhotoIds.has(id)) throw new Error(`Gallery: unknown exclude ID "${id}"`)
		removed.add(id)
	}
	return poolIds.filter((id) => !removed.has(id))
}

export function resolveGallerySource(
	props: GalleryProps,
	ctx: GallerySourceContext,
): GallerySourceResult {
	// the schema guarantees at least one source
	const present: GallerySourceKind[] = []
	if (props.imageSetId !== undefined) present.push('imageSet')
	if (props.albumId !== undefined) present.push('album')
	if (props.images !== undefined) present.push('images')
	const kind = present[0]!
	const ignoredSources = present.slice(1)

	let poolIds: string[]
	let order: ImageSetOrder = 'source'
	let priorityPhotoIds: string[] = []

	if (kind === 'imageSet') {
		const set = ctx.imageSets[props.imageSetId!]
		if (!set) throw new Error(`Gallery: unknown imageSetId "${props.imageSetId}"`)
		poolIds = expandImageSet(set, ctx, props.imageSetId!)
		order = set.order ?? 'source'
		priorityPhotoIds = set.priorityPhotoIds ?? []
	} else if (kind === 'album') {
		const ids = ctx.albumPhotoIds.get(props.albumId!)
		if (!ids) throw new Error(`Gallery: unknown or unpublished albumId "${props.albumId}"`)
		poolIds = [...ids]
	} else {
		// existence of explicit images is checked by the build resolver, which reports an
		// unpublished photo more precisely
		poolIds = props.images!.map((image) => image.imageId)
	}

	return {
		kind,
		poolIds: applyExclude(poolIds, props.exclude, ctx.knownPhotoIds),
		order,
		priorityPhotoIds,
		ignoredSources,
	}
}
