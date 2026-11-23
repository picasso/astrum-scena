import { readFileSync } from 'node:fs'

import { checkUpgrading, UPGRADING_FILE } from './lib/upgrading.ts'

// fails when UPGRADING.md is not a list of complete transitions, one section per breaking release of
// the core's npm version, newest first

const CORE_PACKAGE = 'packages/core/package.json'

function main(): void {
	let markdown: string
	try {
		markdown = readFileSync(UPGRADING_FILE, 'utf8')
	} catch (error) {
		console.error(`check:upgrading FAILED: ${UPGRADING_FILE} — ${(error as Error).message}`)
		process.exitCode = 1
		return
	}
	const { version } = JSON.parse(readFileSync(CORE_PACKAGE, 'utf8')) as { version: string }
	const errors = checkUpgrading(markdown, version)
	if (errors.length > 0) {
		console.error(`check:upgrading FAILED: ${UPGRADING_FILE}`)
		for (const error of errors) console.error(`  - ${error}`)
		process.exitCode = 1
		return
	}
	console.log(`check:upgrading OK (core ${version})`)
}

main()
