import path from 'node:path'

import {
	coreEnvReads,
	extractSnapshot,
	formatChange,
	readSnapshotDir,
	snapshotDirArg,
	snapshotDrift,
	surfaceFile,
	undeclaredEnv,
} from './lib/api-surface.ts'
import { CORE_SRC } from './lib/site-root.ts'

// always-on gate of the core's consumer API: the committed snapshot in packages/core/api-snapshot/
// must match the source, and every env name the core sources read (under the working directory, like
// the other source gates) must be declared public or internal in src/consumer-env.ts. A site's theme is
// checked against the token list by the integration itself, when the site builds or runs `astro dev`.

const UPDATE = 'Update the snapshot: pnpm api:snapshot.'

function main(): void {
	const problems: string[] = []

	for (const read of undeclaredEnv(coreEnvReads(path.resolve(path.dirname(CORE_SRC)))))
		problems.push(
			`env ${read.name} is read at packages/core/${read.file}:${read.line} but not declared in packages/core/src/consumer-env.ts`,
		)

	const snapshot = extractSnapshot()
	const dir = snapshotDirArg()
	const drift = snapshotDrift(snapshot, readSnapshotDir(dir))
	for (const { surface, missing, changes } of drift) {
		const file = path.relative(process.cwd(), path.join(dir, surfaceFile(surface)))
		if (missing) problems.push(`${surface}: ${file} is missing. ${UPDATE}`)
		else if (changes.length === 0)
			problems.push(`${surface}: ${file} is not in its generated form. ${UPDATE}`)
		else
			problems.push(
				`${surface}: ${file} differs from the source. ${UPDATE}`,
				...changes.map((change) => `  ${formatChange(change)}`),
			)
	}

	if (problems.length > 0) {
		console.error('check:api-snapshot FAILED:')
		for (const problem of problems) console.error(`  - ${problem}`)
		process.exitCode = 1
		return
	}
	console.log('check:api-snapshot OK')
}

main()
