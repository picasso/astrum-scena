import { localizedTextIn } from '../../config/localized-text.ts'
import type { AlbumData, Locale, LocalizedText, PhotoData, Place } from '../content/schemas.ts'
import { cleanText, firstSentence } from '../text.ts'

// presentation receives plain strings for one locale, never a record of locales; a text without the
// locale fails instead of borrowing another locale's

export function pickLocale(text: LocalizedText, locale: Locale): string {
	return localizedTextIn(text, locale)
}

function pickOptional(text: LocalizedText | undefined, locale: Locale): string | undefined {
	return text ? localizedTextIn(text, locale) : undefined
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

	const title = cleanText(pickLocale(photo.title, locale))
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
		title: pickLocale(photo.title, locale),
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
		? places.find((entry) => entry.id === photo.placeId)?.name
		: undefined
	const name = place ? pickLocale(place, locale).trim() : undefined
	const year = photo.capturedAt?.slice(0, 4)
	return name && year ? `${name}, ${year}` : undefined
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
	const title = pickOptional(photo.title, locale)
	if (title && title.trim()) return title
	return resolvePhotoCaption(photo, locale, places) ?? ''
}

export type LocalizedAlbumText = {
	title: string
	description: string
	excerpt?: string
}

export function projectAlbumText(album: AlbumData, locale: Locale): LocalizedAlbumText {
	return {
		title: pickLocale(album.title, locale),
		description: pickLocale(album.description, locale),
		excerpt: pickOptional(album.excerpt, locale),
	}
}
