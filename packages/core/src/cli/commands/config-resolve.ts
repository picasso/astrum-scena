import { renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { resolveSiteLock, SITE_LOCK_PATH } from '../../config/lock.ts'
import { type CliContext, label } from '../context.ts'

// writes the site's site.lock.yaml from its site config and the core defaults; a config that fails
// resolve leaves the lock as it was. A rerun is byte-identical.
export function configResolve(context: CliContext): number {
	const outputPath = path.join(context.root, SITE_LOCK_PATH)
	let text: string
	try {
		text = resolveSiteLock(context.root)
	} catch (error) {
		context.err(`config resolve FAIL: ${(error as Error).message}`)
		return 1
	}
	const tempPath = `${outputPath}.${process.pid}.tmp`
	writeFileSync(tempPath, text, 'utf8')
	renameSync(tempPath, outputPath)
	context.out('config resolve OK')
	context.out(`  path: ${label(context, outputPath)}`)
	return 0
}
