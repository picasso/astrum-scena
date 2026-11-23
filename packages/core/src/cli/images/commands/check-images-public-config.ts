import { readFileSync } from 'node:fs'
import path from 'node:path'

import { loadImageConfig } from '../../../lib/images/build/config.ts'
import { IMAGES_PUBLIC_RELATIVE_PATH } from '../../../lib/images/public-config.ts'
import { type CliContext, command, label } from '../../context.ts'
import { verifyPublicConfig } from '../public-config.ts'

// the tracked public config is byte-identical to a fresh projection of the images section
export function checkImagesPublicConfig(context: CliContext): number {
	const file = path.join(context.root, IMAGES_PUBLIC_RELATIVE_PATH)
	const regenerate = `Regenerate: ${command(context, 'images public-init')}.`
	const fail = (message: string): number => {
		context.err(`check images-public-config FAIL: ${message}`)
		return 1
	}
	let raw: string
	try {
		raw = readFileSync(file, 'utf8')
	} catch (error) {
		return fail(
			`public config missing (${label(context, file)}) — ${(error as Error).message}. ${regenerate}`,
		)
	}
	const verdict = verifyPublicConfig(raw, loadImageConfig(context.root))
	if (!verdict.ok) return fail(`${verdict.reason} (${label(context, file)}). ${regenerate}`)
	context.out('check images-public-config OK')
	context.out(`  path: ${label(context, file)}`)
	return 0
}
