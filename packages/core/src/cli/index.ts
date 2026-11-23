#!/usr/bin/env node
import { CORE_ROOT } from '../core-root.ts'
import { runCli } from './run.ts'

// the `astrum-scena` bin, run from the installed package's `dist/` by Node alone
process.exitCode = await runCli(process.argv.slice(2), {
	cwd: process.cwd(),
	coreRoot: CORE_ROOT,
	env: process.env,
	out: (line) => console.log(line),
	err: (line) => console.error(line),
})
