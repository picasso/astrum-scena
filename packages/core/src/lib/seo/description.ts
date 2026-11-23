import { deriveExcerpt } from '../content/excerpt.ts'
import { cleanText } from '../text.ts'

const MAX_DESCRIPTION_LENGTH = 160

export function normalizeDescription(value: string): string {
	const plain = cleanText(value).replace(/\s+/g, ' ').trim()
	if (plain.length <= MAX_DESCRIPTION_LENGTH) return plain
	const cut = plain.slice(0, MAX_DESCRIPTION_LENGTH + 1)
	const wordEnd = cut.lastIndexOf(' ')
	return `${cut.slice(0, wordEnd > 0 ? wordEnd : MAX_DESCRIPTION_LENGTH).trimEnd()}…`
}

export function selectDescription(
	defaultText: string,
	options: { description?: string; excerpt?: string; body?: string },
): string {
	const authored = normalizeDescription(options.description ?? '')
	if (authored) return authored
	const body = options.body
		?.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
		.replace(/^\s*:::[^\n]*$/gm, ' ')
	const document = normalizeDescription(deriveExcerpt(options.excerpt, body) ?? '')
	return document || normalizeDescription(defaultText)
}

export function photoDescription(photo: {
	title: string
	description?: string
	caption?: string
	albumTitle: string
}): string {
	return (
		photo.description?.trim() ||
		[photo.title, photo.caption, photo.albumTitle].filter((part) => part?.trim()).join(' · ')
	)
}
