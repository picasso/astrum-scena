import { KEBAB_CASE_PATTERN } from '../../config/kebab-case.ts'

// photo slug derivation (docs/design/photo-text-model.md, slug-from-title rules): only the
// mechanical, deterministic part is automated; the semantic steps (picking the subject, recognizing
// proper names) stay authorial, so the result is a suggestion and an owner canonical id always wins

// deliberately conservative: only words that carry no meaning in a short identifier
const ARTICLES = new Set(['a', 'an', 'the'])
const FUNCTION_WORDS = new Set([
	'in',
	'on',
	'at',
	'of',
	'to',
	'for',
	'from',
	'with',
	'and',
	'or',
	'but',
	'nor',
	'by',
	'as',
	'into',
	'onto',
	'over',
	'under',
	'near',
	'off',
	'up',
	'down',
	'out',
	'than',
	'then',
	'per',
	'via',
])

// the documented cap is 2-3 words
const DEFAULT_MAX_WORDS = 3
const MAX_ALLOWED_WORDS = 3

export class SlugError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'SlugError'
	}
}

// ligatures and stroked letters that NFKD does not decompose into base + combining mark; without
// this map they would silently vanish from the slug
const NON_DECOMPOSING_LATIN: Record<string, string> = {
	ß: 'ss',
	ø: 'o',
	Ø: 'O',
	ł: 'l',
	Ł: 'L',
	æ: 'ae',
	Æ: 'AE',
	œ: 'oe',
	Œ: 'OE',
	đ: 'd',
	Đ: 'D',
	ð: 'd',
	Ð: 'D',
	þ: 'th',
	Þ: 'Th',
	ħ: 'h',
	ı: 'i',
}

// non-Latin scripts are not transliterated; they drop out at the later `[^a-z0-9]` filter
export function foldToAscii(value: string): string {
	const mapped = value.replace(/[^\u0000-\u007f]/g, (char) => NON_DECOMPOSING_LATIN[char] ?? char)
	return mapped.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

// an empty result means the value has no ASCII alphanumerics
export function toKebab(value: string): string {
	return foldToAscii(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

// an all-stop-word title keeps its tokens instead of yielding an empty slug
function meaningfulTokens(title: string): string[] {
	const all = foldToAscii(title)
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
	const meaningful = all.filter((token) => !ARTICLES.has(token) && !FUNCTION_WORDS.has(token))
	return meaningful.length > 0 ? meaningful : all
}

export function slugifyFromTitle(title: string, options: { maxWords?: number } = {}): string {
	const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS
	if (!Number.isInteger(maxWords) || maxWords < 1 || maxWords > MAX_ALLOWED_WORDS) {
		throw new SlugError(`maxWords must be an integer between 1 and ${MAX_ALLOWED_WORDS}`)
	}
	const tokens = meaningfulTokens(title)
	if (tokens.length === 0) {
		throw new SlugError(`title "${title}" has no sluggable characters`)
	}
	return tokens.slice(0, maxWords).join('-')
}

// fallback for a photo without a title; no stop-word removal or word cap, since a master filename
// is already an identifier
export function slugifyFromFilename(filename: string): string {
	const base = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
	const slug = toKebab(base)
	if (!slug) throw new SlugError(`filename "${filename}" has no sluggable characters`)
	return slug
}

// the documented rule resolves collisions by a place/year token, never an ordinal; a collision no
// token resolves is left to the owner as a canonical id
export function resolveSlugCollision(
	base: string,
	existing: ReadonlySet<string>,
	distinguishers: readonly string[] = [],
): string {
	if (!existing.has(base)) return base
	for (const raw of distinguishers) {
		const token = toKebab(raw)
		if (!token) continue
		const candidate = `${base}-${token}`
		if (!existing.has(candidate)) return candidate
	}
	throw new SlugError(
		`slug "${base}" collides and no distinguishing token (place/year) resolves it; owner must set a canonical id`,
	)
}

export type SuggestPhotoSlugInput = {
	// owner-approved id, returned as is; its uniqueness is enforced by the integrity gate
	canonicalId?: string
	// EN title, the preferred base
	title?: string
	// master filename
	filename?: string
	// slugs already taken in the collection
	existing?: ReadonlySet<string>
	// place/year tokens tried on a collision
	distinguishers?: readonly string[]
}

// canonical id, then title, then filename, then collision resolution; the result is a suggestion
// and the owner has the final word
export function suggestPhotoSlug(input: SuggestPhotoSlugInput): string {
	const existing = input.existing ?? new Set<string>()
	const distinguishers = input.distinguishers ?? []

	if (input.canonicalId !== undefined) {
		if (!KEBAB_CASE_PATTERN.test(input.canonicalId)) {
			throw new SlugError(`canonical id "${input.canonicalId}" is not a kebab-case slug`)
		}
		// no collision resolution for an owner id: a clash surfaces in the integrity gate as an
		// explicit conflict for the owner to settle
		return input.canonicalId
	}

	let base: string
	if (input.title !== undefined && input.title.trim()) {
		base = slugifyFromTitle(input.title)
	} else if (input.filename !== undefined && input.filename.trim()) {
		base = slugifyFromFilename(input.filename)
	} else {
		throw new SlugError('suggestPhotoSlug requires a canonicalId, a title, or a filename')
	}

	return resolveSlugCollision(base, existing, distinguishers)
}
