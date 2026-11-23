// keeps the trailing `.!?…`, including the ellipsis character
function splitSentences(text: string): string[] {
	return (text.match(/[^.!?…]+[.!?…]*/g) ?? []).map((s) => s.trim()).filter(Boolean)
}

// adds whole sentences while the total stays within `budget`, never cutting inside a word or
// sentence; a first sentence longer than the budget is returned whole, and no ellipsis is added
export function truncateSentences(text: string, budget = 400): string {
	const clean = (text ?? '').trim()
	if (clean === '') return ''

	const sentences = splitSentences(clean)
	if (sentences.length === 0) return clean

	const kept: string[] = []
	let length = 0
	for (const sentence of sentences) {
		if (kept.length === 0) {
			kept.push(sentence)
			length = sentence.length
			if (length > budget) break
			continue
		}
		const next = length + 1 + sentence.length
		if (next > budget) break
		kept.push(sentence)
		length = next
	}
	return kept.join(' ')
}

// the whole text when it has no sentence terminator
export function firstSentence(text: string): string {
	const clean = (text ?? '').trim()
	if (clean === '') return ''
	const sentences = splitSentences(clean)
	return sentences[0] ?? clean
}

// strips HTML tags and leftover qTranslate/shortcode `[...]` markers, collapses whitespace
export function cleanText(raw: string): string {
	return (raw ?? '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\[[^\]]*\]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}
