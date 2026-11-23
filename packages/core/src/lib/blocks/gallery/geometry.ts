import type { JustifiedRow, LayoutItem } from '../../portfolio/layout.ts'

// pure gallery geometry (docs/blocks/gallery.md) with no DOM, Astro or node imports: it runs at
// build for a static justified set and in the browser after sampling and on resize; the row height
// follows the gallery formula, not the portfolio's fixed 240

// minimum visual tile width across Gallery layouts; lower density avoids a brief, unusable two-column range.
export const GALLERY_MIN_TILE_PX = 240
// the phone breakpoint is a container width, not a viewport or device type
export const GALLERY_MOBILE_MAX_PX = 480
// only a dynamic rect gallery (`randomCount` set) is filtered by it, to avoid an excessive vertical
// crop; a static rect list keeps every orientation
export const RECT_MIN_ASPECT = 4 / 3

export type GalleryDimensions = { width: number; height: number }

export function isMobileContainer(containerWidth: number): boolean {
	return containerWidth <= GALLERY_MOBILE_MAX_PX
}

// actual column density for the container width and gap, floored at one:
// `min(columns, max(1, floor((W + gap) / (240 + gap))))`.
export function resolveActualColumns(columns: number, containerWidth: number, gap: number): number {
	if (!(containerWidth > 0)) return 1
	const raw = Math.floor((containerWidth + gap) / (GALLERY_MIN_TILE_PX + gap))
	return Math.min(columns, Math.max(1, raw))
}

// justified uses the same visual-density threshold to reduce its target column count.
export const resolveEffectiveColumns = resolveActualColumns

export function isRectCandidate(dimensions: GalleryDimensions): boolean {
	return dimensions.width / dimensions.height >= RECT_MIN_ASPECT
}

export function averageAspectRatio(items: readonly GalleryDimensions[]): number {
	if (items.length === 0) return 1
	const sum = items.reduce((acc, item) => acc + item.width / item.height, 0)
	return sum / items.length
}

export type JustifiedTargetInput = {
	containerWidth: number
	gap: number
	// px; frames take width away from the cells
	frame: number
	effectiveColumns: number
	averageAspectRatio: number
}

// gallery contract formula:
//   availableWidth = W - gap*(effCols-1) - frame*2*effCols
//   targetRowHeight = (availableWidth / effCols) / averageAspectRatio
export function resolveJustifiedTargetRowHeight(input: JustifiedTargetInput): number {
	const { containerWidth, gap, frame, effectiveColumns, averageAspectRatio } = input
	const availableWidth =
		containerWidth - gap * (effectiveColumns - 1) - frame * 2 * effectiveColumns
	const averageCellWidth = availableWidth / effectiveColumns
	return averageCellWidth / averageAspectRatio
}

export type GalleryJustifiedOptions = {
	columns: number
	gap: number
	frame: number
}

function layoutAspectRatio(item: LayoutItem): number {
	if (!(item.width > 0) || !(item.height > 0)) {
		throw new Error(`gallery layout item "${item.id}" must have positive width and height`)
	}
	return item.width / item.height
}

// frames are budgeted per cell of the actual row (`sum(aspect * height) + n * frame * 2 + gaps`),
// not once for the column cap, because a packed row can hold more or fewer items than the cap
export function resolveGalleryJustified(
	items: readonly LayoutItem[],
	containerWidth: number,
	options: GalleryJustifiedOptions,
): JustifiedRow[] {
	const effectiveColumns = resolveEffectiveColumns(options.columns, containerWidth, options.gap)
	const targetRowHeight = resolveJustifiedTargetRowHeight({
		containerWidth,
		gap: options.gap,
		frame: options.frame,
		effectiveColumns,
		averageAspectRatio: averageAspectRatio(items),
	})
	if (items.length === 0) return []

	const closeRow = (rowItems: LayoutItem[], ratioSum: number, isLast: boolean): JustifiedRow => {
		const gaps = options.gap * Math.max(rowItems.length - 1, 0)
		const frameBudget = options.frame * 2 * rowItems.length
		const available = containerWidth - gaps - frameBudget
		const fittedHeight = available > 0 ? available / ratioSum : targetRowHeight
		// the incomplete last row always keeps the target height instead of stretching to the right
		// edge (`nojustify`); full rows are closed inside the loop as non-last
		const height = isLast ? targetRowHeight : fittedHeight
		return {
			cells: rowItems.map((item) => ({
				id: item.id,
				width: height * layoutAspectRatio(item),
				height,
			})),
			height,
			isLastRow: isLast,
		}
	}

	if (!(containerWidth > 0)) {
		return items.map((item, index) => ({
			cells: [
				{
					id: item.id,
					width: targetRowHeight * layoutAspectRatio(item),
					height: targetRowHeight,
				},
			],
			height: targetRowHeight,
			isLastRow: index === items.length - 1,
		}))
	}

	const rows: JustifiedRow[] = []
	let current: LayoutItem[] = []
	let ratioSum = 0

	for (const item of items) {
		current.push(item)
		ratioSum += layoutAspectRatio(item)
		const gaps = options.gap * Math.max(current.length - 1, 0)
		const frameBudget = options.frame * 2 * current.length
		const rowWidthAtTarget = ratioSum * targetRowHeight + gaps + frameBudget
		if (rowWidthAtTarget >= containerWidth) {
			rows.push(closeRow(current, ratioSum, false))
			current = []
			ratioSum = 0
		}
	}

	if (current.length > 0) rows.push(closeRow(current, ratioSum, true))
	const last = rows[rows.length - 1]
	if (last) last.isLastRow = true
	return rows
}

export type { JustifiedRow, LayoutItem }
export { flattenJustifiedOrder } from '../../portfolio/layout.ts'
