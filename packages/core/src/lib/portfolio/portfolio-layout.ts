import type { CardGridRatio, PortfolioLayout } from '../../config/variants.ts'
import type { MasonryConfig } from './layout.ts'

export type CardGridConfig = {
	columns: number
	gap: number
	ratio: CardGridRatio
}

export type PortfolioLayoutConfig = {
	layout: PortfolioLayout
	masonry: MasonryConfig
	grid: CardGridConfig
}

export type ResolvedPortfolioLayout =
	{ layout: 'masonry'; settings: MasonryConfig } | { layout: 'grid'; settings: CardGridConfig }

export function resolvePortfolioLayout(config: PortfolioLayoutConfig): ResolvedPortfolioLayout {
	const layout = config.layout
	switch (layout) {
		case 'masonry':
			return { layout, settings: config.masonry }
		case 'grid':
			return { layout, settings: config.grid }
		default: {
			const unreachable: never = layout
			throw new Error(`portfolio layout "${String(unreachable)}" has no renderer`)
		}
	}
}
