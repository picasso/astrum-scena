import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { CORE_ROOT } from '../core-root.ts'
import { GLOBAL_CSS } from '../integration-parts.ts'
import { layoutTokens, parseTokenList, THEME_FILE, themeTokenProblems } from './tokens.ts'

// the exported token list ships in the package (`files`), next to the rest of the API snapshot
export const CORE_TOKENS_FILE = path.join(CORE_ROOT, 'api-snapshot', 'tokens.json')

// the build and `astro dev` check the site's theme against the token list whenever the core
// stylesheet that imports it compiles. Tailwind inlines the `@import`, so the theme is never a module
// of its own: the check runs on the stylesheet and watches the theme, and an edit of the theme
// recompiles the stylesheet and runs it again
export function themeTokensPlugin(siteRoot: string, tokensFile = CORE_TOKENS_FILE) {
	const theme = path.resolve(siteRoot, THEME_FILE)
	let tokens: ReturnType<typeof parseTokenList> | undefined
	return {
		name: 'astrum-scena:theme-tokens',
		enforce: 'pre' as const,
		transform(this: { addWatchFile(id: string): void }, _code: string, id: string) {
			const file = path.resolve(id.split('?')[0]!)
			if (file !== GLOBAL_CSS && file !== theme) return undefined
			this.addWatchFile(theme)
			if (!existsSync(theme)) throw new Error(`${THEME_FILE}: the site has no theme file`)
			tokens ??= parseTokenList(readFileSync(tokensFile, 'utf8'), tokensFile)
			const problems = themeTokenProblems(readFileSync(theme, 'utf8'), tokens, layoutTokens())
			if (problems.length > 0)
				throw new Error(
					`theme tokens (the core's api-snapshot/tokens.json lists the names a theme may declare):\n  ${problems.join('\n  ')}`,
				)
			return undefined
		},
	}
}
