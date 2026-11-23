import path from 'node:path'

import ts from 'typescript'
import { CST, Lexer } from 'yaml'

import { NON_COLOR_TOKEN } from '../../packages/core/src/cli/color-literals.ts'

// pure part of `pnpm check:code-comments`: code comments are English and carry no milestone or
// planning-id references. Only comments are read, so strings, test names, regexes and YAML data stay
// free.

export type Comment = { line: number; text: string }
export type CommentViolation = { file: string; line: number; rule: string; text: string }

type LexerKind = 'script' | 'astro' | 'css' | 'yaml' | 'hash'

const SCRIPT_KINDS: Readonly<Record<string, ts.ScriptKind>> = {
	'.ts': ts.ScriptKind.TS,
	'.mts': ts.ScriptKind.TS,
	'.cts': ts.ScriptKind.TS,
	'.tsx': ts.ScriptKind.TSX,
	'.js': ts.ScriptKind.JS,
	'.mjs': ts.ScriptKind.JS,
	'.cjs': ts.ScriptKind.JS,
	'.jsx': ts.ScriptKind.JSX,
}
const YAML_EXTENSIONS = new Set(['.yaml', '.yml'])
const HASH_EXTENSIONS = new Set(['.toml', '.sh'])
const HASH_DOTFILES = new Set([
	'.gitignore',
	'.prettierignore',
	'.editorconfig',
	'.env.example',
	'.nvmrc',
	'.npmrc',
])

const CYRILLIC = /\p{Script=Cyrillic}/u
// roadmap milestone ids, except the one that is also the name of the object storage API
const STAGE_REFERENCE = /\b(?:S(?:[0-24-9]|1[0-4])|EH-\d+|AD-\d+)\b/

const COMMENT_RULES: readonly { rule: string; pattern: RegExp }[] = [
	{ rule: 'Cyrillic in a comment', pattern: CYRILLIC },
	{ rule: 'milestone reference in a comment', pattern: STAGE_REFERENCE },
]

function lexerFor(file: string): LexerKind | null {
	const base = path.posix.basename(file)
	const extension = path.posix.extname(file)
	if (extension in SCRIPT_KINDS) return 'script'
	if (extension === '.astro') return 'astro'
	if (extension === '.css') return 'css'
	if (YAML_EXTENSIONS.has(extension)) return 'yaml'
	if (HASH_EXTENSIONS.has(extension) || HASH_DOTFILES.has(base)) return 'hash'
	// extensionless files are shell hooks
	if (!base.slice(1).includes('.')) return 'hash'
	return null
}

export const hasCommentLexer = (file: string): boolean => lexerFor(file) !== null

const lineOf = (text: string, offset: number): number =>
	(text.slice(0, offset).match(/\n/g)?.length ?? 0) + 1

const TRIVIA_COMMENT = /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/g

// the parser decides what is a string, template or regex; every gap before a token start is trivia,
// which holds only whitespace and comments
export function scriptComments(
	source: string,
	kind: ts.ScriptKind = ts.ScriptKind.TS,
	firstLine = 1,
): Comment[] {
	const sourceFile = ts.createSourceFile('input', source, ts.ScriptTarget.Latest, true, kind)
	const comments = new Map<number, Comment>()
	const collectTrivia = (start: number, end: number): void => {
		const trivia = source.slice(start, end)
		for (const match of trivia.matchAll(TRIVIA_COMMENT)) {
			const offset = start + match.index
			comments.set(offset, { line: firstLine - 1 + lineOf(source, offset), text: match[0] })
		}
	}
	const isJSDoc = (node: ts.Node): boolean =>
		node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode
	// JSDoc nodes are skipped: their text is collected as trivia of the token they precede, which for
	// a trailing JSDoc is the end-of-file token whose only children are JSDoc nodes
	const visit = (node: ts.Node): void => {
		const children = node.getChildren(sourceFile).filter((child) => !isJSDoc(child))
		if (children.length === 0) {
			if (node.kind !== ts.SyntaxKind.JsxText)
				collectTrivia(node.pos, node.getStart(sourceFile))
			return
		}
		for (const child of children) visit(child)
	}
	visit(sourceFile)
	return [...comments.entries()].sort(([a], [b]) => a - b).map(([, comment]) => comment)
}

export function cssComments(css: string, firstLine = 1): Comment[] {
	return [...css.matchAll(NON_COLOR_TOKEN)]
		.filter((match) => match[0].startsWith('/*'))
		.map((match) => ({ line: firstLine - 1 + lineOf(css, match.index), text: match[0] }))
}

// marker tokens of the yaml lexer that stand for no source text
const YAML_MARKERS = new Set(['\x02', '\x18', '\x1f'])

// the yaml lexer keeps block scalars and quoted scalars whole, so a `#` inside them is data
export function yamlComments(source: string): Comment[] {
	const comments: Comment[] = []
	let offset = 0
	for (const token of new Lexer().lex(source)) {
		if (YAML_MARKERS.has(token)) continue
		if (CST.tokenType(token) === 'comment')
			comments.push({ line: lineOf(source, offset), text: token })
		offset += token.length
	}
	return comments
}

