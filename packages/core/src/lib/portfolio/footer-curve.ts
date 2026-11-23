import type { FooterCurveShape } from '../../config/variants.ts'

// port of the legacy theme's decorative footer curve; templates, ratios and the inverse list are
// copied verbatim. PHP int() truncates toward zero, and height is always a positive integer, so
// Math.trunc matches it

type CurveTemplate = {
	r1: number
	r2: number
	// a = int(height·r1), b = int(height·r2).
	path: (a: number, b: number) => string
}

const CURVE_TEMPLATES: Record<FooterCurveShape, CurveTemplate> = {
	upright: { r1: 1, r2: 0.33, path: (a, b) => `M0 ${a} C 50 0 80 -${b} 100 ${a} Z` },
	upleft: { r1: 1, r2: 0.33, path: (a, b) => `M0 ${a} C 20 -${b} 30 0 100 ${a} Z` },
	downleft: { r1: 2, r2: 0, path: (a) => `M0 0 C 20 ${a} 50 0 100 0 Z` },
	downright: { r1: 2, r2: 0, path: (a) => `M0 0 C 50 0 80 ${a} 100 0 Z` },
	lessdownleft: { r1: 1.33, r2: 0, path: (a) => `M0 0 C 20 ${a} 50 0 100 0 Z` },
	lessdownright: { r1: 1.33, r2: 0, path: (a) => `M0 0 C 50 0 80 ${a} 100 0 Z` },
	downleftinverse: {
		r1: 1,
		r2: 0,
		path: (a) => `M100,0 L100,${a} L0,${a} L0,0 L100,0 z M100,0 L0,0 C20,135 50,0 100,0 z`,
	},
}

// downleftinverse is absent despite its name, exactly as in the legacy theme
const INVERSE_SHAPES = new Set<FooterCurveShape>([
	'downleft',
	'downright',
	'lessdownleft',
	'lessdownright',
])

export type FooterCurveModel = {
	path: string
	viewBox: string
	height: number
	inverse: boolean
}

export function buildFooterCurve(shape: FooterCurveShape, height: number): FooterCurveModel {
	const template = CURVE_TEMPLATES[shape]
	const a = Math.trunc(height * template.r1)
	const b = Math.trunc(height * template.r2)
	return {
		path: template.path(a, b),
		viewBox: `0 0 100 ${height}`,
		height,
		inverse: INVERSE_SHAPES.has(shape),
	}
}
