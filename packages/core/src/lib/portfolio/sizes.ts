import type { ResolvedAlbumLayout } from './album-layout.ts'
import { type PortfolioSurface, SURFACE_MEDIA } from './surface.ts'

function cappedWidth(surface: PortfolioSurface): number {
	const width = SURFACE_MEDIA[surface].maxWidth
	if (width === undefined) throw new Error(`surface "${surface}" has no media width cap`)
	return width
}

// HTML `sizes` follows component geometry; `SURFACE_MEDIA` independently caps selected files.
// Preview surfaces use at most 800 px, footer thumbnails 400 px. Banner, primary photo and
// PhotoSwipe use the full ladder. documentListItem at gallery width is the ADR-0008 2× exception.
// galleryCell, wrapAround and contactsAside calculate sizes from their live layout below.
export const SURFACE_SIZES: Record<
	Exclude<PortfolioSurface, 'photoswipeSlide' | 'galleryCell' | 'wrapAround' | 'contactsAside'>,
	string
> = {
	// masonry min-column 300: 1 column below ~640px, 2 up to ~960px, then 4 in the 1440 container
	// (340px; ×2 = 680 stays under the 800 px preview cap)
	portfolioCard: '(max-width: 640px) 100vw, (max-width: 960px) 50vw, 25vw',
	documentCard: '(max-width: 640px) 100vw, (max-width: 960px) 50vw, 25vw',
	// the legacy theme's 45/55 image-text row stacks below the breakpoint; one literal serves both
	// prose and gallery widths, so it takes the upper estimate: slightly generous on prose, never
	// blurry
	documentListItem: '(max-width: 1023px) 100vw, 45vw',
	relatedPhoto: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px',
	// footer Recent Works: ~160px thumbnails, 3 columns on narrow screens and 6 on wide ones
	footerThumb: '(max-width: 640px) 30vw, 160px',
	albumGrid: '(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 400px',
	bannerHero: '100vw',
	photoPrimary: '(max-width: 1200px) 100vw, 1200px',
}

// the Wrap Around block: `--container-prose:680px` includes two 16px page paddings, so the real
// column is 648px. The container query stacks the float at prose <=480px, i.e. viewport <=512px;
// between 512 and 680 the media is widthPercent of `(100vw - 32px)`, above 680 of the fixed 648px
const PROSE_OUTER_WIDTH_PX = 680
const PROSE_INLINE_PADDING_PX = 32
const PROSE_INNER_WIDTH_PX = PROSE_OUTER_WIDTH_PX - PROSE_INLINE_PADDING_PX
const WRAP_STACK_CONTAINER_WIDTH_PX = 480
const WRAP_STACK_VIEWPORT_WIDTH_PX = WRAP_STACK_CONTAINER_WIDTH_PX + PROSE_INLINE_PADDING_PX
const WRAP_SAFE_SLOT_PERCENT = 50

function roundLayoutValue(value: number): number {
	return Math.round(value * 100) / 100
}

function fluidProseSize(percent: number): string {
	const inlineInset = roundLayoutValue((PROSE_INLINE_PADDING_PX * percent) / 100)
	return `calc(${percent}vw - ${inlineInset}px)`
}

export function wrapAroundSizes(widthPercent: number, outsidePercent = 0): string {
	const inlineInset = Math.round(((PROSE_INLINE_PADDING_PX * widthPercent) / 100) * 100) / 100
	const maxWidth = Math.round((PROSE_INNER_WIDTH_PX * widthPercent) / 100)
	const ordinarySizes =
		`(max-width: ${WRAP_STACK_VIEWPORT_WIDTH_PX}px) ` +
		`calc(100vw - ${PROSE_INLINE_PADDING_PX}px), ` +
		`(max-width: ${PROSE_OUTER_WIDTH_PX}px) calc(${widthPercent}vw - ${inlineInset}px), ` +
		`${maxWidth}px`

	// without outside there is no safe-collapse mode. With outside, the float slot may grow only to
	// max(50%, width-outside); after that the visual media shrinks while the remaining breakout closes.
	const collapsedPercent = Math.min(
		widthPercent,
		Math.max(WRAP_SAFE_SLOT_PERCENT, widthPercent - outsidePercent),
	)
	if (outsidePercent <= 0 || collapsedPercent >= widthPercent) return ordinarySizes

	const collapsedPx = (PROSE_INNER_WIDTH_PX * collapsedPercent) / 100
	const transitionEnd = roundLayoutValue(
		PROSE_OUTER_WIDTH_PX + (2 * PROSE_INNER_WIDTH_PX * (widthPercent - collapsedPercent)) / 100,
	)
	const halfViewportOffset = roundLayoutValue(collapsedPx - PROSE_OUTER_WIDTH_PX / 2)
	const transitionSize =
		halfViewportOffset === 0
			? '50vw'
			: `calc(50vw ${halfViewportOffset < 0 ? '-' : '+'} ${Math.abs(halfViewportOffset)}px)`

	return (
		`(max-width: ${WRAP_STACK_VIEWPORT_WIDTH_PX}px) calc(100vw - ${PROSE_INLINE_PADDING_PX}px), ` +
		`(max-width: ${PROSE_OUTER_WIDTH_PX}px) ${fluidProseSize(collapsedPercent)}, ` +
		`(max-width: ${transitionEnd}px) ${transitionSize}, ` +
		`${maxWidth}px`
	)
}

