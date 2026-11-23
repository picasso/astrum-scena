import { readdirSync } from 'node:fs'
import path from 'node:path'

// every third-party-relevant file is named, as a code span, in the notices file of its scope; a path
// is relative to the scope's base, and only file paths under the scanned roots (not a directory,
// which ends with `/`) are matched against the tree

export type NoticeScope = { notices: string; base: string; roots: readonly string[] }

export const NOTICE_SCOPES: readonly NoticeScope[] = [
	{
		notices: 'packages/core/THIRD_PARTY_NOTICES.md',
		base: 'packages/core',
		roots: ['src/assets'],
	},
	{ notices: 'THIRD_PARTY_NOTICES.md', base: '.', roots: ['demo/public/fonts'] },
]

const CODE_SPAN = /`([^`\n]+)`/g

export function listedPaths(markdown: string): Set<string> {
	return new Set([...markdown.matchAll(CODE_SPAN)].map((match) => match[1]!))
}

// dot files (`.DS_Store`) are system litter, not assets
export function listFiles(base: string, root: string): string[] {
	const entries = readdirSync(path.join(base, root), { recursive: true, withFileTypes: true })
	return entries
		.filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
		.map((entry) =>
			path.relative(base, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
		)
		.sort()
}

export function checkNotices(
	markdown: string,
	files: readonly string[],
	roots: readonly string[],
): string[] {
	const listed = listedPaths(markdown)
	const present = new Set(files)
	const errors = files
		.filter((file) => !listed.has(file))
		.map((file) => `${file}: not listed in the notices`)
	for (const entry of listed)
		if (
			!entry.endsWith('/') &&
			roots.some((root) => entry.startsWith(`${root}/`)) &&
			!present.has(entry)
		)
			errors.push(`${entry}: listed in the notices but not in the tree`)
	return errors
}
