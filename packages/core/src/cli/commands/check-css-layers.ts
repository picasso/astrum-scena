import path from 'node:path'

import { type CliContext, coreSrcDir, sourceFiles, trees } from '../context.ts'
import { findCssLayerViolations, layersCss } from '../css-layers.ts'

// the cascade order is declared once in the core's layers.css, so the theme wins by layer order, not
// by specificity, only while no rule escapes a layer and every chunk declares the order first. Scans
// the installed core's sources and the site's `src/`
const SCANNED = /\.(?:css|astro|tsx?|mdx)$/

export function checkCssLayers(context: CliContext): number {
	const checked = trees(context)
	const files = [
		...sourceFiles(context, coreSrcDir(context), SCANNED),
		...sourceFiles(context, path.join(context.root, 'src'), SCANNED),
	]
	const violations = findCssLayerViolations(files, checked)
	if (violations.length > 0) {
		context.err('check css-layers FAILED:')
		for (const { file, line, message } of violations)
			context.err(`  - ${file}:${line}: ${message}`)
		context.err(
			`Wrap rules in @layer and start each entry stylesheet with @import of ${layersCss(checked.coreSrc)}.`,
		)
		return 1
	}
	context.out('check css-layers OK')
	return 0
}
