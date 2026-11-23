// `footer.columns` is an upper bound: a disabled or empty column is not rendered and the grid
// shrinks so the rest share the width without gaps. The menu always shows, so the count is never 0
export type FooterColumnCount = 1 | 2 | 3

export function footerColumnCount(
	configured: FooterColumnCount,
	visibleItems: number,
): FooterColumnCount {
	return Math.max(1, Math.min(configured, visibleItems)) as FooterColumnCount
}
