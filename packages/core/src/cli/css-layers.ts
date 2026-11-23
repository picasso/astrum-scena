import path from 'node:path'

import postcss, { type AtRule, type ChildNode, type Root } from 'postcss'

import { LAYOUT_TOKENS_RELATIVE_PATH } from '../lib/layout-tokens.ts'
import { sitePath, type SourceFile, type Trees } from './trees.ts'

// pure part of `astrum-scena check css-layers`: every rule of our CSS sits in a cascade layer, and every
// stylesheet the bundler can emit as its own chunk declares the layer order first, so the order holds
// whichever chunk the browser parses first. Works on sources, no build. The core sources and the
// site's files are checked together: an import with a leading `/` resolves from the Vite root, which is
// the site root.

export type CssLayerViolation = { file: string; line: number; message: string }

export const layersCss = (coreSrc: string): string => path.posix.join(coreSrc, 'styles/layers.css')
export const globalCss = (coreSrc: string): string => path.posix.join(coreSrc, 'styles/global.css')
export const LAYOUT_TOKENS_LAYER = 'theme'

// tailwind directives that emit no unlayered rule; `@theme` turns into the theme layer
const LAYER_NEUTRAL_AT_RULES = new Set(['charset', 'custom-variant', 'theme', 'source', 'plugin'])
// packages imported without layer() because they layer their own output
const SELF_LAYERED_PACKAGES = new Set(['tailwindcss'])

// `conditions` is what follows the URL: layer(), supports() and media queries; `local` marks a file
// of the checked trees rather than a package or an unchecked file
type CssImport = {
	target: string
	local: boolean
	layered: boolean
	conditions: string
	line: number
	node: AtRule
}
type Stylesheet = {
	file: string
	root?: Root
	// 1-based line of the stylesheet's first line inside its file (an Astro `<style>` block)
	lineOffset: number
	error?: { line: number; message: string }
}

