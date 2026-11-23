import type { LinksSize } from './schema.ts'

// only size and compact width are block-owned: the gap comes from the shared `content-gap.ts` scale
// and link color from prose styles; values are mirrored in `links.css` (tokens.test.ts catches
// drift) and are design tokens, not site.yaml settings

export const LINKS_SIZES: Record<LinksSize, string> = {
	sm: '0.85em',
	base: '1em',
	lg: '1.15em',
}

// the percentage lives here and in CSS, not in the enum name, so it can change without a rename
export const LINKS_WIDTH_COMPACT = '60%'