// the contacts image: below 768 it stacks at full width minus 2×16 page padding. From 768 the
// column is widthPercent of `container − gap`: up to 960 the container is fluid `100vw − 32px` with
// a ≈4vw gap, giving `(96vw − 32px)·p`; above that the medium container leaves `928 − 40` = 888px
// `cropScale` is how much wider than the column a cover-cropped `<img>` renders when the frame is
// narrower than the photo
const CONTACTS_STACK_BELOW_PX = 768
const CONTACTS_FLUID_UNTIL_PX = 960
const CONTACTS_FIXED_ROW_PX = 888

export function contactsAsideSizes(widthPercent: number, cropScale = 1): string {
	const scale = Math.max(1, cropScale)
	const share = (widthPercent / 100) * scale
	const stackVw = roundLayoutValue(100 * scale)
	const stackInset = roundLayoutValue(PROSE_INLINE_PADDING_PX * scale)
	const fluidVw = roundLayoutValue(96 * share)
	const fluidInset = roundLayoutValue(PROSE_INLINE_PADDING_PX * share)
	const fixed = Math.round(CONTACTS_FIXED_ROW_PX * share)
	return (
		`(max-width: ${CONTACTS_STACK_BELOW_PX - 1}px) calc(${stackVw}vw - ${stackInset}px), ` +
		`(max-width: ${CONTACTS_FLUID_UNTIL_PX}px) calc(${fluidVw}vw - ${fluidInset}px), ` +
		`${fixed}px`
	)
}

// a Gallery block cell: the literal depends on columns and layout, not only on the role, hence a
// function rather than a SURFACE_SIZES entry. The estimate is capped at the largest grid
// derivative, since promising more than the manifest holds gains nothing
const GALLERY_MAX_DERIVATIVE_PX = cappedWidth('galleryCell')
const FULL_WIDTH_CONTAINER_PX = 1440

export function gallerySizes(columns: number, layout: 'rect' | 'square' | 'justified'): string {
	// a justified cell width depends on aspect (a panorama can be far wider than
	// container/columns), so without runtime row geometry the derivative cap is the only safe
	// estimate
	const cell =
		layout === 'justified'
			? GALLERY_MAX_DERIVATIVE_PX
			: Math.min(GALLERY_MAX_DERIVATIVE_PX, Math.round(FULL_WIDTH_CONTAINER_PX / columns))
	return `(max-width: 700px) 90vw, ${cell}px`
}

export function moreDocumentsSizes(
	layout: 'grid' | 'masonry' | 'list',
	width: 'prose' | 'medium' | 'wide',
	columns?: number,
): string {
	if (layout === 'list') return SURFACE_SIZES.documentListItem
	if (layout === 'masonry')
		return width === 'wide' ? '(max-width: 640px) 100vw, 25vw' : SURFACE_SIZES.documentCard
	const maximum = Math.max(1, columns ?? 1)
	const cap = cappedWidth('documentCard')
	const wideCell = Math.min(cap, Math.ceil(1200 / maximum))
	const mediumCell = Math.min(cap, Math.ceil(960 / maximum))
	const proseCell = Math.min(cap, Math.ceil(680 / maximum))
	const cell = width === 'wide' ? wideCell : width === 'medium' ? mediumCell : proseCell
	return `(max-width: 640px) 100vw, ${cell}px`
}

// surface `sizes` for grids in the `.gallery-aside` layout (album list on the side): album page and the
// Portfolio index. The grid width follows the page layout (`.gallery-aside` in gallery-aside.css, gallery
// container 1440 with 16px page padding):
//   • viewport < 1024 — full-width grid: W = V − 32;
//   • viewport ≥ 1024 — right column, 75 % minus a 2rem gap: W = 0.75·(min(V, 1440) − 32) − 32 (≤ 1024).
// Column count uses the CSS formula: masonry is CSS columns (`column-width` = minimum, `column-count` =
// maximum), crop grids are `auto-fill` with min/max columns. Each viewport range with a fixed column count
// gets the exact cell width, so the browser fetches neither an oversized nor an undersized derivative.
// Justified keeps the previous estimate, since its width depends on aspect ratios.
const ALBUM_ASIDE_BREAKPOINT_PX = 1024
const ALBUM_PAGE_PADDING_PX = 32
const ALBUM_ASIDE_GAP_PX = 32
const ALBUM_GALLERY_MAX_PX = 1440
const ALBUM_TILE_MIN_PX = 240