const IMPORT_PARAMS = /^(?:url\(\s*)?(['"])(.+?)\1\s*\)?\s*(.*)$/s
const LAYER_CLAUSE = /(?:^|\s)layer(?:\(\s*[\w.-]+\s*\)|(?=\s|$))/

// a relative specifier resolves from the importing file, a leading `/` from the site root
const resolveLocal = (from: string, specifier: string, trees: Trees): string | undefined => {
	if (specifier.startsWith('.'))
		return path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier))
	if (specifier.startsWith('/')) return sitePath(trees.siteRoot, specifier.slice(1))
	return undefined
}

// only a `.css` file of the checked trees is layered by this gate itself; anything else (the site's
// `public/`, a path out of the trees, another stylesheet syntax) is unchecked CSS and needs layer()
const isChecked = (file: string, trees: Trees): boolean =>
	file.endsWith('.css') &&
	(file.startsWith(`${trees.coreSrc}/`) || file.startsWith(`${sitePath(trees.siteRoot, 'src')}/`))

const parseImport = (
	node: AtRule,
	from: string,
	trees: Trees,
): Omit<CssImport, 'line' | 'node'> | undefined => {
	const match = IMPORT_PARAMS.exec(node.params.trim())
	if (!match) return undefined
	const specifier = match[2]!
	const local = resolveLocal(from, specifier, trees)
	const conditions = (match[3] ?? '').trim()
	return {
		target: local ?? specifier,
		local: local !== undefined && isChecked(local, trees),
		layered: LAYER_CLAUSE.test(conditions),
		conditions,
	}
}

const parse = (file: string, css: string, lineOffset = 1): Stylesheet => {
	try {
		return { file, root: postcss.parse(css, { from: file }), lineOffset }
	} catch (error) {
		const line = (error as { line?: number }).line ?? 1
		return {
			file,
			lineOffset,
			error: { line, message: `CSS parse error: ${(error as Error).message}` },
		}
	}
}

const lineOf = (sheet: Stylesheet, node: ChildNode): number =>
	(node.source?.start?.line ?? 1) + sheet.lineOffset - 1

const imports = (sheet: Stylesheet, trees: Trees): CssImport[] =>
	(sheet.root?.nodes ?? []).flatMap((node) => {
		if (node.type !== 'atrule' || node.name !== 'import') return []
		const parsed = parseImport(node, sheet.file, trees)
		return parsed ? [{ ...parsed, line: lineOf(sheet, node), node }] : []
	})

// blanks a span, keeping newlines so offsets still map to source lines
const blank = (text: string): string => text.replace(/[^\n]/g, ' ')

const FRONTMATTER = /^---\n[\s\S]*?\n---/
const COMMENTS = /<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/g

// every `<style>` block of an Astro file; frontmatter and comments are blanked first, so a `<style>`
// mentioned in prose is not taken for a block
export function astroStyleBlocks(file: string, source: string): Stylesheet[] {
	const body = source.replace(FRONTMATTER, blank).replace(COMMENTS, blank)
	return [...body.matchAll(STYLE_BLOCK)].map((match) => {
		const start = match.index + match[0].indexOf('>') + 1
		const lineOffset = source.slice(0, start).split('\n').length
		return parse(file, source.slice(start, start + match[1]!.length), lineOffset)
	})
}

// static `import '…css'` / `import x from '…css'` and dynamic `import('…css')`
const SCRIPT_CSS_IMPORT =
	/(?<![@\w])import\s*(?:\(\s*|[\w*{}\s,]+\s+from\s+|(?=['"]))['"]([^'"?]+\.css)(?:\?[^'"]*)?['"]/g
// stylesheets a script or component imports: each becomes a chunk of its own
const scriptCssImports = (file: string, source: string, trees: Trees): string[] =>
	[...source.matchAll(SCRIPT_CSS_IMPORT)].flatMap((match) => {
		const target = resolveLocal(file, match[1]!, trees)
		return target ? [target] : []
	})

const LAYER_NAMES = /^[\w-]+(?:\.[\w-]+)*(?:\s*,\s*[\w-]+(?:\.[\w-]+)*)*$/

const isComment = (node: ChildNode): boolean => node.type === 'comment'

function layerOrderViolations(sheet: Stylesheet, layers: string): CssLayerViolation[] {
	const nodes = (sheet.root?.nodes ?? []).filter((node) => !isComment(node))
	const [only] = nodes
	if (
		nodes.length === 1 &&
		only?.type === 'atrule' &&
		only.name === 'layer' &&
		only.nodes === undefined &&
		LAYER_NAMES.test(only.params.trim())
	)
		return []
	return [
		{
			file: sheet.file,
			line: only ? lineOf(sheet, only) : 1,
			message: `${layers} must hold the single @layer order statement and nothing else`,
		},
	]
}

// the first statement after comments must import layers.css, unconditionally: a media or supports
// condition would leave the order undeclared where it does not hold
function entryViolations(sheet: Stylesheet, trees: Trees): CssLayerViolation[] {
	const first = (sheet.root?.nodes ?? []).find((node) => !isComment(node))
	if (first?.type === 'atrule' && first.name === 'import') {
		const parsed = parseImport(first, sheet.file, trees)
		if (parsed?.target === layersCss(trees.coreSrc) && parsed.conditions === '') return []
	}
	return [
		{
			file: sheet.file,
			line: first ? lineOf(sheet, first) : sheet.lineOffset,
			message: `an entry stylesheet must start with @import of ${layersCss(trees.coreSrc)}`,
		},
	]
}

// every top-level node is a comment, an import, a layer, or a layer-neutral Tailwind directive
function unlayeredViolations(sheet: Stylesheet, trees: Trees): CssLayerViolation[] {
	return (sheet.root?.nodes ?? []).flatMap((node): CssLayerViolation[] => {
		if (isComment(node)) return []
		if (node.type === 'atrule') {
			if (node.name === 'layer' || LAYER_NEUTRAL_AT_RULES.has(node.name)) return []
			if (node.name === 'import') {
				const parsed = parseImport(node, sheet.file, trees)
				if (
					parsed &&
					(parsed.layered || parsed.local || SELF_LAYERED_PACKAGES.has(parsed.target))
				)
					return []
				return [
					{
						file: sheet.file,
						line: lineOf(sheet, node),
						message: `@import ${node.params} brings in CSS outside a layer: add layer(<name>)`,
					},
				]
			}
			return [
				{
					file: sheet.file,
					line: lineOf(sheet, node),
					message: `@${node.name} outside @layer`,
				},
			]
		}
		const label = node.type === 'rule' ? node.selector : node.type
		return [
			{
				file: sheet.file,
				line: lineOf(sheet, node),
				message: `${label} outside @layer`,
			},
		]
	})
}

function layoutTokensViolations(global: Stylesheet | undefined, trees: Trees): CssLayerViolation[] {
	const found = global
		? imports(global, trees).some(
				({ target, conditions }) =>
					target === sitePath(trees.siteRoot, LAYOUT_TOKENS_RELATIVE_PATH) &&
					new RegExp(`^layer\\(\\s*${LAYOUT_TOKENS_LAYER}\\s*\\)$`).test(conditions),
			)
		: false
	return found
		? []
		: [
				{
					file: globalCss(trees.coreSrc),
					line: 1,
					message: `must @import '/${LAYOUT_TOKENS_RELATIVE_PATH}' layer(${LAYOUT_TOKENS_LAYER}) with no other condition`,
				},
			]
}

// `files` holds POSIX paths of the core sources under `trees.coreSrc` and the site's files under
// `trees.siteRoot`, both relative to one base: `.css` and `.astro` sources are checked,
// `.ts`/`.tsx`/`.mdx` only tell which stylesheets are imported from code
export function findCssLayerViolations(
	files: readonly SourceFile[],
	trees: Trees,
): CssLayerViolation[] {
	const cssSheets = files
		.filter(({ file }) => file.endsWith('.css'))
		.map(({ file, source }) => parse(file, source))
	const astroSheets = files
		.filter(({ file }) => file.endsWith('.astro'))
		.flatMap(({ file, source }) => astroStyleBlocks(file, source))

	const layerImported = new Set<string>()
	const plainImported = new Set<string>()
	for (const sheet of [...cssSheets, ...astroSheets]) {
		for (const { target, layered } of imports(sheet, trees))
			(layered ? layerImported : plainImported).add(target)
	}
	const codeImported = new Set(
		files
			.filter(({ file }) => /\.(?:astro|tsx?|mdx)$/.test(file) && !/\.test\.tsx?$/.test(file))
			.flatMap(({ file, source }) => scriptCssImports(file, source, trees)),
	)

	const violations: CssLayerViolation[] = []
	for (const sheet of [...cssSheets, ...astroSheets]) {
		if (sheet.error) {
			violations.push({
				file: sheet.file,
				line: sheet.error.line + sheet.lineOffset - 1,
				message: sheet.error.message,
			})
			continue
		}
		const isAstro = sheet.file.endsWith('.astro')
		if (!isAstro && sheet.file === layersCss(trees.coreSrc)) {
			violations.push(...layerOrderViolations(sheet, sheet.file))
			continue
		}
		const onlyUnderLayer =
			!isAstro &&
			layerImported.has(sheet.file) &&
			!plainImported.has(sheet.file) &&
			!codeImported.has(sheet.file)
		if (onlyUnderLayer) continue
		// a stylesheet pulled in only by a plain CSS @import is inlined after its importer's order statement
		const isEntry = isAstro || codeImported.has(sheet.file) || !plainImported.has(sheet.file)
		if (isEntry) violations.push(...entryViolations(sheet, trees))
		violations.push(...unlayeredViolations(sheet, trees))
	}
	violations.push(
		...layoutTokensViolations(
			cssSheets.find(({ file }) => file === globalCss(trees.coreSrc)),
			trees,
		),
	)
	return violations
}
