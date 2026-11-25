import { localeCoverageIssues, type LocalizedText } from '../../config/localized-text.ts'
import { type Locale, type Place, placeSchemaFor, type Tag, tagSchemaFor } from './schemas.ts'
import { foldToAscii, resolveSlugCollision, SlugError, slugifyFromTitle } from './slug.ts'

// authoring helper (add-album and the like) that maps a human name to an existing, close or new
// place/tag and drafts a valid new record; it writes nothing and confirms nothing, since the owner
// approves new records and the integrity gate (`astrum-scena check content`) still owns consistency

export type { LocalizedText }

// the site's locales, from its lock: a proposed name has a text in each, and the id comes from the
// reference locale's
export type TaxonomyLocales = { locales: readonly Locale[]; referenceLocale: Locale }

// normalized Levenshtein similarity at which a name counts as close
const CLOSE_THRESHOLD = 0.8
// lower rank is higher in the hierarchy; a parent must rank strictly lower
const PLACE_KIND_RANK: Record<Place['kind'], number> = { country: 0, region: 1, locality: 2 }

function normalizeName(value: string): string {
	return foldToAscii(value).toLowerCase().replace(/\s+/g, ' ').trim()
}

// a local copy so src/lib does not import migration code
function levenshtein(a: string, b: string): number {
	if (a === b) return 0
	if (!a.length) return b.length
	if (!b.length) return a.length
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
	for (let i = 0; i < a.length; i += 1) {
		const current = [i + 1]
		for (let j = 0; j < b.length; j += 1) {
			const cost = a[i] === b[j] ? 0 : 1
			current.push(Math.min(current[j]! + 1, previous[j + 1]! + 1, previous[j]! + cost))
		}
		previous = current
	}
	return previous[b.length]!
}

function similarity(a: string, b: string): number {
	if (!a.length && !b.length) return 1
	const max = Math.max(a.length, b.length)
	return max === 0 ? 1 : 1 - levenshtein(a, b) / max
}

// containment of 4+ characters also counts as close; shorter substrings match too trivially
function isClose(query: string, candidate: string): number {
	const score = similarity(query, candidate)
	if (score >= CLOSE_THRESHOLD) return score
	const shorter = query.length <= candidate.length ? query : candidate
	const longer = query.length <= candidate.length ? candidate : query
	if (shorter.length >= 4 && longer.includes(shorter)) {
		return Math.max(score, CLOSE_THRESHOLD)
	}
	return score
}

export type NameResolution =
	| { status: 'exists'; id: string }
	| { status: 'close'; candidates: { id: string; score: number }[] }
	| { status: 'new' }

type NamedEntry = {
	id: string
	keys: string[]
}

function resolveName(name: string, entries: readonly NamedEntry[]): NameResolution {
	const query = normalizeName(name)
	if (!query) return { status: 'new' }

	for (const entry of entries) {
		if (entry.keys.some((key) => key === query)) {
			return { status: 'exists', id: entry.id }
		}
	}

	const candidates: { id: string; score: number }[] = []
	for (const entry of entries) {
		const best = Math.max(...entry.keys.map((key) => isClose(query, key)))
		if (best >= CLOSE_THRESHOLD) candidates.push({ id: entry.id, score: best })
	}
	if (candidates.length > 0) {
		candidates.sort(
			(left, right) => right.score - left.score || left.id.localeCompare(right.id),
		)
		return { status: 'close', candidates }
	}
	return { status: 'new' }
}

// a localized text holds only the site's locales, so no value is actually missing
const texts = (text: Readonly<Record<string, string | undefined>>): string[] =>
	Object.values(text).filter((value) => value !== undefined)

function placeKeys(place: Place): NamedEntry {
	return {
		id: place.id,
		keys: [place.id, ...texts(place.name).map(normalizeName)],
	}
}

function tagKeys(tag: Tag): NamedEntry {
	return {
		id: tag.id,
		keys: [tag.id, ...texts(tag.label).map(normalizeName)],
	}
}

// `close` means reuse is suggested and the owner decides
export function resolvePlaceName(name: string, places: readonly Place[]): NameResolution {
	return resolveName(name, places.map(placeKeys))
}

export function resolveTagName(label: string, tags: readonly Tag[]): NameResolution {
	return resolveName(label, tags.map(tagKeys))
}

export class TaxonomyProposalError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'TaxonomyProposalError'
	}
}

// the id base from the reference-locale text, once every active locale has a non-empty one and no
// other; slugs keep Latin letters only, so a Cyrillic reference text gives way to the first active
// locale whose text has some
function idBase(value: LocalizedText, field: string, site: TaxonomyLocales): string {
	const problems = [
		...localeCoverageIssues(value, site.locales).map(
			(issue) => `${field}.${issue.path[0]}: ${issue.message}`,
		),
		...site.locales
			.filter((locale) => value[locale]?.trim() === '')
			.map((locale) => `${field}.${locale}: the "${locale}" text must not be empty`),
	]
	if (problems.length > 0) throw new TaxonomyProposalError(problems.join('; '))
	const order = [
		site.referenceLocale,
		...site.locales.filter((locale) => locale !== site.referenceLocale),
	]
	for (const locale of order) {
		try {
			return slugifyFromTitle(value[locale]!)
		} catch (error) {
			if (!(error instanceof SlugError)) throw error
		}
	}
	throw new TaxonomyProposalError(`${field} has no text an id can be made from`)
}

export type ProposePlaceInput = {
	name: LocalizedText
	kind: Place['kind']
	parentId?: string
}

// the id comes from the reference-locale name (see `idBase`); a collision is resolved by the
// parent id, not an ordinal
export function proposePlace(
	input: ProposePlaceInput,
	places: readonly Place[],
	site: TaxonomyLocales,
): Place {
	const base = idBase(input.name, 'place name', site)

	if (input.kind === 'country') {
		if (input.parentId !== undefined) {
			throw new TaxonomyProposalError('a country place must not have a parentId')
		}
	} else {
		if (input.parentId === undefined) {
			throw new TaxonomyProposalError(`a ${input.kind} place requires a parentId`)
		}
		const parent = places.find((place) => place.id === input.parentId)
		if (!parent) {
			throw new TaxonomyProposalError(`unknown parent place "${input.parentId}"`)
		}
		if (PLACE_KIND_RANK[parent.kind] >= PLACE_KIND_RANK[input.kind]) {
			throw new TaxonomyProposalError(
				`parent "${parent.id}" (${parent.kind}) must be higher in the hierarchy than a ${input.kind}`,
			)
		}
	}

	const existing = new Set(places.map((place) => place.id))
	const id = resolveSlugCollision(base, existing, input.parentId ? [input.parentId] : [])

	return placeSchemaFor(site.locales).parse({
		id,
		name: input.name,
		kind: input.kind,
		...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
	})
}

export type ProposeTagInput = {
	label: LocalizedText
	kind: Tag['kind']
}

// the id comes from the reference-locale label (see `idBase`); a collision is resolved by the
// tag kind
export function proposeTag(
	input: ProposeTagInput,
	tags: readonly Tag[],
	site: TaxonomyLocales,
): Tag {
	const base = idBase(input.label, 'tag label', site)
	const existing = new Set(tags.map((tag) => tag.id))
	const id = resolveSlugCollision(base, existing, [input.kind])
	return tagSchemaFor(site.locales).parse({ id, label: input.label, kind: input.kind })
}
