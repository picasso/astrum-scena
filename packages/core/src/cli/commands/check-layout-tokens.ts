import { readFileSync } from 'node:fs'
import path from 'node:path'

import { loadSiteSection } from '../../config/loader.ts'
import { LAYOUT_TOKENS_RELATIVE_PATH, verifyLayoutTokens } from '../../lib/layout-tokens.ts'
import { type CliContext, command, label } from '../context.ts'

// fails when the site's tracked CSS drifts from its config, i.e. widths were edited in only one of
// the two places
export function checkLayoutTokens(context: CliContext): number {
	const tokensPath = path.join(context.root, LAYOUT_TOKENS_RELATIVE_PATH)
	const regenerate = `Regenerate: ${command(context, 'layout-tokens')}.`
	const fail = (message: string): number => {
		context.err(`check layout-tokens FAIL: ${message}`)
		return 1
	}
	let raw: string
	try {
		raw = readFileSync(tokensPath, 'utf8')
	} catch (error) {
		return fail(
			`tracked CSS tokens missing (${label(context, tokensPath)}) — ` +
				`${(error as Error).message}. ${regenerate}`,
		)
	}
	const verdict = verifyLayoutTokens(raw, loadSiteSection(context.root, 'layout'))
	if (!verdict.ok) return fail(`${verdict.reason} (${label(context, tokensPath)}). ${regenerate}`)
	context.out('check layout-tokens OK')
	context.out(`  path: ${label(context, tokensPath)}`)
	return 0
}
