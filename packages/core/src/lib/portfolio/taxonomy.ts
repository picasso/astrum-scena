import type { DimensionConfig } from '../../config/taxonomy.ts'
import type { DimensionValue, Locale, Place, Tag } from '../content/schemas.ts'
import { pickLocale } from './locale.ts'

// unknown ids throw: integrity checks catch them at build time, this is the runtime guard

export function resolvePlaceName(
	placeId: string,
	places: readonly Place[],
	locale: Locale,
): string {
	const place = places.find((candidate) => candidate.id === placeId)
	if (!place) throw new Error(`unknown place "${placeId}"`)
	return pickLocale(place.name, locale)
}

// returns the place chain from the root ancestor down (EUROPE ○ GREECE ○ SANTORINI); a parentId
// cycle in a corrupted dictionary throws instead of looping forever
export function resolvePlaceHierarchy(
	placeId: string,
	places: readonly Place[],
	locale: Locale,
): string[] {
	const byId = new Map(places.map((place) => [place.id, place]))
	const chain: string[] = []
	const seen = new Set<string>()
	let currentId: string | undefined = placeId
	while (currentId) {
		if (seen.has(currentId)) throw new Error(`place hierarchy has a cycle at "${currentId}"`)
		seen.add(currentId)
		const place = byId.get(currentId)
		if (!place) throw new Error(`unknown place "${currentId}"`)
		chain.push(pickLocale(place.name, locale))
		currentId = place.parentId
	}
	return chain.reverse()
}

export type ResolvedTag = {
	id: string
	label: string
}

export function resolveTagLabels(
	tagIds: readonly string[],
	tags: readonly Tag[],
	locale: Locale,
): ResolvedTag[] {
	const byId = new Map(tags.map((tag) => [tag.id, tag]))
	return tagIds.map((id) => {
		const tag = byId.get(id)
		if (!tag) throw new Error(`unknown tag "${id}"`)
		return { id, label: pickLocale(tag.label, locale) }
	})
}

// a chip of a dimension value: `title` is the dimension's label, `icon` the SVG of its Lucide icon
export type ResolvedDimensionValue = {
	dimension: string
	title: string
	icon?: string
	id: string
	label: string
}

// the photo's values in the order the config declares the dimensions, each in the photo's order
export function resolveDimensionValues(
	photoDimensions: Readonly<Record<string, readonly string[]>>,
	declared: Readonly<Record<string, DimensionConfig>>,
	dictionaries: Readonly<Record<string, readonly DimensionValue[]>>,
	locale: Locale,
	iconSvg: (name: string) => string,
): ResolvedDimensionValue[] {
	for (const dimension of Object.keys(photoDimensions))
		if (!Object.hasOwn(declared, dimension)) throw new Error(`unknown dimension "${dimension}"`)
	return Object.entries(declared).flatMap(([dimension, config]) => {
		const ids = Object.hasOwn(photoDimensions, dimension) ? photoDimensions[dimension]! : []
		if (ids.length === 0) return []
		const byId = new Map((dictionaries[dimension] ?? []).map((value) => [value.id, value]))
		const title = pickLocale(config.label, locale)
		const icon = config.icon === undefined ? undefined : iconSvg(config.icon)
		return ids.map((id) => {
			const value = byId.get(id)
			if (!value) throw new Error(`unknown ${dimension} "${id}"`)
			return {
				dimension,
				title,
				...(icon === undefined ? {} : { icon }),
				id,
				label: pickLocale(value.label, locale),
			}
		})
	})
}
