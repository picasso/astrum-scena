import { execFileSync } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { findCommentViolations, hasCommentLexer } from './lib/code-comments.ts'
import { sitePath, siteRootArg } from './lib/site-root.ts'

// gate: code comments are English, without milestone or planning-id references (rules in
// lib/code-comments.ts). The whole tree is scanned except the site's authored content (`--site <dir>`,
// the demo by default), docs and agent tooling, which are prose rather than code; files without a
// comment lexer (markdown, JSON, binaries) are skipped by the lexer choice itself.
const excludedDirectories = (siteRoot: string): string[] => [
	`${sitePath(siteRoot, 'src/content')}/`,
	'docs/',
	'_bmad',
	'.claude/',
	'.cursor/',
	'.agents/',
]

const isCovered = (file: string, excluded: readonly string[]): boolean =>
	!excluded.some((directory) => file.startsWith(directory))

function repositoryFiles(): string[] {
	const output = execFileSync(
		'git',
		['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
		{ encoding: 'utf8' },
	)
	return output.split('\0').filter(Boolean)
}

async function main(): Promise<void> {
	const offenders: string[] = []
	// files without a comment lexer are never opened, so an unreadable one cannot fail the gate
	const excluded = excludedDirectories(siteRootArg())
	const files = repositoryFiles().filter(
		(file) => isCovered(file, excluded) && hasCommentLexer(file),
	)
	for (const file of files) {
		// git stores a symlink as its target path, not as code
		const stats = await lstat(file).catch(() => null)
		if (stats?.isSymbolicLink()) continue
		// a file deleted in the working tree has nothing to scan; any other read error fails the gate
		const buffer = await readFile(file).catch((error: NodeJS.ErrnoException) => {
			if (error.code === 'ENOENT') return null
			throw error
		})
		// binary content is still scanned: a NUL byte inside a string literal must not hide a source file
		if (!buffer) continue
		for (const { line, rule, text } of findCommentViolations(file, buffer.toString('utf8')))
			offenders.push(`${file}:${line}: ${rule}: ${text}`)
	}
	if (offenders.length > 0) {
		console.error('check:code-comments FAILED:')
		for (const offender of offenders) console.error(`  - ${offender}`)
		console.error(
			'Write comments in English, explain why, and drop milestone and planning-id references.',
		)
		process.exitCode = 1
		return
	}
	console.log('check:code-comments OK')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
