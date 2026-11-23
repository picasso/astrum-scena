import { readFileSync } from 'node:fs'

import { checkNotices, listFiles, NOTICE_SCOPES } from './lib/notices.ts'

// fails when an asset of the core or a font of the demo is missing from its notices file, or the
// notices name a file the tree no longer has

function main(): void {
	let failed = false
	for (const { notices, base, roots } of NOTICE_SCOPES) {
		let errors: string[]
		try {
			const files = roots.flatMap((root) => listFiles(base, root))
			errors = checkNotices(readFileSync(notices, 'utf8'), files, roots)
		} catch (error) {
			errors = [(error as Error).message]
		}
		if (errors.length === 0) continue
		failed = true
		console.error(`check:notices FAILED: ${notices}`)
		for (const error of errors) console.error(`  - ${error}`)
	}
	if (failed) {
		process.exitCode = 1
		return
	}
	console.log('check:notices OK (every asset of the core and font of the demo is listed)')
}

main()
