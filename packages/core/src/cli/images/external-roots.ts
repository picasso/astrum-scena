import path from 'node:path'

import { type CliContext, stringOption } from '../context.ts'
import { type SiteEnv, siteEnv } from './site-env.ts'

// the masters and the year-organized archive live outside the site, and their absolute paths never
// reach Git: they come from an option or from the environment. A relative option resolves against
// the current directory, a relative variable against the site root

export const MASTERS_OPTION = '--masters'
export const ARCHIVE_OPTION = '--archive'

export type ExternalRoots = { mastersRoot: string; archiveRoot: string }

// the error names the options and the variables, never their values
export function resolveExternalRoots(
	context: Pick<CliContext, 'cwd' | 'root' | 'options' | 'env'>,
	env: SiteEnv = siteEnv(context),
): ExternalRoots {
	const fromOption = (name: string) => {
		const value = stringOption(context, name)
		return value === undefined ? undefined : path.resolve(context.cwd, value)
	}
	const fromEnv = (value: string | undefined) =>
		value === undefined ? undefined : path.resolve(context.root, value)
	const mastersRoot = fromOption(MASTERS_OPTION) ?? fromEnv(env.IMAGES_MASTERS_ROOT)
	const archiveRoot = fromOption(ARCHIVE_OPTION) ?? fromEnv(env.IMAGES_ARCHIVE_ROOT)
	if (mastersRoot !== undefined && archiveRoot !== undefined) return { mastersRoot, archiveRoot }
	const missing = [
		...(mastersRoot === undefined ? [`${MASTERS_OPTION} or IMAGES_MASTERS_ROOT`] : []),
		...(archiveRoot === undefined ? [`${ARCHIVE_OPTION} or IMAGES_ARCHIVE_ROOT`] : []),
	]
	throw new Error(
		`the masters and the archive are outside the site; missing: ${missing.join('; ')}. ` +
			'Pass the option or set the variable in the environment or in .env at the site root.',
	)
}
