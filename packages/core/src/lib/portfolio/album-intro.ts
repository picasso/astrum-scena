// album page description header: a decorative mosaic of all album photos beside the description
// text; rendered by album-intro.astro

// an empty description yields no paragraphs, so the header is not rendered
export function descriptionParagraphs(description: string | undefined): string[] {
	return (description ?? '')
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
		.filter((paragraph) => paragraph !== '')
}

// the mosaic must not be noticeably taller than the text beside it, so at build time the desktop
// text height is estimated from paragraph lengths and columns and tile size are picked to fit it;
// gap and radius scale with the tile (10 and 6 at 88px, owner-calibrated). The estimate is rough
// because the text column width depends on the screen: it prevents a gross mismatch, not an exact
// match
export const MOSAIC_TILE_MAX_PX = 88
export const MOSAIC_TILE_MIN_PX = 24

// desktop header geometry: `.gallery-aside` is 1024px wide at 1440, 2rem column gap, 16px / 1.5
// text, 1em paragraph gap; the mean Ubuntu 16px glyph width per locale (`charWidthPx` of the site's
// `content.catalog`) was measured on a real description, and +5 % covers word-wrap loss
const HEADER_WIDTH_PX = 1024
const COLUMN_GAP_PX = 32
const LINE_HEIGHT_PX = 24
const PARAGRAPH_GAP_PX = 16
const WRAP_LOSS = 1.05
// the text keeps at least half the header, so the mosaic stays a narrow side column
const MOSAIC_MAX_WIDTH_PX = HEADER_WIDTH_PX / 2 - COLUMN_GAP_PX
// keeps the mosaic from stretching into a strip; only many photos beside short text ever hit it
const MOSAIC_MAX_ASPECT = 2.5

export type MosaicLayout = { columns: number; tile: number; gap: number; radius: number }

export function mosaicGap(tile: number): number {
	return Math.max(3, Math.round(tile * 0.115))
}

export function mosaicRadius(tile: number): number {
	return Math.max(2, Math.round(tile * 0.07))
}

function mosaicSize(count: number, columns: number, tile: number) {
	const rows = Math.ceil(count / columns)
	const gap = mosaicGap(tile)
	return {
		rows,
		width: columns * tile + (columns - 1) * gap,
		height: rows * tile + (rows - 1) * gap,
	}
}

export function estimateTextHeight(
	paragraphs: readonly string[],
	textWidth: number,
	charWidthPx: number,
): number {
	const perLine = charWidthPx * WRAP_LOSS
	const lines = paragraphs.reduce(
		(sum, paragraph) => sum + Math.max(1, Math.ceil((paragraph.length * perLine) / textWidth)),
		0,
	)
	return lines * LINE_HEIGHT_PX + Math.max(0, paragraphs.length - 1) * PARAGRAPH_GAP_PX
}

export function mosaicLayout(
	count: number,
	paragraphs: readonly string[],
	charWidthPx: number,
): MosaicLayout {
	const photos = Math.max(1, count)
	type Candidate = MosaicLayout & { fits: boolean; overshoot: number; rows: number }
	let best: Candidate | undefined

	const better = (a: Candidate, b: Candidate | undefined): boolean => {
		if (!b) return true
		if (a.fits !== b.fits) return a.fits
		// prefer a larger tile among fitting layouts, the smallest overshoot when none fits
		if (!a.fits && a.overshoot !== b.overshoot) return a.overshoot < b.overshoot
		if (a.tile !== b.tile) return a.tile > b.tile
		// equal tiles: prefer a squarer mosaic, then fewer empty cells
		const squareness = Math.abs(a.columns - a.rows) - Math.abs(b.columns - b.rows)
		if (squareness !== 0) return squareness < 0
		return a.columns * a.rows - photos < b.columns * b.rows - photos
	}

	for (let columns = 1; columns <= photos; columns += 1) {
		for (let tile = MOSAIC_TILE_MAX_PX; tile >= MOSAIC_TILE_MIN_PX; tile -= 1) {
			const size = mosaicSize(photos, columns, tile)
			if (size.width > MOSAIC_MAX_WIDTH_PX) continue
			// the aspect barely depends on tile size, so a too-wide column count is skipped whole
			if (size.width > size.height * MOSAIC_MAX_ASPECT) break
			const textHeight = estimateTextHeight(
				paragraphs,
				HEADER_WIDTH_PX - COLUMN_GAP_PX - size.width,
				charWidthPx,
			)
			const fits = size.height <= textHeight
			if (fits || tile === MOSAIC_TILE_MIN_PX) {
				const candidate: Candidate = {
					columns,
					tile,
					gap: mosaicGap(tile),
					radius: mosaicRadius(tile),
					rows: size.rows,
					fits,
					overshoot: size.height - textHeight,
				}
				if (better(candidate, best)) best = candidate
				break
			}
		}
	}

	// a single column of minimum tiles always fits width and aspect, so a candidate always exists
	if (!best) throw new Error('mosaicLayout: no candidate layout')
	return { columns: best.columns, tile: best.tile, gap: best.gap, radius: best.radius }
}
