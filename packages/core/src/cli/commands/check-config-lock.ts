import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { resolveSiteLock, SITE_LOCK_PATH } from '../../config/lock.ts'
import { type CliContext, command, label } from '../context.ts'

// fails when the site's committed site.lock.yaml differs byte for byte from what resolve makes of its
// config now, i.e. the config or a core default changed without a resolve, or the lock was edited by
// hand
export function checkConfigLock(context: CliContext): number {
	const lockPath = path.join(context.root, SITE_LOCK_PATH)
	const fail = (message: string): number => {
		context.err(`check config-lock FAIL: ${message}`)
		return 1
	}
	let expected: string
	try {
		expected = resolveSiteLock(context.root)
	} catch (error) {
		return fail((error as Error).message)
	}
	const actual = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : undefined
	if (actual !== expected)
		return fail(
			`${SITE_LOCK_PATH} is stale; run ${command(context, 'config resolve')} (${label(context, lockPath)})`,
		)
	context.out('check config-lock OK')
	context.out(`  path: ${label(context, lockPath)}`)
	return 0
}
