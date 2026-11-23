import { describe, expect, it } from 'vitest'

import {
	exemptFiles,
	findAstroColorLiterals,
	findColorLiterals,
	findColorLiteralViolations,
	THEME_FILE,
} from './color-literals.ts'

const values = (css: string): string[] => findColorLiterals(css).map(({ value }) => value)

describe('findColorLiterals', () => {
	it('reports a literal in a rule with its line and value', () => {
		expect(findColorLiterals('.a {\n\tcolor: #fff;\n}')).toEqual([{ line: 2, value: '#fff' }])
	})

	it('flags every literal form: hex, color functions and named colors', () => {
		expect(values('.a { color: #A1b2C3d4; }')).toEqual(['#A1b2C3d4'])
		expect(values('.a { box-shadow: 0 0 1px rgb(0 0 0 / 70%); }')).toEqual(['rgb(0 0 0 / 70%)'])
		for (const fn of ['rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch'])
			expect(values(`.a { color: ${fn}(1 2 3); }`)).toEqual([`${fn}(1 2 3)`])
		expect(values('.a { border-color: black; }')).toEqual(['black'])
		expect(values('.a { color: White; }')).toEqual(['White'])
	})

	it('flags a literal inside a custom property declaration', () => {
		expect(values('.contact-form { --cf-ok: #66cc52; }')).toEqual(['#66cc52'])
		expect(values('.a { --_tone: #fff; --1: red; }')).toEqual(['#fff', 'red'])
	})

	it('keeps comment markers and escaped quotes inside strings from hiding a literal', () => {
		expect(values('.a { content: "/*"; color: #fff; content: "*/"; }')).toEqual(['#fff'])
		expect(values('.a { content: "\\""; color: #fff; content: "x"; }')).toEqual(['#fff'])
	})

	it('keeps an escaped parenthesis inside url()', () => {
		expect(values('.a { background: url(foo\\)red); }')).toEqual([])
	})

	it('flags a literal nested in color-mix or a var() fallback', () => {
		expect(values('.a { color: color-mix(in srgb, #fff 92%, var(--note-fill)); }')).toEqual([
			'#fff',
		])
		expect(values('.a { border-color: color-mix(in srgb, var(--x) 60%, black); }')).toEqual([
			'black',
		])
		expect(values('.a { color: var(--color-accent, #fcbf00); }')).toEqual(['#fcbf00'])
	})

	it('allows keywords, var() and color-mix over var()', () => {
		const css = `.a {
			color: currentColor;
			background: transparent;
			border-color: inherit;
			outline-color: initial;
			fill: unset;
			--x: var(--color-on-image);
			box-shadow: 0 0 3px color-mix(in srgb, var(--color-shade) 30%, transparent);
		}`
		expect(values(css)).toEqual([])
	})

	it('ignores comments and mask properties', () => {
		expect(values('/* #363636 */ .a { color: var(--x); /* rgba(0, 0, 0, 0.5) */ }')).toEqual([])
		expect(values('.a { mask-image: linear-gradient(#000 80%, transparent); }')).toEqual([])
		expect(values('.a { -webkit-mask: linear-gradient(black, transparent); }')).toEqual([])
	})

	it('does not mistake selectors, property names, urls or strings for colors', () => {
		const css = `#fff, .white, a[href='#red'] { white-space: nowrap; }
			.a:hover { background: url(#red) no-repeat; content: 'black #000'; }
			@media (min-width: 1px) { .b { animation: red-pulse 1s; grid-area: tan-x; } }
			.c { background: url("data:image/svg+xml,%3Csvg stroke='%23fff'%3E"); }`
		expect(values(css)).toEqual([])
	})
})

describe('findAstroColorLiterals', () => {
	it('scans <style> blocks as CSS with source line numbers', () => {
		const source = [
			'---',
			"const label = 'red'",
			'---',
			'<p style="color: red">x</p>',
			'<style>',
			'\t.caption {',
			'\t\tbackground: linear-gradient(to top, rgb(0 0 0 / 70%), transparent);',
			'\t}',
			'</style>',
		].join('\n')
		expect(findAstroColorLiterals(source)).toEqual([{ line: 7, value: 'rgb(0 0 0 / 70%)' }])
	})

	it('finds hex colors and color functions in frontmatter, markup and scripts', () => {
		const source = [
			'---',
			'const shade = `opacity:0.5;background-color:#000`',
			'const icon = \'<rect fill="#1b1b1f"/>\'',
			'---',
			'<p style="color: hsl(0 0% 100% / 50%)">red</p>',
			'<a href="#top">x</a>',
			"<script>el.style.color = 'rgba(0, 0, 0, 0.5)'</script>",
			'<style>',
			'\t.a { color: var(--color-shade); }',
			'</style>',
		].join('\n')
		expect(findAstroColorLiterals(source)).toEqual([
			{ line: 2, value: '#000' },
			{ line: 3, value: '#1b1b1f' },
			{ line: 5, value: 'hsl(0 0% 100% / 50%)' },
			{ line: 7, value: 'rgba(0, 0, 0, 0.5)' },
		])
	})
})

describe('findColorLiteralViolations', () => {
	it("exempts only the site's theme file and generated layout tokens", () => {
		const literal = '.a { color: #fff; }'
		expect(
			findColorLiteralViolations(
				[
					{ file: `demo/${THEME_FILE}`, source: literal },
					{ file: 'demo/src/generated/layout-tokens.css', source: literal },
					{ file: 'demo/src/styles/site.css', source: literal },
					{ file: `packages/core/src/${THEME_FILE}`, source: literal },
					{ file: 'packages/core/src/styles/global.css', source: literal },
					{
						file: 'packages/core/src/components/blocks/gallery.astro',
						source: `<style>${literal}</style>`,
					},
				],
				exemptFiles('demo'),
			),
		).toEqual([
			{ file: 'demo/src/styles/site.css', line: 1, value: '#fff' },
			{ file: `packages/core/src/${THEME_FILE}`, line: 1, value: '#fff' },
			{ file: 'packages/core/src/styles/global.css', line: 1, value: '#fff' },
			{ file: 'packages/core/src/components/blocks/gallery.astro', line: 1, value: '#fff' },
		])
	})

	it('resolves the exempt files from the given site root', () => {
		expect([...exemptFiles('sites/a')]).toEqual([
			'sites/a/src/theme/theme.css',
			'sites/a/src/generated/layout-tokens.css',
		])
		expect([...exemptFiles('.')]).toEqual([
			'src/theme/theme.css',
			'src/generated/layout-tokens.css',
		])
	})
})
