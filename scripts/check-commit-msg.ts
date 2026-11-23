import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import {
	type Denylist,
	describeLeak,
	findLeaks,
	inCi,
	loadDenylist,
	MISSING_DENYLIST_HINT,
} from './lib/identity.ts'
import { findLocalPaths } from './lib/local-paths.ts'

// commit-msg gate: the header is `type(scope)?!?: subject` with a listed type and scope, no line
// attributes the commit to an AI tool, and no line leaks the reference-site identity or a local path
// (check:identity and check:local-paths rules: commit messages are published with the history). Both lists live only in the AGENTS.md
// "Commits" section — backtick tokens between `types:` (or `scopes:`) and the next `—` — so a format
// change there fails this hook (fail closed) rather than lets everything through.
// `--range <base>..<head>` checks every commit of a range, as CI does for a PR.

const AGENTS_MD = new URL('../AGENTS.md', import.meta.url)
const SCISSORS = '# ------------------------ >8 ------------------------'
const HEADER = /^([^\s(:!]+)(?:\(([^)]*)\))?!?: (\S.*)$/
// headers git writes itself: merges, reverts and autosquash markers carry no type
const GIT_GENERATED = /^(?:Merge |Revert "|fixup! |squash! |amend! )/
const AI_TOOL =
	/\b(?:claude|anthropic|opus|sonnet|codex|openai|chatgpt|gpt|cursor|cursoragent|copilot|gemini|google-labs|grok|xai|devin|aider|windsurf|codeium|deepseek|qwen|mistral|llama|tabnine|cline|junie|kiro)\b/i
// a hyphenated token (`Co-authored-by`, `Assisted-by`, …) is a trailer anywhere in the body; a single
// word (`Assistant:`) only inside the final trailer paragraph, so prose like `Note: …` stays free
const HYPHENATED_TRAILER = /^[a-z]+(?:-[a-z]+)+\s*:/i
const TRAILER = /^[a-z]+(?:-[a-z]+)*\s*:\s*\S/i
const GENERATED_WITH = /^[^\p{L}]*generated with\b/iu
const MADE_WITH = /\b(?:generated|made) (?:with|by)\s+(.*)$/i

// the tool may follow after up to three capitalized words (`made with GitHub Copilot`); a lowercase word
// ends the name, so `made by moving the cursor` is prose
function madeWithTool(line: string): boolean {
	const words = MADE_WITH.exec(line)?.[1]?.split(/\s+/) ?? []
	for (const raw of words.slice(0, 4)) {
		const word = raw.replace(/^[[("'`*_]+/, '')
		if (AI_TOOL.test(word)) return true
		if (!/^\p{Lu}/u.test(word)) return false
	}
	return false
}

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

function parseList(agentsMd: string, label: 'types' | 'scopes'): string[] {
	const section = /^## Commits\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(
		agentsMd.replaceAll('\r\n', '\n'),
	)?.[1]
	const list = section && new RegExp(`\\b${label}:([\\s\\S]*?)—`).exec(section)?.[1]
	const items = list ? [...list.matchAll(/`([^`]+)`/g)].map((match) => match[1]!) : []
	// a lost dash would let one list run into the next
	if (
		items.length === 0 ||
		/\b(?:types|scopes):/.test(list ?? '') ||
		!items.every((item) => KEBAB_CASE.test(item))
	)
		throw new Error(
			`cannot read commit ${label} from the AGENTS.md "Commits" section (expected \`${label.slice(0, -1)}\` tokens between "${label}:" and "—")`,
		)
	return items
}

export const parseTypes = (agentsMd: string): string[] => parseList(agentsMd, 'types')
export const parseScopes = (agentsMd: string): string[] => parseList(agentsMd, 'scopes')

export type CommitRules = { types: readonly string[]; scopes: readonly string[] }

// `cleanup` mirrors git's editor cleanup for hook input; a stored commit (`--range`) is read whole
function messageLines(message: string, cleanup: boolean): string[] {
	const all = message.replaceAll('\r\n', '\n').split('\n')
	const scissors = cleanup ? all.indexOf(SCISSORS) : -1
	const lines = (scissors === -1 ? all : all.slice(0, scissors)).map((line) => line.trim())
	return cleanup ? lines.filter((line) => !line.startsWith('#')) : lines
}

const paragraphs = (lines: readonly string[]): string[][] =>
	lines
		.join('\n')
		.split(/\n{2,}/)
		.map((block) => block.split('\n').filter((line) => line !== ''))
		.filter((block) => block.length > 0)

function headerViolations(header: string | undefined, rules: CommitRules): string[] {
	if (header === undefined) return ['the commit message is empty']
	if (GIT_GENERATED.test(header)) return []
	const match = HEADER.exec(header)
	if (!match)
		return [`header "${header}" must be "type(scope)?!?: subject" with a space after the colon`]
	const [, type, scope] = match
	const violations: string[] = []
	if (!rules.types.includes(type!))
		violations.push(`type "${type}" is not allowed; use one of: ${rules.types.join(', ')}`)
	if (scope !== undefined && !rules.scopes.includes(scope))
		violations.push(`scope "${scope}" is not allowed; use one of: ${rules.scopes.join(', ')}`)
	return violations
}

export function checkCommitMessage(
	message: string,
	rules: CommitRules,
	{ cleanup = true }: { cleanup?: boolean } = {},
): string[] {
	const blocks = paragraphs(messageLines(message, cleanup))
	const lines = blocks.flat()
	const last = blocks.length > 1 ? blocks.at(-1)! : []
	const trailerBlock = new Set(last.every((line) => TRAILER.test(line)) ? last : [])
	const violations = headerViolations(lines[0], rules)
	lines.forEach((line, index) => {
		const trailer = index > 0 && (HYPHENATED_TRAILER.test(line) || trailerBlock.has(line))
		if (trailer && AI_TOOL.test(line))
			violations.push(`AI attribution is not allowed: "${line}"`)
		else if (GENERATED_WITH.test(line) || madeWithTool(line))
			violations.push(`"Generated with" attribution is not allowed: "${line}"`)
	})
	return violations
}

// a leak is reported by line and rule, never by its text, so logs do not repeat it; the line number
// is that of the message file, counted before cleanup drops comments and the scissors part. Without
// the owner's list only CI fails, as in check:identity; elsewhere the generic patterns still apply
export function identityViolations(
	message: string,
	denylist: Denylist,
	{ cleanup = true, ci = inCi() }: { cleanup?: boolean; ci?: boolean } = {},
): string[] {
	if (denylist.entries.length === 0 && ci)
		return [`the owner denylist is missing or empty. ${MISSING_DENYLIST_HINT}`]
	const all = message.replaceAll('\r\n', '\n').split('\n')
	const scissors = cleanup ? all.indexOf(SCISSORS) : -1
	const kept = scissors === -1 ? all : all.slice(0, scissors)
	return kept.flatMap((line, index) =>
		cleanup && line.trim().startsWith('#')
			? []
			: [
					...findLeaks(line, denylist).map(
						(leak) => `line ${index + 1} leaks identity (${describeLeak(leak)})`,
					),
					...findLocalPaths(line).map(() => `line ${index + 1} leaks a local path`),
				],
	)
}

// other violations quote the message, so a message that leaks reports only its leaks
function messageViolations(
	message: string,
	rules: CommitRules,
	denylist: Denylist,
	cleanup: boolean,
): { leaks: boolean; violations: string[] } {
	const leaks = identityViolations(message, denylist, { cleanup })
	if (leaks.length > 0) return { leaks: true, violations: leaks }
	return { leaks: false, violations: checkCommitMessage(message, rules, { cleanup }) }
}

const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' })

function rangeMessages(range: string): { commit: string; message: string }[] {
	const ends = range.split('..')
	if (ends.length !== 2 || ends.some((end) => !/^[^\s.][^\s]*$/.test(end)))
		throw new Error(`--range expects <base>..<head>, got "${range}"`)
	return git('rev-list', '--reverse', range)
		.split('\n')
		.filter(Boolean)
		.map((commit) => ({ commit, message: git('log', '-1', '--format=%B', commit) }))
}

async function main(): Promise<void> {
	const [first, second] = process.argv.slice(2)
	if (!first || (first === '--range' && !second))
		throw new Error(
			'usage: check-commit-msg <commit-message-file> | check-commit-msg --range <base>..<head>',
		)
	const agentsMd = await readFile(AGENTS_MD, 'utf8')
	const rules = { types: parseTypes(agentsMd), scopes: parseScopes(agentsMd) }
	const denylist = await loadDenylist()
	if (denylist.entries.length === 0 && !inCi())
		console.error(
			`commit-msg WARNING — the owner denylist is missing or empty, so only the generic patterns are checked; CI checks the list. ${MISSING_DENYLIST_HINT}`,
		)
	const failures =
		first === '--range'
			? rangeMessages(second!).flatMap(({ commit, message }) => {
					const { leaks, violations } = messageViolations(message, rules, denylist, false)
					const label = leaks
						? commit.slice(0, 7)
						: `${commit.slice(0, 7)} ${message.split('\n')[0]}`
					return violations.map((violation) => `${label}: ${violation}`)
				})
			: messageViolations(await readFile(first, 'utf8'), rules, denylist, true).violations
	if (failures.length === 0) return
	console.error('commit-msg check FAILED:')
	for (const failure of failures) console.error(`  - ${failure}`)
	process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
