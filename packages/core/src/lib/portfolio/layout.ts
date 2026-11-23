// pure geometry for masonry and justified grids, free of site config, Astro and DOM so it is fully
// testable; it never reorders items because DOM, focus and viewer order belong to the caller

export type LayoutItem = {
	id: string
	width: number
	height: number
}

export type MasonryConfig = {
	minColumnWidth: number
	gap: number
	maxColumns: number
}

export type JustifiedConfig = {
	targetRowHeight: number
	gap: number
	tolerance: number
}

const aspectRatio = (item: LayoutItem): number => {
	if (!(item.width > 0) || !(item.height > 0)) {
		throw new Error(`layout item "${item.id}" must have positive width and height`)
	}
	return item.width / item.height
}

// --- Masonry ---------------------------------------------------------------------------------------

export type MasonryItem = {
	id: string
	aspectRatio: number
}

// CSS lays out the columns itself; the exact count serves the SSR hint and deterministic tests
export function resolveMasonryColumns(containerWidth: number, config: MasonryConfig): number {
	if (!(containerWidth > 0)) return 1
	const raw = Math.floor((containerWidth + config.gap) / (config.minColumnWidth + config.gap))
	return Math.min(Math.max(raw, 1), config.maxColumns)
}

export function resolveMasonryItems(items: readonly LayoutItem[]): MasonryItem[] {
	return items.map((item) => ({ id: item.id, aspectRatio: aspectRatio(item) }))
}

// --- Justified -------------------------------------------------------------------------------------

export type JustifiedCell = {
	id: string
	width: number
	height: number
}

export type JustifiedRow = {
	cells: JustifiedCell[]
	height: number
	isLastRow: boolean
}

// greedy row packing at the target height; a full row is scaled to fill the container exactly. The
// trailing partial row keeps the target height when filling would exceed target*(1+tolerance),
// otherwise a few photos would balloon
export function resolveJustifiedRows(
	items: readonly LayoutItem[],
	containerWidth: number,
	config: JustifiedConfig,
): JustifiedRow[] {
	const { targetRowHeight, gap, tolerance } = config
	if (items.length === 0) return []

	const markLast = (rows: JustifiedRow[]): JustifiedRow[] => {
		const last = rows[rows.length - 1]
		if (last) last.isLastRow = true
		return rows
	}

	// without a positive width nothing can be justified: one photo per row at the target height
	if (!(containerWidth > 0)) {
		return markLast(
			items.map((item) => ({
				cells: [
					{
						id: item.id,
						width: targetRowHeight * aspectRatio(item),
						height: targetRowHeight,
					},
				],
				height: targetRowHeight,
				isLastRow: false,
			})),
		)
	}

	const closeRow = (rowItems: LayoutItem[], ratioSum: number, isLast: boolean): JustifiedRow => {
		const gaps = gap * Math.max(rowItems.length - 1, 0)
		const available = containerWidth - gaps
		// when gaps alone fill the container, keep the target height rather than go negative
		const fittedHeight = available > 0 ? available / ratioSum : targetRowHeight
		const height =
			isLast && fittedHeight > targetRowHeight * (1 + tolerance)
				? targetRowHeight
				: fittedHeight
		const cells = rowItems.map((item) => ({
			id: item.id,
			width: height * aspectRatio(item),
			height,
		}))
		return { cells, height, isLastRow: isLast }
	}

	const rows: JustifiedRow[] = []
	let current: LayoutItem[] = []
	let ratioSum = 0

	for (const item of items) {
		current.push(item)
		ratioSum += aspectRatio(item)
		const gaps = gap * (current.length - 1)
		const rowWidthAtTarget = ratioSum * targetRowHeight + gaps
		if (rowWidthAtTarget >= containerWidth) {
			rows.push(closeRow(current, ratioSum, false))
			current = []
			ratioSum = 0
		}
	}

	// when the input ends on an exactly filled row, markLast only flags that full row and leaves
	// its geometry untouched
	if (current.length > 0) {
		rows.push(closeRow(current, ratioSum, true))
	}

	return markLast(rows)
}

export function flattenJustifiedOrder(rows: readonly JustifiedRow[]): string[] {
	return rows.flatMap((row) => row.cells.map((cell) => cell.id))
}
