import {
	type AlbumEntry,
	buildPublishedMembershipIndex,
	getListablePhotos,
	indexById,
	type PhotoEntry,
} from './publication.ts'

// the footer promo lures visitors to what they have not seen yet, above all to other albums. Pure:
// no Astro globals, fs, network, build date or mutable state, so a page always gets the same set.
// Each page gets its own weighted sample without replacement (Efraimidis–Spirakis) seeded by
// hash(pageKey, photoId) instead of randomness, so the same inputs give the same set on every
// build. Slots go to the favorites quota first, then one photo per album until albums run out,
// then the per-album limit relaxes step by step. The output keeps the queue order so favorites do
// not stick to the start

export type PromoCandidate = {
	photo: PhotoEntry
	// the photo's first published album in collection order: the link target and the diversity key
	albumId: string
}

export type FooterPromoContext = {
	// locale-neutral (`album:northland`, `page:contacts`) so RU and EN of a page get the same set
	pageKey: string
	// photos the page already shows
	excludePhotoIds: ReadonlySet<string>
}

export type FooterPromoOptions = {
	count: number
	// 0 means no quota: favorites compete like regular photos
	favorites: number
	// ≥ 1: how many times less often the oldest photo appears than the newest; 1 ignores recency.
	// Its meaning does not depend on the corpus size
	freshness: number
}

// the caller passes `hasFooterMedia` (a manifest lookup) to keep this module pure. Filtering before
// slot selection keeps an unusable photo from taking a slot in the grid
export function buildPromoCandidates(
	albums: readonly AlbumEntry[],
	photos: readonly PhotoEntry[],
	hasFooterMedia: (photoId: string) => boolean,
): PromoCandidate[] {
	const membership = buildPublishedMembershipIndex(albums, indexById(photos))
	const candidates: PromoCandidate[] = []
	for (const photo of getListablePhotos(photos)) {
		const albumId = membership.get(photo.id)?.[0]
		if (albumId !== undefined && hasFooterMedia(photo.id)) {
			candidates.push({ photo, albumId })
		}
	}
	return candidates
}

export function selectFooterPromo(
	candidates: readonly PromoCandidate[],
	context: FooterPromoContext,
	options: FooterPromoOptions,
): PromoCandidate[] {
	const pool = candidates.filter((candidate) => !context.excludePhotoIds.has(candidate.photo.id))
	const queue = personalQueue(pool, context.pageKey, options.freshness)

	const picked = new Set<PromoCandidate>()
	const perAlbum = new Map<string, number>()
	const take = (source: readonly PromoCandidate[], albumLimit: number, max: number): void => {
		for (const candidate of source) {
			if (picked.size >= max) return
			const used = perAlbum.get(candidate.albumId) ?? 0
			if (picked.has(candidate) || used >= albumLimit) continue
			picked.add(candidate)
			perAlbum.set(candidate.albumId, used + 1)
		}
	}

	const count = Math.min(options.count, queue.length)
	take(
		queue.filter((candidate) => candidate.photo.data.favorite),
		1,
		Math.min(options.favorites, count),
	)
	// a pass with a higher per-album limit runs only once every album already has a photo
	for (let albumLimit = 1; picked.size < count; albumLimit++) {
		take(queue, albumLimit, count)
	}
	return queue.filter((candidate) => picked.has(candidate))
}

// Efraimidis–Spirakis key ln(u)/weight, descending; the id tiebreak keeps the order total
function personalQueue(
	pool: readonly PromoCandidate[],
	pageKey: string,
	freshness: number,
): PromoCandidate[] {
	const weights = freshnessWeights(pool, freshness)
	const keyed = pool.map((candidate) => ({
		candidate,
		key: Math.log(hashUnit(pageKey, candidate.photo.id)) / weights.get(candidate)!,
	}))
	keyed.sort((a, b) => b.key - a.key || a.candidate.photo.id.localeCompare(b.candidate.photo.id))
	return keyed.map((entry) => entry.candidate)
}

// weight = freshness ^ −rank, with a competition rank by publishedAt desc normalized to [0, 1].
// Rank rather than age in days keeps the result independent of the build date, keeps a large date
// gap from zeroing out old photos, and keeps `freshness` meaning the same for 30 or 300 photos
function freshnessWeights(
	pool: readonly PromoCandidate[],
	freshness: number,
): Map<PromoCandidate, number> {
	const dates = pool.map((candidate) => candidate.photo.data.publishedAt ?? '')
	const ranks = dates.map((current) => dates.filter((date) => date > current).length)
	const lastRank = Math.max(0, ...ranks)
	const weights = new Map<PromoCandidate, number>()
	pool.forEach((candidate, index) => {
		const position = lastRank === 0 ? 0 : ranks[index]! / lastRank
		weights.set(candidate, freshness ** -position)
	})
	return weights
}

// deterministic value in (0, 1): FNV-1a 32 plus the murmur3 fmix32 finalizer, which keeps short
// similar strings evenly spread
function hashUnit(pageKey: string, photoId: string): number {
	let hash = 0x811c9dc5
	for (const char of `${pageKey}\u0000${photoId}`) {
		hash ^= char.codePointAt(0)!
		hash = Math.imul(hash, 0x01000193)
	}
	hash ^= hash >>> 16
	hash = Math.imul(hash, 0x85ebca6b)
	hash ^= hash >>> 13
	hash = Math.imul(hash, 0xc2b2ae35)
	hash ^= hash >>> 16
	return ((hash >>> 0) + 0.5) / 2 ** 32
}
