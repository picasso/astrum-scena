import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'

// writes and especially a recursive `rm` under `.cache/` must not follow a symlink outside the site
// or into a tracked location inside it (`.cache` -> `src/`)

export const IMAGES_CACHE_RELATIVE_PATH = '.cache/images'

export const imagesCacheDir = (root: string): string => path.join(root, IMAGES_CACHE_RELATIVE_PATH)

// stat follows symlinks, so an intermediate symlink is still caught by the later realpath
export async function nearestExisting(target: string): Promise<string> {
	let probe = target
	for (;;) {
		try {
			await stat(probe)
			return probe
		} catch {
			const parent = path.dirname(probe)
			if (parent === probe) return probe
			probe = parent
		}
	}
}

// comparing against realpath(root) keeps the check correct when the root itself sits under a symlink
export async function assertCacheWithinRoot(target: string, root: string): Promise<void> {
	const anchor = await nearestExisting(target)
	const suffix = path.relative(root, anchor)
	// lexical containment first: a plain `/etc` or `root/../x` would pass the symlink check alone
	if (suffix === '..' || suffix.startsWith(`..${path.sep}`) || path.isAbsolute(suffix)) {
		throw new Error('output cache path is outside the site root (rejected)')
	}
	const [realAnchor, realRoot] = await Promise.all([realpath(anchor), realpath(root)])
	const expected = suffix ? path.join(realRoot, suffix) : realRoot
	if (realAnchor !== expected) {
		throw new Error('output cache path traverses a symlink (rejected)')
	}
}