// a quote opens a scalar or shell word only where one can start, so `it's` stays plain text
const QUOTE_OPENER = /[\s:[{,=(-]/

export function hashComments(source: string): Comment[] {
	const comments: Comment[] = []
	source.split('\n').forEach((line, index) => {
		let quote: string | null = null
		for (let column = 0; column < line.length; column++) {
			const char = line[column]
			const previous = line[column - 1] ?? ' '
			if (quote) {
				if (char === '\\' && quote === '"') column++
				else if (char === quote) quote = null
			} else if ((char === '"' || char === "'") && QUOTE_OPENER.test(previous)) {
				quote = char
			} else if (char === '#' && /\s/.test(previous)) {
				comments.push({ line: index + 1, text: line.slice(column) })
				return
			}
		}
	})
	return comments
}

const FRAGMENT_OPEN = '<>'

// offset of the `}` closing the expression opened at `start`. The rest of the file is parsed as TSX
// after a fragment opener, so braces inside strings, templates, comments and nested markup do not count
function expressionEnd(source: string, start: number): number {
	const rest = ts.createSourceFile(
		'expression.tsx',
		FRAGMENT_OPEN + source.slice(start),
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TSX,
	)
	const statement = rest.statements[0]
	const fragment =
		statement && ts.isExpressionStatement(statement) ? statement.expression : undefined
	const expression = fragment && ts.isJsxFragment(fragment) ? fragment.children[0] : undefined
	if (!expression || !ts.isJsxExpression(expression)) return source.length
	return Math.min(start + expression.end - FRAGMENT_OPEN.length - 1, source.length)
}

const RAW_TEXT_TAG = /^<(script|style)(?=[\s>/])/i

// `.astro` comments live in the frontmatter, `<script>`, `<style>`, `{…}` expressions and `<!-- -->`
export function astroComments(source: string): Comment[] {
	const comments: Comment[] = []
	const lineAt = (offset: number): number => lineOf(source, offset)
	let index = 0
	// the closing fence counts only on a line of its own, so `---` inside a string does not end it
	const frontmatter = /^\s*---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?=\r?\n|$)/d.exec(source)
	if (frontmatter) {
		const body = frontmatter.indices?.[1]
		if (body && frontmatter[1])
			comments.push(...scriptComments(frontmatter[1], ts.ScriptKind.TS, lineAt(body[0])))
		index = frontmatter[0].length
	}
	const expression = (open: number): number => {
		const close = expressionEnd(source, open)
		const inner = source.slice(open + 1, close)
		comments.push(...scriptComments(`<>{${inner}}</>`, ts.ScriptKind.TSX, lineAt(open)))
		return close + 1
	}
	// returns the offset after the tag's `>`, scanning attribute expressions on the way
	const tag = (open: number): { end: number; selfClosing: boolean } => {
		let quote: string | null = null
		for (let cursor = open + 1; cursor < source.length; cursor++) {
			const char = source[cursor]
			if (quote) {
				if (char === quote) quote = null
			} else if (char === '"' || char === "'") quote = char
			else if (char === '{') cursor = expression(cursor) - 1
			else if (char === '>')
				return { end: cursor + 1, selfClosing: source[cursor - 1] === '/' }
		}
		return { end: source.length, selfClosing: true }
	}
	while (index < source.length) {
		const char = source[index]
		if (source.startsWith('<!--', index)) {
			const close = source.indexOf('-->', index + 4)
			const end = close === -1 ? source.length : close + 3
			comments.push({ line: lineAt(index), text: source.slice(index, end) })
			index = end
		} else if (char === '{') {
			index = expression(index)
		} else if (char === '<' && /[A-Za-z/!]/.test(source[index + 1] ?? '')) {
			const rawText = RAW_TEXT_TAG.exec(source.slice(index, index + 8))
			const { end, selfClosing } = tag(index)
			index = end
			if (!rawText || selfClosing) continue
			const rawTag = rawText[1]!
			const closeTag = new RegExp(`</${rawTag}\\s*>`, 'i').exec(source.slice(end))
			const bodyEnd = closeTag ? end + closeTag.index : source.length
			const body = source.slice(end, bodyEnd)
			comments.push(
				...(rawTag.toLowerCase() === 'style'
					? cssComments(body, lineAt(end))
					: scriptComments(body, ts.ScriptKind.TS, lineAt(end))),
			)
			index = closeTag ? bodyEnd + closeTag[0].length : source.length
		} else {
			index++
		}
	}
	return comments.sort((a, b) => a.line - b.line)
}

export function findComments(file: string, source: string): Comment[] | null {
	switch (lexerFor(file)) {
		case 'script':
			return scriptComments(source, SCRIPT_KINDS[path.posix.extname(file)])
		case 'astro':
			return astroComments(source)
		case 'css':
			return cssComments(source)
		case 'yaml':
			return yamlComments(source)
		case 'hash':
			return hashComments(source)
		default:
			return null
	}
}

const excerpt = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, 100)

export function findCommentViolations(file: string, source: string): CommentViolation[] {
	const comments = findComments(file, source)
	if (!comments) return []
	const violations: CommentViolation[] = []
	for (const comment of comments) {
		// a block comment reports the line of each offending line, not only its first one
		comment.text.split('\n').forEach((text, offset) => {
			for (const { rule, pattern } of COMMENT_RULES)
				if (pattern.test(text))
					violations.push({
						file,
						line: comment.line + offset,
						rule,
						text: excerpt(text),
					})
		})
	}
	return violations.sort((a, b) => a.line - b.line)
}
