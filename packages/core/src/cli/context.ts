import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { PrettierImport } from './content/prettier.ts'
import type { FetchLike } from './images/public-domain-check.ts'
import type { BucketOpener } from './images/r2-client.ts'
import { BIN } from './registry.ts'
import type { SourceFile, Trees } from './trees.ts'

// what a command gets from the dispatcher: the site root it resolved once, the installed core it
// runs from, the options of the command line, the process environment and where its output goes.
// Paths it prints are relative to `cwd`

export type CliContext = {
	cwd: string
	root: string
	coreRoot: string
	// the value of each option given, keyed by its name (`--release`): `true` for a flag, every value
	// in order for a repeated option
	options: Readonly<Record<string, string | true | readonly string[]>>
	env: Readonly<Record<string, string | undefined>>
	out: (line: string) => void
	err: (line: string) => void
	// the bucket and the HTTP client of the bucket commands: the bin leaves them unset for R2 over the
	// optional S3 SDK and the global fetch, tests pass in-memory fakes
	openBucket?: BucketOpener
	fetch?: FetchLike
	// the import of the optional prettier peer: the bin leaves it unset, tests simulate its absence
	importPrettier?: PrettierImport
}

export const toLabel = (cwd: string, file: string): string =>
	path.relative(cwd, file).split(path.sep).join('/') || '.'

export const label = (context: CliContext, file: string): string => toLabel(context.cwd, file)

export const coreSrcDir = (context: CliContext): string => path.join(context.coreRoot, 'src')

export const trees = (context: CliContext): Trees => ({
	coreSrc: label(context, coreSrcDir(context)),
	siteRoot: label(context, context.root),
})

// how a hint names a command for this site: `--root` only when the site is not the current directory
export const command = (context: CliContext, name: string): string =>
	context.root === context.cwd
		? `${BIN} ${name}`
		: `${BIN} ${name} --root ${label(context, context.root)}`

export const stringOption = (
	context: Pick<CliContext, 'options'>,
	name: string,
): string | undefined => {
	const value = context.options[name]
	return typeof value === 'string' ? value : undefined
}

export const flagOption = (context: Pick<CliContext, 'options'>, name: string): boolean =>
	context.options[name] === true

export const repeatedOption = (
	context: Pick<CliContext, 'options'>,
	name: string,
): readonly string[] => {
	const value = context.options[name]
	return Array.isArray(value) ? value : []
}

// every file under `directory` whose name matches, named by its label and sorted
export function sourceFiles(
	context: CliContext,
	directory: string,
	extensions: RegExp,
): SourceFile[] {
	return readdirSync(directory, { recursive: true, encoding: 'utf8' })
		.filter((file) => extensions.test(file))
		.map((file) => path.join(directory, file))
		.map((file) => ({ file: label(context, file), source: readFileSync(file, 'utf8') }))
		.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}
