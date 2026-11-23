import { cleanText, truncateSentences } from '../text.ts'

// port of the legacy zukit `get_excerpt` (`zukit/snippets/traits/content.php`): without its own
// excerpt a post got whole body sentences up to the budget, which is why every legacy card had a
// description although `post_excerpt` was empty (as it is for our documents); 270 is the legacy
// `$amount` default
const EXCERPT_BUDGET = 270

// links become captions BEFORE cleanText, which strips any `[...]`; a leading heading is dropped
// whole (as the legacy theme did) so the excerpt does not open with a duplicate of the title
function markdownToPlainText(markdown: string): string {
	return cleanText(
		markdown
			.replace(/```[\s\S]*?```/g, ' ')
			.replace(/^\s*#{1,6}[^\n]*\n/, ' ')
			.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
			.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/^\s{0,3}#{1,6}\s+/gm, '')
			.replace(/^\s{0,3}>\s?/gm, '')
			.replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, '')
			.replace(/[*_`~]/g, ''),
	)
}

// the same legacy method as for documents, but over the album's plain-text description; an empty
// description gives undefined, since a card without a description is valid
export function deriveAlbumExcerpt(
	explicit: string | undefined,
	description: string,
): string | undefined {
	const own = explicit?.trim()
	if (own) return own
	return truncateSentences(cleanText(description), EXCERPT_BUDGET) || undefined
}

// the frontmatter excerpt wins as the author's choice; an empty body gives undefined, since a card
// without a description is valid
export function deriveExcerpt(
	explicit: string | undefined,
	body: string | undefined,
): string | undefined {
	const own = explicit?.trim()
	if (own) return own

	const derived = truncateSentences(markdownToPlainText(body ?? ''), EXCERPT_BUDGET)
	return derived || undefined
}
