import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { type CoreBundle, type CoreItem, filesUnder, stampVersion } from './bundle.ts'

// the core's skills and agents as the site holds them. A site may link one skill root to the other
// (`.agents/skills` → `.claude/skills`) or a skill to its twin, so each item is placed at its real
// path and an item whose real path another already takes is written and checked once

export type SiteItem = CoreItem & { realPath: string }

// the path `file` names once every symlink on the way is followed, also when it or its target does not
// exist yet
export function realPathOf(file: string): string {
	if (existsSync(file)) return realpathSync(file)
	const link = lstatSync(file, { throwIfNoEntry: false })
	if (link?.isSymbolicLink())
		return realPathOf(path.resolve(path.dirname(file), readlinkSync(file)))
	const parent = path.dirname(file)
	return parent === file ? file : path.join(realPathOf(parent), path.basename(file))
}

export function siteItems(root: string, bundle: CoreBundle): SiteItem[] {
	const seen = new Set<string>()
	return bundle.items.flatMap((item) => {
		const realPath = realPathOf(path.join(root, item.sitePath))
		if (seen.has(realPath)) return []
		seen.add(realPath)
		return [{ ...item, realPath }]
	})
}

export type ItemState =
	| { state: 'missing' }
	| { state: 'current' }
	// installed by the core, at `version`, and since changed or of another version
	| { state: 'stale'; version: string }
	// a file or directory of the site under a name of the core
	| { state: 'foreign' }

const sameFiles = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean =>
	a.size === b.size && [...a].every(([file, text]) => b.get(file) === text)

export function inspect(item: SiteItem): ItemState {
	const stat = statSync(item.realPath, { throwIfNoEntry: false })
	if (!stat) return { state: 'missing' }
	const isDirectory = item.kind === 'directory'
	if (isDirectory ? !stat.isDirectory() : !stat.isFile()) return { state: 'foreign' }
	const files = isDirectory
		? filesUnder(item.realPath)
		: new Map([['', readFileSync(item.realPath, 'utf8')]])
	const version = stampVersion(files.get(item.stampFile))
	if (version === undefined) return { state: 'foreign' }
	return sameFiles(files, item.files) ? { state: 'current' } : { state: 'stale', version }
}

// the directory is replaced as a whole, so a file the site added to a core skill goes too
export function writeItem(item: SiteItem): void {
	if (item.kind === 'file') {
		mkdirSync(path.dirname(item.realPath), { recursive: true })
		writeFileSync(item.realPath, item.files.get('')!)
		return
	}
	rmSync(item.realPath, { recursive: true, force: true })
	for (const [file, text] of item.files) {
		const target = path.join(item.realPath, file)
		mkdirSync(path.dirname(target), { recursive: true })
		writeFileSync(target, text)
	}
}
