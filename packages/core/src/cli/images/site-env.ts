import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

import type { CliContext } from '../context.ts'

// the variables an image command reads: the process environment over the site's gitignored `.env`,
// read from the site root and never from the current directory. An empty value counts as unset, so
// a blank process variable does not hide the file's

export const SITE_ENV_FILE = '.env'

export type SiteEnv = Readonly<Record<string, string | undefined>>

export function siteEnv(context: Pick<CliContext, 'root' | 'env'>): SiteEnv {
	let file: Record<string, string> = {}
	try {
		file = parseEnv(readFileSync(path.join(context.root, SITE_ENV_FILE), 'utf8')) as Record<
			string,
			string
		>
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
	}
	const merged: Record<string, string | undefined> = {}
	for (const [name, value] of Object.entries(file)) if (value !== '') merged[name] = value
	for (const [name, value] of Object.entries(context.env))
		if (value !== undefined && value !== '') merged[name] = value
	return merged
}
