import type { AlbumLayout } from '../../config/variants.ts'
import type { JustifiedConfig, MasonryConfig } from './layout.ts'

// cropped grid (square 1:1, rect 3:2): `columns` is the maximum, `minColumns` the minimum on a
// narrow container; in between a tile stays at least 240px wide (same formula as Gallery)
export type CropGridConfig = {
	columns: number
	gap: number
	minColumns: 1 | 2
}

export type AlbumLayoutConfig = {
	layout: AlbumLayout
	justified: JustifiedConfig
	masonry: MasonryConfig
	square: CropGridConfig
	rect: CropGridConfig
}

// the viewer keeps the natural aspect, so zooming from a cropped thumbnail would jump; crop layouts
// open PhotoSwipe with a fade instead (same policy as Gallery square/rect)
export function isCropLayout(layout: AlbumLayout): boolean {
	return layout === 'square' || layout === 'rect'
}

export type ResolvedAlbumLayout =
	| { layout: 'justified'; settings: JustifiedConfig }
	| { layout: 'masonry'; settings: MasonryConfig }
	| { layout: 'square'; settings: CropGridConfig }
	| { layout: 'rect'; settings: CropGridConfig }

// `override` is the album's own `layout`
export function resolveAlbumLayout(
	config: AlbumLayoutConfig,
	override?: AlbumLayout,
): ResolvedAlbumLayout {
	const layout = override ?? config.layout
	switch (layout) {
		case 'justified':
			return { layout, settings: config.justified }
		case 'masonry':
			return { layout, settings: config.masonry }
		case 'square':
			return { layout, settings: config.square }
		case 'rect':
			return { layout, settings: config.rect }
		default: {
			const unreachable: never = layout
			throw new Error(`album layout "${String(unreachable)}" has no renderer`)
		}
	}
}
