import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
	findBinaryLocalPaths,
	findLocalPaths,
	isBinary,
	readScannedFile,
} from './lib/local-paths.ts'

// gate: no absolute path from the owner's machine in the repository (patterns in lib/local-paths.ts).
// Tracked and new non-ignored files are scanned, so a path is caught before it is committed; a
// binary file has no lines, so its offenders are reported by file alone.

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
	for (const file of repositoryFiles()) {
		const buffer = await readScannedFile(file)
		if (!buffer) continue
		if (isBinary(buffer)) {
			for (const found of findBinaryLocalPaths(buffer)) offenders.push(`${file}: ${found}`)
			continue
		}
		const lines = buffer.toString('utf8').split('\n')
		lines.forEach((line, index) => {
			for (const found of findLocalPaths(line))
				offenders.push(`${file}:${index + 1}: ${found}`)
		})
	}
	if (offenders.length > 0) {
		console.error('check:local-paths FAILED — absolute local paths found:')
		for (const offender of offenders) console.error(`  - ${offender}`)
		console.error(
			'Use a named root from .env.example (e.g. $REFERENCE_SITE_ROOT) instead of the real path.',
		)
		process.exitCode = 1
		return
	}
	console.log('check:local-paths OK (no absolute local paths)')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
