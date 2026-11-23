import path from 'node:path'

import { exemptFiles, findColorLiteralViolations, THEME_FILE } from '../color-literals.ts'
import { type CliContext, coreSrcDir, label, sourceFiles, trees } from '../context.ts'
import { sitePath } from '../trees.ts'

// a site changes its colors in the theme file alone, so no CSS outside it may carry a color literal —
// core rules reference theme tokens instead. Scans the installed core's sources and the site's `src/`
const SCANNED = /\.(?:css|astro)$/

export function checkColorLiterals(context: CliContext): number {
	const { siteRoot } = trees(context)
	const files = [
		...sourceFiles(context, coreSrcDir(context), SCANNED),
		...sourceFiles(context, path.join(context.root, 'src'), SCANNED),
	]
	const violations = findColorLiteralViolations(files, exemptFiles(siteRoot))
	if (violations.length > 0) {
		context.err('check color-literals FAILED — color literals outside the theme file:')
		for (const { file, line, value } of violations) context.err(`  - ${file}:${line}: ${value}`)
		context.err(
			`Declare the color as a token in ${sitePath(siteRoot, THEME_FILE)} and reference it with var().`,
		)
		return 1
	}
	context.out(
		`check color-literals OK (${label(context, coreSrcDir(context))}, ${sitePath(siteRoot, 'src')})`,
	)
	return 0
}
