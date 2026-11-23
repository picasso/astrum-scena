// variant enums owned by the schema layer: site-schema validates against them and lib/components read
// them from here, so config never depends on lib

// album card presentation on the Portfolio index, the single source for the schema (`portfolio.card`),
// components and tests:
//   • details     — the regular card: preview + title + excerpt (+ optional more);
//   • title-strip — preview + a compact title strip; excerpt/more are not rendered;
//   • title-slide — preview + title overlay; on hover devices the title slides in on hover/focus, on
//     touch/no-hover it stays visible. Excerpt/more are not rendered.
// changes only the card look: layout geometry, order, sidebar and routes stay the same
export const CARD_PRESENTATIONS = ['details', 'title-strip', 'title-slide'] as const

export type CardPresentation = (typeof CARD_PRESENTATIONS)[number]

// album page layout. `album.layout` in site.yaml is a site-level selector, while the settings of
// every implemented mode live next to it in their own strict block: an inactive block is validated
// like the active one and is kept on switching, so calibrated values come back with the mode. Runtime
// takes exactly one block, the selected mode's. A new mode is added atomically (enum value, settings
// block, resolver branch, renderer); an exhaustive switch keeps the enum from outrunning the code
export const ALBUM_LAYOUTS = ['justified', 'masonry', 'square', 'rect'] as const

export type AlbumLayout = (typeof ALBUM_LAYOUTS)[number]

// shapes of the legacy theme's decorative footer curve (`snippets/traits/curve.php`)
export const FOOTER_CURVE_SHAPES = [
	'upright',
	'upleft',
	'downleft',
	'downright',
	'lessdownleft',
	'lessdownright',
	'downleftinverse',
] as const

export type FooterCurveShape = (typeof FOOTER_CURVE_SHAPES)[number]

// portfolio index layout, the same principle as the album page (ALBUM_LAYOUTS):
// `portfolio.layout` selects the mode, the settings of each implemented mode live in site.yaml
// permanently and are validated even when inactive; runtime takes exactly one block. Cards of both modes
// are the shared Card with the selected `portfolio.card`.
export const PORTFOLIO_LAYOUTS = ['masonry', 'grid'] as const

export type PortfolioLayout = (typeof PORTFOLIO_LAYOUTS)[number]

// preview proportions in the even grid, the same set as the moreDocs grid (original is masonry-only)
export const CARD_GRID_RATIOS = ['pano', 'vista', 'landscape', 'square', 'portrait'] as const

export type CardGridRatio = (typeof CARD_GRID_RATIOS)[number]
