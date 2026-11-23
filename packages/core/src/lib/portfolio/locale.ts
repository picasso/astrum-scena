import type { AlbumData, Locale, LocalizedText, PhotoData, Place } from '../content/schemas.ts'
import { cleanText, firstSentence } from '../text.ts'

// presentation receives plain strings for one locale, never {en, ru} pairs

export function pickLocale(text: LocalizedText, locale: Locale): string {
	return text[locale]
}

function pickOptional(text: LocalizedText | undefined, locale: Locale): string | undefined {
	return text ? text[locale] : undefined
}

export type LocalizedPhotoText = {
	title: string
	description?: string
	caption?: string
	alt: string
}

// alt is derived rather than authored: an explicit alt overrides, otherwise the title enriched with
// the first description sentence; never the caption, filename or source
export function resolvePhotoAlt(photo: PhotoData, locale: Locale): string {
	const explicit = pickOptional(photo.alt, locale)?.trim()
	if (explicit) return explicit

	const title = cleanText(photo.title[locale])
	const description = pickOptional(photo.description, locale)
	const sentence = description ? firstSentence(cleanText(description)) : ''
	if (sentence && sentence !== title) {
		// strip the title's closing punctuation to avoid "Ridge!. Description"
		const stem = title.replace(/[.!?…]+$/u, '').trim()
		return stem ? `${stem}. ${sentence}` : sentence
	}
	return title
}

export function projectPhotoText(photo: PhotoData, locale: Locale): LocalizedPhotoText {
	return {
		title: photo.title[locale],
		description: pickOptional(photo.description, locale),
		caption: pickOptional(photo.caption, locale),
		alt: resolvePhotoAlt(photo, locale),
	}
}

// the computed caption is strictly "Place, YYYY": a bare place or bare year is never shown, so
// both parts are required; the full field model is in docs/design/photo-text-model.md
function computePlaceYear(
	photo: PhotoData,
	locale: Locale,
	places: readonly Place[],
): string | undefined {
	const place = photo.placeId
		? places.find((entry) => entry.id === photo.placeId)?.name[locale].trim()
		: undefined
	const year = photo.capturedAt?.slice(0, 4)
	return place && year ? `${place}, ${year}` : undefined
}

// an authored caption overrides the computed one (ADR-0010) and is returned untrimmed so the output
// does not drift from the content
export function resolvePhotoCaption(
	photo: PhotoData,
	locale: Locale,
	places: readonly Place[],
): string | undefined {
	const authored = pickOptional(photo.caption, locale)
	if (authored && authored.trim()) return authored
	return computePlaceYear(photo, locale, places)
}

// the title has no computed fallback of its own (docs/design/photo-text-model.md): a missing title
// makes the name fall back to the caption, never to the filename, which only feeds the slug. The
// schema requires a title today, so the caption branch is defensive (ADR-0010)
export function resolvePhotoDisplayName(
	photo: PhotoData,
	locale: Locale,
	places: readonly Place[],
): string {
	const title = photo.title?.[locale]
	if (title && title.trim()) return title
	return resolvePhotoCaption(photo, locale, places) ?? ''
}

export type LocalizedAlbumText = {
	title: string
	description: string
}

export function projectAlbumText(album: AlbumData, locale: Locale): LocalizedAlbumText {
	return {
		title: album.title[locale],
		description: album.description[locale],
	}
}
