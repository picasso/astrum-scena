import path from 'node:path'

// repository gates check two trees: the core sources, fixed inside the workspace, and the files of a
// site, whose root (relative to the repository root) comes from `--site <dir>` and defaults to the demo

export const CORE_SRC = 'packages/core/src'
export const DEFAULT_SITE_ROOT = 'demo'

export function siteRootArg(argv: readonly string[] = process.argv.slice(2)): string {
	const index = argv.indexOf('--site')
	if (index === -1) return DEFAULT_SITE_ROOT
	const value = argv[index + 1]
	if (!value || value.startsWith('--')) throw new Error('--site needs a directory')
	const normalized = path.posix.normalize(value.replaceAll('\\', '/')).replace(/(.)\/+$/, '$1')
	if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(value))
		throw new Error(`--site must be relative to the repository root: ${value}`)
	if (normalized === '..' || normalized.startsWith('../'))
		throw new Error(`--site must stay inside the repository: ${value}`)
	return normalized
}

// a path inside the site, relative to the repository root
export const sitePath = (siteRoot: string, relative: string): string =>
	path.posix.join(siteRoot, relative)
