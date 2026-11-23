import type { Place } from '../../lib/content/schemas.ts'
import type { PlaceGpsBound } from './place-gps-bounds.ts'

// proposes an existing placeId for review, never creates places or applies the proposal. Exact
// coordinates are private and never leave this module, not even in review items

export type GpsPoint = { latitude: number; longitude: number }

export type GpsPlaceReviewKind =
	| 'no-match'
	// several matches with no ancestor/descendant relation between them
	| 'unrelated-overlap'
	| 'conflict-with-approved'

export type GpsPlaceReview = { kind: GpsPlaceReviewKind; detail: string }

export type GpsPlaceProposal = {
	// needs the owner's sign-off before it is applied
	proposal?: string
	review?: GpsPlaceReview
}

export type ProposePlaceIdOptions = {
	// a differing proposal never overwrites it; it yields a conflict review instead
	approvedPlaceId?: string
}

function boxContains(box: PlaceGpsBound['box'], point: GpsPoint): boolean {
	return (
		point.latitude >= box.south &&
		point.latitude <= box.north &&
		point.longitude >= box.west &&
		point.longitude <= box.east
	)
}

function isAncestor(
	ancestorId: string,
	placeId: string,
	byId: ReadonlyMap<string, Pick<Place, 'id' | 'parentId'>>,
): boolean {
	const seen = new Set<string>([placeId])
	let current = byId.get(placeId)
	while (current?.parentId) {
		// a cycle guard
		if (seen.has(current.parentId)) return false
		if (current.parentId === ancestorId) return true
		seen.add(current.parentId)
		current = byId.get(current.parentId)
	}
	return false
}

export function proposePlaceId(
	point: GpsPoint,
	bounds: readonly PlaceGpsBound[],
	places: readonly Pick<Place, 'id' | 'parentId'>[],
	options: ProposePlaceIdOptions = {},
): GpsPlaceProposal {
	const byId = new Map(places.map((place) => [place.id, place]))

	// a Set because an antimeridian place has two boxes but counts as one match
	const matched = new Set<string>()
	for (const bound of bounds) if (boxContains(bound.box, point)) matched.add(bound.placeId)

	if (matched.size === 0) {
		return {
			review: { kind: 'no-match', detail: 'no controlled place zone contains the point' },
		}
	}

	const candidates = [...matched]
	// the most specific place wins: keep candidates with no matched descendant
	const deepest = candidates.filter(
		(candidate) =>
			!candidates.some((other) => other !== candidate && isAncestor(candidate, other, byId)),
	)

	if (deepest.length !== 1) {
		return {
			review: {
				kind: 'unrelated-overlap',
				detail: `ambiguous overlap between controlled places: ${[...deepest].sort().join(', ')}`,
			},
		}
	}

	const proposal = deepest[0]!
	if (options.approvedPlaceId && options.approvedPlaceId !== proposal) {
		return {
			review: {
				kind: 'conflict-with-approved',
				detail: `gps proposal "${proposal}" conflicts with approved placeId "${options.approvedPlaceId}"`,
			},
		}
	}
	return { proposal }
}

// the build's warning for a photo: its GPS proposes another place than its placeId, or conflicts with
// it; a point no zone or several unrelated zones contain says nothing about the placeId
export function gpsPlaceWarning(
	proposal: GpsPlaceProposal,
	placeId: string | undefined,
): string | undefined {
	if (proposal.review?.kind === 'conflict-with-approved')
		return `gps-place: ${proposal.review.detail}`
	if (proposal.proposal !== undefined && proposal.proposal !== placeId)
		return `gps-place: gps proposes placeId "${proposal.proposal}", the photo has none`
	return undefined
}
