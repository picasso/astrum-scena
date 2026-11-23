// shared spacing scale of content blocks (docs/blocks/README.md): the names are part of the MDX
// contract and move to the next site as is, while the numbers are this site's tokens and live in
// CSS so a theme can change them without rebuilding a component

export type ContentGap = 'none' | 'tiny' | 'small' | 'medium' | 'large'

export const CONTENT_GAPS: readonly ContentGap[] = ['none', 'tiny', 'small', 'medium', 'large']

export function contentGapVar(gap: ContentGap): string {
	return `var(--content-gap-${gap})`
}
