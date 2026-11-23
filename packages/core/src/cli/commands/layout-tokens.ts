import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { loadSiteSection } from '../../config/loader.ts'
import { LAYOUT_TOKENS_RELATIVE_PATH, serializeLayoutTokens } from '../../lib/layout-tokens.ts'
import { type CliContext, label } from '../context.ts'

// a pure projection of `layout` in the site's lock, so a rerun is safe in any state and
// byte-identical
export function layoutTokens(context: CliContext): number {
	const outputPath = path.join(context.root, LAYOUT_TOKENS_RELATIVE_PATH)
	const layout = loadSiteSection(context.root, 'layout')

	mkdirSync(path.dirname(outputPath), { recursive: true })
	const tempPath = `${outputPath}.tmp`
	writeFileSync(tempPath, serializeLayoutTokens(layout), 'utf8')
	renameSync(tempPath, outputPath)

	context.out('layout-tokens OK')
	context.out(`  path:     ${label(context, outputPath)}`)
	context.out(`  prose:    ${layout.prose}px`)
	context.out(`  medium:   ${layout.medium}px`)
	context.out(`  standard: ${layout.standard}px`)
	context.out(`  gallery:  ${layout.gallery}px`)
	return 0
}
