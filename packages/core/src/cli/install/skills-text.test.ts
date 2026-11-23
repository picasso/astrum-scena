import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CORE_ROOT } from '../../core-root.ts'
import { BIN, COMMANDS, optionName } from '../registry.ts'
import { AGENTS_DIR, BLOCK_FILE, filesUnder, SKILLS_DIR } from './bundle.ts'

// the skills, agents and AGENTS.md block the core installs run only the core's own command line: every
// command they name is a command of the registry with its options, never a package script of a site or
// a file of this repository, and they name nothing of the repository or of a model

const texts = [SKILLS_DIR, AGENTS_DIR].flatMap((directory) =>
	[...filesUnder(path.join(CORE_ROOT, directory))].map(([file, text]) => ({
		file: `${directory}/${file}`,
		text,
	})),
)
texts.push({ file: BLOCK_FILE, text: readFileSync(path.join(CORE_ROOT, BLOCK_FILE), 'utf8') })

const COMMAND_NAMES = new Map(COMMANDS.map((spec) => [spec.name, spec]))

// the code spans and fenced blocks of a Markdown text, and the whole text of any other file
const codeOf = (file: string, text: string): string[] =>
	file.endsWith('.md')
		? [...text.matchAll(/```[^\n]*\n([\s\S]*?)```|`([^`\n]+)`/g)].map(
				(match) => match[1] ?? match[2]!,
			)
		: [text]

// every `astrum-scena …` command line in a piece of code, up to the end of the line or the span
const commandLines = (code: string): string[] =>
	[...code.matchAll(/(?<![\w@/.-])astrum-scena((?: [^\s`]+)*)/g)].map((match) => match[1]!.trim())

// the problem of one command line, or undefined: its words up to the first option or placeholder name
// a command of the registry, and every option it gives is one of that command; the bare bin, or the bin
// before a placeholder, names the command line itself
function commandProblem(line: string): string | undefined {
	const words = line.split(' ').filter((word) => word !== '')
	const end = words.findIndex((word) => /^[-<[]/.test(word) || word.includes('…'))
	const name = words.slice(0, end === -1 ? words.length : end).join(' ')
	if (name === '') return undefined
	const spec = COMMAND_NAMES.get(name)
	if (!spec) return `"${BIN} ${line}" is not a command of the core`
	const own = new Set(spec.options.map(optionName))
	const foreign = words
		.filter((word) => word.startsWith('--'))
		.map((word) => word.split('=')[0]!)
		.find((option) => !own.has(option))
	return foreign === undefined ? undefined : `"${BIN} ${line}": ${name} takes no ${foreign}`
}

const FORBIDDEN: readonly [RegExp, string][] = [
	[/\bpnpm (?!exec astrum-scena\b)/, 'a pnpm command other than pnpm exec astrum-scena'],
	[/(?:^|[\s`(/])scripts\//, 'a scripts/ path'],
	[/(?:^|[\s`(])docs\//, 'a docs/ path'],
	[/src\/lib\b/, 'the core sources'],
	[/_bmad/, 'the planning tooling'],
	[/\bADR\b|\bAD-\d/, 'an architecture decision'],
	[/\b(?:opus|sonnet|haiku|gpt|grok|gemini|cursor)\b/i, 'a model or a vendor tool'],
	[/^model\s*=|^model:/m, 'a pinned model'],
	[/\/(?:Users|Volumes|home)\/|~\//, 'a local path'],
	[/\b(?:ru|en)\.mdx?\b|\bRU\b|\bEN\b/, 'a fixed locale'],
]

describe('the texts the core installs', () => {
	it('are found', () => {
		expect(texts.map(({ file }) => file)).toEqual(
			expect.arrayContaining([
				`${SKILLS_DIR}/validate/SKILL.md`,
				`${SKILLS_DIR}/translate/SKILL.md`,
				`${SKILLS_DIR}/add-album/SKILL.md`,
				`${SKILLS_DIR}/process-images/SKILL.md`,
				`${SKILLS_DIR}/front-audit/references/astro-pitfalls.md`,
				`${AGENTS_DIR}/claude/factcheck-researcher.md`,
				`${AGENTS_DIR}/codex/translation-reviewer.toml`,
				BLOCK_FILE,
			]),
		)
	})

	it('name only commands of the core with their options', () => {
		const problems = texts.flatMap(({ file, text }) =>
			codeOf(file, text)
				.flatMap(commandLines)
				.flatMap((line) => {
					const problem = commandProblem(line)
					return problem ? [`${file}: ${problem}`] : []
				}),
		)
		expect(problems).toEqual([])
		const named = new Set(
			texts.flatMap(({ file, text }) => codeOf(file, text).flatMap(commandLines)),
		)
		expect(named.size).toBeGreaterThan(10)
	})

	it('name no site alias, repository file, model or fixed locale', () => {
		const problems = texts.flatMap(({ file, text }) =>
			FORBIDDEN.filter(([pattern]) => pattern.test(text)).map(
				([, what]) => `${file}: ${what}`,
			),
		)
		expect(problems).toEqual([])
	})

	it('catch an unknown command, an unknown option and an alias', () => {
		expect(commandProblem('check content')).toBeUndefined()
		expect(
			commandProblem('content factcheck decide --key <key> --set <id>=<s>'),
		).toBeUndefined()
		expect(commandProblem('content factcheck approve')).toContain('is not a command')
		expect(commandProblem('check content --write')).toContain('takes no --write')
		expect(FORBIDDEN[0]![0].test('run pnpm content:validate')).toBe(true)
		expect(FORBIDDEN[0]![0].test('run pnpm exec astrum-scena check')).toBe(false)
	})
})
