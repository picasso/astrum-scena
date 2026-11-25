import type { Locale, Place, Tag } from '../content/schemas.ts'
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
