import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it, vi } from 'vitest'

import { siteRoot } from '../config/site-root.ts'
import { GLOBAL_CSS } from '../integration-parts.ts'
import {
	declaredTokens,
	layoutTokens,
	parseTokenList,
	THEME_FILE,
	themeTokenProblems,
	type TokenList,
} from './tokens.ts'
import { CORE_TOKENS_FILE, themeTokensPlugin } from './tokens-plugin.ts'

const TOKENS: TokenList = {
	'--color-accent': 'required',
	'--color-alt': 'required',
	'--font-sans': 'optional',
	'--container-prose': 'required',
}
const LAYOUT = ['--container-prose']
const VALID = ':root { --color-accent: #fff; --color-alt: #000; }'

const demoTheme = readFileSync(path.join(siteRoot, THEME_FILE), 'utf8')
const coreTokens = parseTokenList(readFileSync(CORE_TOKENS_FILE, 'utf8'), CORE_TOKENS_FILE)

describe('themeTokenProblems', () => {
	it("passes the demo's theme against the exported list", () => {
		expect(themeTokenProblems(demoTheme, coreTokens, layoutTokens())).toEqual([])
	})

	it('names an unknown token with the file', () => {
		expect(
			themeTokenProblems(`${VALID} :root { --color-acent: red; }`, TOKENS, LAYOUT),
		).toEqual(['src/theme/theme.css: unknown tokens: --color-acent'])
	})

	it('names a layout token as generated from site.yaml', () => {
		expect(
			themeTokenProblems(`${VALID} :root { --container-prose: 700px; }`, TOKENS, LAYOUT),
		).toEqual([
			'src/theme/theme.css: layout tokens are generated from site.yaml layout.*, not declared in the theme: --container-prose',
		])
	})

	it('names every required token the theme leaves out', () => {
		expect(themeTokenProblems(':root { --font-sans: serif; }', TOKENS, LAYOUT)).toEqual([
			'src/theme/theme.css: missing required tokens: --color-accent, --color-alt',
		])
	})

	it('lets the theme override a token Tailwind defines, or leave it out', () => {
		expect(
			themeTokenProblems(`${VALID} :root { --font-sans: 'Inter'; }`, TOKENS, LAYOUT),
		).toEqual([])
		expect(themeTokenProblems(VALID, TOKENS, LAYOUT)).toEqual([])
	})

	it('reads names only, outside comments, and reports in the given file', () => {
		const css = `/* --color-acent: x; */ ${VALID} .a { color: var(--color-unknown); }`
		expect(themeTokenProblems(css, TOKENS, LAYOUT, 'sites/a/src/theme/theme.css')).toEqual([])
		expect(
			themeTokenProblems(':root{}', TOKENS, LAYOUT, 'sites/a/src/theme/theme.css'),
		).toEqual([
			'sites/a/src/theme/theme.css: missing required tokens: --color-accent, --color-alt',
		])
	})

	it("takes the layout tokens from the generator and lists them in the core's contract", () => {
		expect(layoutTokens()).toEqual([
			'--container-gallery',
			'--container-medium',
			'--container-prose',
			'--container-standard',
		])
		for (const name of layoutTokens()) expect(coreTokens[name]).toBe('required')
		expect(declaredTokens(':root { --b: 1; --a: 2; --b: 3; }')).toEqual(['--a', '--b'])
	})

	it('ignores a name inside a quoted string', () => {
		const css = `${VALID} .a::before { content: "--color-acent: x"; } .b { content: '--color-alt: y'; }`
		expect(declaredTokens(css)).toEqual(['--color-accent', '--color-alt'])
		expect(themeTokenProblems(css, TOKENS, LAYOUT)).toEqual([])
		expect(
			themeTokenProblems(
				`:root { --color-accent: x; } .a { content: '--color-alt: y'; }`,
				TOKENS,
				LAYOUT,
			),
		).toEqual(['src/theme/theme.css: missing required tokens: --color-alt'])
	})
})

describe('parseTokenList', () => {
	it('rejects anything but a map of token names to a use', () => {
		expect(() => parseTokenList('["--a"]', 'tokens.json')).toThrow(
			'tokens.json: not a token list',
		)
		expect(() => parseTokenList('{"--a":"maybe"}', 'tokens.json')).toThrow(
			'tokens.json: not a token list',
		)
		expect(() => parseTokenList('{"a":"required"}', 'tokens.json')).toThrow(
			'tokens.json: not a token list',
		)
	})
})

describe('themeTokensPlugin', () => {
	const scratch: string[] = []
	afterAll(() => {
		for (const dir of scratch) rmSync(dir, { force: true, recursive: true })
	})

	// a temporary site with the given theme; the list is the core's own
	function siteWith(theme: string | undefined): string {
		const root = mkdtempSync(path.join(tmpdir(), 'astrum-scena-theme-'))
		scratch.push(root)
		if (theme !== undefined) {
			mkdirSync(path.join(root, 'src', 'theme'), { recursive: true })
			writeFileSync(path.join(root, THEME_FILE), theme)
		}
		return root
	}

	const transformOf = (root: string) => {
		const addWatchFile = vi.fn()
		const plugin = themeTokensPlugin(root)
		const transform = (id: string) => plugin.transform.call({ addWatchFile }, '', id)
		return { transform, addWatchFile }
	}

	it("checks the site's theme when the core stylesheet compiles and watches it", () => {
		const root = siteWith(demoTheme)
		const { transform, addWatchFile } = transformOf(root)
		expect(transform(`${GLOBAL_CSS}?direct`)).toBeUndefined()
		expect(addWatchFile).toHaveBeenCalledWith(path.join(root, THEME_FILE))
	})

	it('fails on an unknown token, with the file and the name', () => {
		const { transform } = transformOf(siteWith(`${demoTheme}\n:root { --color-acent: red; }\n`))
		expect(() => transform(GLOBAL_CSS)).toThrow(
			'src/theme/theme.css: unknown tokens: --color-acent',
		)
	})

	it('runs on the theme itself and ignores other modules', () => {
		const root = siteWith(':root {}')
		const { transform, addWatchFile } = transformOf(root)
		expect(transform(path.join(path.dirname(GLOBAL_CSS), 'prose.css'))).toBeUndefined()
		expect(addWatchFile).not.toHaveBeenCalled()
		expect(() => transform(path.join(root, THEME_FILE))).toThrow(
			/missing required tokens: .*--color-accent/,
		)
	})

	it('fails a site without a theme file', () => {
		const { transform } = transformOf(siteWith(undefined))
		expect(() => transform(GLOBAL_CSS)).toThrow(
			'src/theme/theme.css: the site has no theme file',
		)
	})
})
