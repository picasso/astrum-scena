import path from 'node:path'

import { CORE_ROOT } from '../core-root.ts'
import type { PrettierImport } from './content/prettier.ts'
import type { FetchLike } from './images/public-domain-check.ts'
import type { BucketOpener } from './images/r2-client.ts'
import { runCli } from './run.ts'

export type CliResult = { status: number; stdout: string; stderr: string }

export type RunOptions = {
	// the core the bin runs from, this checkout by default
	coreRoot?: string
	// the process environment the bin sees, empty by default so the host's variables never leak in
	env?: Record<string, string | undefined>
	// fakes of the bucket and of the HTTP client, so no test reaches the network
	openBucket?: BucketOpener
	fetch?: FetchLike
	// the import of prettier, so a test can run a writing command on a site without it
	importPrettier?: PrettierImport
}

// the bin in-process: `argv` as typed after `astrum-scena`, run in `cwd`
export async function runAstrumScena(
	cwd: string,
	argv: readonly string[],
	options: RunOptions = {},
): Promise<CliResult> {
	const out: string[] = []
	const err: string[] = []
	const status = await runCli(argv, {
		cwd: path.resolve(cwd),
		coreRoot: path.resolve(options.coreRoot ?? CORE_ROOT),
		env: options.env ?? {},
		...(options.openBucket === undefined ? {} : { openBucket: options.openBucket }),
		...(options.fetch === undefined ? {} : { fetch: options.fetch }),
		...(options.importPrettier === undefined ? {} : { importPrettier: options.importPrettier }),
		out: (line) => out.push(line),
		err: (line) => err.push(line),
	})
	const text = (lines: string[]) => lines.map((line) => `${line}\n`).join('')
	return { status, stdout: text(out), stderr: text(err) }
}
