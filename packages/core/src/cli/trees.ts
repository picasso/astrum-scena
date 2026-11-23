import path from 'node:path'

// the gates read two trees, the installed core's `src/` and the site, and name every file by its POSIX
// path relative to one base (the directory the CLI runs in), so a relative import resolves across them

export type SourceFile = { file: string; source: string }
export type Trees = { coreSrc: string; siteRoot: string }

export const sitePath = (siteRoot: string, relative: string): string =>
	path.posix.join(siteRoot, relative)
