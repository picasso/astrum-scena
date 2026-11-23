import { splitHeading } from './split-heading'
import { cleanText, firstSentence } from './text'

// priority: the clean title (the `|` marker removed, then `cleanText` strips leftover HTML and
// qTranslate markers, like the description branch), else the first sentence of the description,
// else the caller's localized fallback (site.yaml `identity.photoAlt`)
export function computeAlt(opts: { title: string; desc: string; fallback: string }): string {
	const { title, desc, fallback } = opts

	const heading = cleanText(splitHeading(title).clean)
	if (heading !== '') return heading

	const sentence = firstSentence(cleanText(desc))
	if (sentence !== '') return sentence

	return fallback
}