export type GalleryAsideColumnRule = {
	// must match the CSS formula of the layout mode
	columns: (width: number) => number
	gap: number
}

export function galleryAsideContainerWidth(viewport: number): number {
	if (viewport < ALBUM_ASIDE_BREAKPOINT_PX) return viewport - ALBUM_PAGE_PADDING_PX
	const inner = Math.min(viewport, ALBUM_GALLERY_MAX_PX) - ALBUM_PAGE_PADDING_PX
	return 0.75 * inner - ALBUM_ASIDE_GAP_PX
}

export function masonryColumns(
	width: number,
	settings: { minColumnWidth: number; gap: number; maxColumns: number },
): number {
	const fit = Math.floor((width + settings.gap) / (settings.minColumnWidth + settings.gap))
	return Math.min(settings.maxColumns, Math.max(1, fit))
}

// `.card-grid` shows exactly `columns` from 720px and auto-fits 220px tiles below that
const CARD_GRID_EXACT_FROM_PX = 720
const CARD_GRID_TILE_MIN_PX = 220

export function cardGridColumns(width: number, settings: { columns: number; gap: number }): number {
	if (width >= CARD_GRID_EXACT_FROM_PX) return settings.columns
	return Math.max(1, Math.floor((width + settings.gap) / (CARD_GRID_TILE_MIN_PX + settings.gap)))
}

export function cropGridColumns(
	width: number,
	settings: { columns: number; gap: number; minColumns: number },
): number {
	const fit = Math.floor((width + settings.gap) / (ALBUM_TILE_MIN_PX + settings.gap))
	return Math.min(settings.columns, Math.max(settings.minColumns, fit))
}

function cellExpression(viewport: number, columns: number, gap: number): string {
	const gaps = (columns - 1) * gap
	if (viewport < ALBUM_ASIDE_BREAKPOINT_PX) {
		return `calc((100vw - ${ALBUM_PAGE_PADDING_PX + gaps}px) / ${columns})`
	}
	if (viewport < ALBUM_GALLERY_MAX_PX) {
		const offset = 0.75 * ALBUM_PAGE_PADDING_PX + ALBUM_ASIDE_GAP_PX + gaps
		return `calc((75vw - ${offset}px) / ${columns})`
	}
	return `${Math.ceil((galleryAsideContainerWidth(viewport) - gaps) / columns)}px`
}

export function galleryAsideColumnSizes(rule: GalleryAsideColumnRule): string {
	const parts: string[] = []
	let previous: string | undefined
	// walks every viewport pixel and merges runs with the same container regime and column count
	const keyAt = (viewport: number) => {
		const regime =
			viewport < ALBUM_ASIDE_BREAKPOINT_PX ? 0 : viewport < ALBUM_GALLERY_MAX_PX ? 1 : 2
		return `${regime}:${rule.columns(galleryAsideContainerWidth(viewport))}`
	}
	for (let viewport = 1; viewport <= ALBUM_GALLERY_MAX_PX; viewport += 1) {
		const key = keyAt(viewport)
		if (previous !== undefined && key !== previous) {
			const last = viewport - 1
			const columns = Number(previous.split(':')[1])
			parts.push(`(max-width: ${last}px) ${cellExpression(last, columns, rule.gap)}`)
		}
		previous = key
	}
	const columns = rule.columns(galleryAsideContainerWidth(ALBUM_GALLERY_MAX_PX))
	parts.push(cellExpression(ALBUM_GALLERY_MAX_PX, columns, rule.gap))
	return parts.join(', ')
}

// shared by album-grid.astro and the album-intro.astro mosaic: identical srcset and sizes make the
// browser pick the same file, so the mosaic reuses the cached grid image instead of a new download
export function albumGridSizes(resolved: ResolvedAlbumLayout): string {
	switch (resolved.layout) {
		case 'justified':
			return SURFACE_SIZES.albumGrid
		case 'masonry': {
			const settings = resolved.settings
			return galleryAsideColumnSizes({
				columns: (width) => masonryColumns(width, settings),
				gap: settings.gap,
			})
		}
		case 'square':
		case 'rect': {
			const settings = resolved.settings
			return galleryAsideColumnSizes({
				columns: (width) => cropGridColumns(width, settings),
				gap: settings.gap,
			})
		}
		default: {
			const unreachable: never = resolved
			throw new Error(`album layout "${String(unreachable)}" has no sizes`)
		}
	}
}
