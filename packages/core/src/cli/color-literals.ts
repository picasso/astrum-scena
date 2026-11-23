import { LAYOUT_TOKENS_RELATIVE_PATH } from '../lib/layout-tokens.ts'
import { THEME_FILE } from '../theme/tokens.ts'
import { sitePath, type SourceFile } from './trees.ts'

// pure part of `astrum-scena check color-literals`: finds color literals in CSS declarations. Colors live in the
// site's theme file only; core rules reach them through `var(--…)` (optionally inside `color-mix`).
// Selectors, at-rule preludes, comments, strings, `url(…)` and mask properties are not color values. An
// `.astro` file is also scanned outside its `<style>` blocks, where colors hide in strings.

export type ColorLiteral = { line: number; value: string }
export type ColorLiteralViolation = ColorLiteral & { file: string }

// relative to the site root; the core's CSS has no exempt file
export { THEME_FILE }
const SITE_EXEMPT_FILES = [THEME_FILE, LAYOUT_TOKENS_RELATIVE_PATH]

export const exemptFiles = (siteRoot: string): ReadonlySet<string> =>
	new Set(SITE_EXEMPT_FILES.map((file) => sitePath(siteRoot, file)))

const MASK_PROPERTIES = new Set(['mask', 'mask-image', '-webkit-mask', '-webkit-mask-image'])

const COLOR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi
const IDENTIFIER = /(?<![\w-])-?[a-z_][\w-]*/gi
const DECLARATION = /^\s*(--[\w-]+|-?[a-z][\w-]*)\s*:([\s\S]*)$/i

// CSS Color 4 named colors; `transparent` and `currentColor` are allowed keywords, not literals
const NAMED_COLORS = new Set(
	(
		'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
		'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
		'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
		'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
		'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
		'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
		'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
		'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
		'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
		'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen ' +
		'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace ' +
		'olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred ' +
		'papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue ' +
		'saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey ' +
		'snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow ' +
		'yellowgreen'
	).split(' '),
)

// replaces a span with spaces, keeping newlines so offsets still map to source lines
const blank = (text: string): string => text.replace(/[^\n]/g, ' ')

// comments, strings and `url(…)` in one left-to-right pass, so none can hide or fake another; escapes
// (`\"`, `\)`) stay inside their token
export const NON_COLOR_TOKEN =
	/\/\*[\s\S]*?(?:\*\/|$)|'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|url\(\s*(?:'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|(?:\\[\s\S]|[^)\\])*)\s*\)/gi

const stripNonColorTokens = (css: string): string => css.replace(NON_COLOR_TOKEN, blank)

// the full `fn(…)` text starting at `start`, with nested parentheses balanced
function balancedCall(text: string, start: number): string {
	let depth = 0
	for (let index = start; index < text.length; index++) {
		if (text[index] === '(') depth++
		else if (text[index] === ')' && --depth === 0) return text.slice(start, index + 1)
	}
	return text.slice(start)
}

function literalsInValue(value: string): { offset: number; value: string }[] {
	const found: { offset: number; value: string }[] = []
	for (const match of value.matchAll(COLOR_FUNCTION))
		found.push({ offset: match.index, value: balancedCall(value, match.index) })
	for (const match of value.matchAll(HEX)) found.push({ offset: match.index, value: match[0] })
	for (const match of value.matchAll(IDENTIFIER))
		if (NAMED_COLORS.has(match[0].toLowerCase()))
			found.push({ offset: match.index, value: match[0] })
	return found.sort((a, b) => a.offset - b.offset)
}

export function findColorLiterals(css: string, firstLine = 1): ColorLiteral[] {
	const text = stripNonColorTokens(css)
	const lineAt = (offset: number): number =>
		firstLine + (text.slice(0, offset).match(/\n/g)?.length ?? 0)
	const found: ColorLiteral[] = []
	let segmentStart = 0
	for (let index = 0; index <= text.length; index++) {
		const char = text[index]
		if (index < text.length && char !== '{' && char !== '}' && char !== ';') continue
		// a segment closed by `{` is a selector or at-rule prelude, never a declaration
		const segment = text.slice(segmentStart, index)
		const declaration = char === '{' ? null : DECLARATION.exec(segment)
		const [, property, value] = declaration ?? []
		if (property && value !== undefined && !MASK_PROPERTIES.has(property.toLowerCase())) {
			const valueStart = segmentStart + segment.length - value.length
			for (const literal of literalsInValue(value))
				found.push({ line: lineAt(valueStart + literal.offset), value: literal.value })
		}
		segmentStart = index + 1
	}
	return found
}

const STYLE_BLOCK = /(<style\b[^>]*>)([\s\S]*?)<\/style>/gi

const lineOf = (source: string, offset: number): number =>
	1 + (source.slice(0, offset).match(/\n/g)?.length ?? 0)

// `<style>` blocks of an `.astro` file are CSS, scanned as such with their own source line numbers.
// The rest (frontmatter, markup, scripts) builds inline styles and SVG attributes out of strings, so
// any hex color or color function in it is a literal; a named color there is ordinary text
export function findAstroColorLiterals(source: string): ColorLiteral[] {
	const found: ColorLiteral[] = []
	for (const match of source.matchAll(STYLE_BLOCK)) {
		const [, open = '', body = ''] = match
		const bodyStart = match.index + open.length
		found.push(...findColorLiterals(body, lineOf(source, bodyStart)))
	}
	const outside = source.replace(STYLE_BLOCK, blank)
	for (const match of outside.matchAll(COLOR_FUNCTION))
		found.push({
			line: lineOf(outside, match.index),
			value: balancedCall(outside, match.index),
		})
	for (const match of outside.matchAll(HEX))
		found.push({ line: lineOf(outside, match.index), value: match[0] })
	return found.sort((a, b) => a.line - b.line)
}

// `.css` and `.astro` sources, paths relative to one base; `exempt` holds the site's theme file and layout tokens
export function findColorLiteralViolations(
	files: readonly SourceFile[],
	exempt: ReadonlySet<string>,
): ColorLiteralViolation[] {
	return files.flatMap(({ file, source }) => {
		if (exempt.has(file)) return []
		const found = file.endsWith('.astro')
			? findAstroColorLiterals(source)
			: file.endsWith('.css')
				? findColorLiterals(source)
				: []
		return found.map((literal) => ({ file, ...literal }))
	})
}
