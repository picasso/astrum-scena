// port of the legacy PHP `add_halftag_to_string` in `inverse=true` mode, which the slider always
// uses: `head` is the main color, `tail` is the accent span, `clean` is the title without markers

export type SplitHeading = {
	// for the automatic split, the normalized string
	clean: string
	head: string
	tail: string
}

// legacy PHP break points: index = word count, value = break_index; from 12 words on the break is
// `floor(n/2) - 1`
export const SPLIT_POINTS: readonly number[] = [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 4]

const MANUAL_MARKER = '|'

function breakIndexFor(wordCount: number): number {
	return wordCount >= SPLIT_POINTS.length
		? Math.floor(wordCount / 2) - 1
		: SPLIT_POINTS[wordCount]!
}

// PHP inserted the span with `str_replace($words[$break_index], ...)`, i.e. at the first
// occurrence of the boundary word, so a repeated word earlier in the title would shift the cut;
// splitting by word index is cleaner, and no current title repeats its boundary word
function autoSplitWords(words: string[]): { head: string; tail: string } {
	const breakIndex = breakIndexFor(words.length)
	const head = words.slice(0, breakIndex + 1).join(' ')
	const rest = words.slice(breakIndex + 1).join(' ')
	// the boundary space opens the tail (inside the accent span) as in the legacy str_replace,
	// keeping head + tail === clean; otherwise `{head}<span>{tail}</span>` renders "umbrellain"
	return { head, tail: rest ? ` ${rest}` : '' }
}

export function splitHeading(title: string): SplitHeading {
	const raw = title ?? ''

	// a manual marker splits exactly where the author put it, so author spacing is kept as is
	if (raw.includes(MANUAL_MARKER)) {
		const idx = raw.indexOf(MANUAL_MARKER)
		const head = raw.slice(0, idx)
		const tail = raw.slice(idx + MANUAL_MARKER.length)
		return { clean: head + tail, head, tail }
	}

	const clean = raw.replace(/\s+/g, ' ').trim()
	if (clean === '') return { clean: '', head: '', tail: '' }

	const words = clean.split(' ')

	if (words.length > 1) {
		const { head, tail } = autoSplitWords(words)
		return { clean, head, tail }
	}

	const word = words[0]!
	if (word.includes('-')) {
		// legacy dash branch: split at the hyphens like separate words, then drop the added spaces,
		// since the author's hyphen never broke the word
		const spaced = word.replace(/-/g, '- ').split(' ')
		const { head, tail } = autoSplitWords(spaced)
		return {
			clean: word,
			head: head.replace(/ /g, ''),
			tail: tail.replace(/ /g, ''),
		}
	}

	return { clean: word, head: word, tail: '' }
}
