import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { extractSnapshot, serializeSurface, snapshotDirArg, SURFACES } from './lib/api-surface.ts'

// writes the consumer API snapshot of the core, one JSON file per surface (`--update`); without the flag
// it prints the snapshot. `pnpm check:api-snapshot` fails until the committed files match the source.

function main(): void {
	const snapshot = extractSnapshot()
	if (!process.argv.includes('--update')) {
		console.log(JSON.stringify(snapshot, null, '\t'))
		return
	}
	const dir = snapshotDirArg()
	mkdirSync(dir, { recursive: true })
	for (const surface of SURFACES) {
		const file = path.join(dir, `${surface}.json`)
		writeFileSync(`${file}.tmp`, serializeSurface(snapshot[surface]), 'utf8')
		renameSync(`${file}.tmp`, file)
	}
	console.log('api:snapshot OK')
	console.log(`  dir: ${path.relative(process.cwd(), dir) || '.'}`)
}

main()
