import { describe, expect, it } from 'vitest'

import { findComments, findCommentViolations } from './code-comments.ts'

const rules = (file: string, source: string) =>
	findCommentViolations(file, source).map(({ line, rule }) => `${line}: ${rule}`)

describe('findCommentViolations', () => {
	it('flags a Cyrillic line comment with its line', () => {
		expect(rules('a.ts', 'const a = 1\n// сначала кеш\n')).toEqual(['2: Cyrillic in a comment'])
	})

	it('flags a trailing comment', () => {
		expect(rules('a.test.ts', "expect(x).toBe('0px') // trim первого\n")).toEqual([
			'1: Cyrillic in a comment',
		])
	})

	it('ignores a URL inside a string', () => {
		expect(rules('a.ts', "const text = 'Ссылки https://x.test/a'\n")).toEqual([])
	})

	it('ignores comment markers inside a template literal with substitutions', () => {
		expect(rules('a.ts', 'const text = `Итог: ${n} // шт.`\n')).toEqual([])
		expect(rules('a.ts', 'const text = `${a} /* ${b} */ шт.`\n')).toEqual([])
	})

	it('ignores comment markers inside a regex literal', () => {
		expect(rules('a.ts', 'const re = /https?:\\/\\/[а-я]+/u\n')).toEqual([])
	})

	it('flags a JSDoc block line by line', () => {
		expect(rules('a.ts', '/**\n * ok\n * плохо\n */\nexport const a = 1\n')).toEqual([
			'3: Cyrillic in a comment',
		])
	})

	it('reads comments in .mjs and .tsx', () => {
		expect(rules('a.mjs', 'export default {} // конфиг\n')).toEqual([
			'1: Cyrillic in a comment',
		])
		expect(rules('a.tsx', 'const a = <p>текст // не комментарий</p> // комментарий\n')).toEqual(
			['1: Cyrillic in a comment'],
		)
	})

	it('flags comments in .astro frontmatter, markup expressions and HTML comments', () => {
		const source = [
			'---',
			"const title = 'Заголовок' // заголовок",
			'---',
			'<p>Текст // не комментарий, it’s fine</p>',
			'{/* разметка */}',
			'<a href="/x" title={t /* ссылка */}>x</a>',
			'<!-- скрыто -->',
		].join('\n')
		expect(rules('a.astro', source)).toEqual([
			'2: Cyrillic in a comment',
			'5: Cyrillic in a comment',
			'6: Cyrillic in a comment',
			'7: Cyrillic in a comment',
		])
	})

	it('flags comments in .astro script and style blocks only', () => {
		const source = [
			'<div>',
			'<script>',
			"const label = 'метка' // метка",
			'</script>',
			'<style>',
			".a { content: '/* строка */'; } /* стиль */",
			'</style>',
			'</div>',
		].join('\n')
		expect(rules('a.astro', source)).toEqual([
			'3: Cyrillic in a comment',
			'6: Cyrillic in a comment',
		])
	})

	it('finds the end of an .astro expression past braces in strings and comments', () => {
		expect(rules('a.astro', '<p>{"{"}</p>\n<!-- скрыто -->\n')).toEqual([
			'2: Cyrillic in a comment',
		])
		expect(rules('a.astro', "{'}' /* русский */}\n")).toEqual(['1: Cyrillic in a comment'])
	})

	it('ends .astro frontmatter only at a fence on its own line', () => {
		const source = ['---', "const s = 'a---b'", '// русский', '---', '<p></p>'].join('\n')
		expect(rules('a.astro', source)).toEqual(['3: Cyrillic in a comment'])
	})

	it('flags a JSDoc block at the end of a file', () => {
		expect(rules('a.ts', 'export {}\n/** плохо */\n')).toEqual(['2: Cyrillic in a comment'])
	})

	it('reads CSS block comments and skips strings', () => {
		expect(rules('a.css', ".a { content: '/* нет */'; }\n/* да */\n")).toEqual([
			'2: Cyrillic in a comment',
		])
	})

	it('reads # comments in YAML and skips quoted values', () => {
		expect(rules('a.yaml', '# мастер\nkey: 1\n')).toEqual(['1: Cyrillic in a comment'])
		expect(rules('a.yaml', "title: 'Мастер # 1'\n")).toEqual([])
		expect(rules('a.yaml', 'title: "Мастер # 1" # мастер\n')).toEqual([
			'1: Cyrillic in a comment',
		])
		expect(rules('a.yaml', 'url: https://x.test/a#раздел\n')).toEqual([])
		expect(rules('.gitignore', '# временное\ndist\n')).toEqual(['1: Cyrillic in a comment'])
	})

	it('lexes YAML scalars whole', () => {
		expect(rules('a.yaml', 'text: |\n  # русский\n  x\n')).toEqual([])
		expect(rules('a.yml', "q: 'it''s # текст'\n")).toEqual([])
		expect(rules('a.yaml', 'k: a "b # русский\n')).toEqual(['1: Cyrillic in a comment'])
	})

	it('flags a milestone reference but not the S3 API or other words', () => {
		expect(rules('a.ts', '// see S12/4\n')).toEqual(['1: milestone reference in a comment'])
		expect(rules('a.ts', '// EH-60 and AD-3\n')).toEqual([
			'1: milestone reference in a comment',
		])
		expect(rules('a.ts', '// S3-compatible endpoint\n')).toEqual([])
		expect(rules('a.ts', '// ES2022 target, ADR-0012 ruling, S15 rows\n')).toEqual([])
	})

	it('leaves test names alone', () => {
		expect(rules('a.test.ts', "it('пустая строка', () => {})\n")).toEqual([])
	})

	it('skips files it cannot lex', () => {
		expect(findComments('a.json', '{"a": "// б"}')).toBeNull()
		expect(rules('a.md', '<!-- б -->')).toEqual([])
	})
})
