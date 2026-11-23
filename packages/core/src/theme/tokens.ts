import { serializeLayoutTokens } from '../lib/layout-tokens.ts'

// the theme contract by names only: a site's theme declares the tokens the core exports in
// `api-snapshot/tokens.json` and nothing else. A value is never parsed, so a theme stays free to write
// any CSS a token takes.

// relative to the site root
export const THEME_FILE = 'src/theme/theme.css'

// `required`: the core reads it without a fallback and nothing else defines it; `optional`: the core
// reads it with a fallback or Tailwind defines it, so the site may override it
export type TokenUse = 'required' | 'optional'
export type TokenList = Readonly<Record<string, TokenUse>>

// comments and quoted strings, in one left-to-right pass so neither can hide or fake the other
const NOT_DECLARATIONS = /\/\*[\s\S]*?\*\/|'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"/g
const DECLARATION = /(--[\w-]+)\s*:/g

export const declaredTokens = (css: string): string[] =>
	[
		...new Set(
			[...css.replace(NOT_DECLARATIONS, '').matchAll(DECLARATION)].map(([, name]) => name!),
		),
	].sort()

// the generated layout tokens are named by their generator, whatever the widths
export const layoutTokens = (): string[] =>
	declaredTokens(serializeLayoutTokens({ prose: 0, medium: 0, standard: 0, gallery: 0 }))

// every way the theme breaks the contract, each line naming the file and the tokens; empty when it holds
export function themeTokenProblems(
	themeCss: string,
	tokens: TokenList,
	layout: readonly string[],
	file = THEME_FILE,
): string[] {
	const declared = declaredTokens(themeCss)
	const generated = new Set(layout)
	const declaredSet = new Set(declared)
	const unknown = declared.filter((name) => !generated.has(name) && !Object.hasOwn(tokens, name))
	const fromLayout = declared.filter((name) => generated.has(name))
	const missing = Object.entries(tokens)
		.filter(
			([name, use]) => use === 'required' && !generated.has(name) && !declaredSet.has(name),
		)
		.map(([name]) => name)
		.sort()
	const problems: string[] = []
	if (unknown.length > 0) problems.push(`${file}: unknown tokens: ${unknown.join(', ')}`)
	if (fromLayout.length > 0)
		problems.push(
			`${file}: layout tokens are generated from site.yaml layout.*, not declared in the theme: ${fromLayout.join(', ')}`,
		)
	if (missing.length > 0) problems.push(`${file}: missing required tokens: ${missing.join(', ')}`)
	return problems
}

// the parsed `tokens.json`; anything but a map of names to a use is a broken package
export function parseTokenList(json: string, file: string): TokenList {
	const value = JSON.parse(json) as unknown
	if (
		value === null ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		!Object.entries(value).every(
			([name, use]) => name.startsWith('--') && (use === 'required' || use === 'optional'),
		)
	)
		throw new Error(`${file}: not a token list (a map of --names to "required" | "optional")`)
	return value as TokenList
}
