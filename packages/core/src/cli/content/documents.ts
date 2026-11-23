import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { COLLECTION_SOURCES, LOCALIZED_DOCUMENT_PATTERN } from '../../config/collection-sources.ts'
import { lockedModules } from '../../lib/content/files.ts'
import {
	type DocumentCollection,
	type ParsedDocumentFile,
	parseDocumentFile,
} from '../../lib/content/translation-marker.ts'
import type { ModuleManifest } from '../../modules/manifest.ts'
import { moduleCollections } from '../../modules/registry.ts'

// the lister of the localized documents of a site: `articles`, `pages` and the document collections
// of the enabled modules, read where their loaders read. Every file is parsed fail-closed (its name
// must agree with its frontmatter), and the error names it from the site root

const MODULE_DOCUMENT_COLLECTIONS: readonly string[] = ['courses'] satisfies DocumentCollection[]

const isDocumentCollection = (name: string): name is DocumentCollection =>
	MODULE_DOCUMENT_COLLECTIONS.includes(name)

export type DocumentFiles = {
	files: ParsedDocumentFile[]
	// the absolute path each file was read from
	pathOf: (file: ParsedDocumentFile) => string
}

const documentSources = (
	modules: readonly ModuleManifest[],
): { collection: DocumentCollection; base: string }[] => [
	{ collection: 'articles', base: COLLECTION_SOURCES.articles.base },
	{ collection: 'pages', base: COLLECTION_SOURCES.pages.base },
	...Object.entries(moduleCollections(modules))
		.filter(([, { source }]) => source.pattern === LOCALIZED_DOCUMENT_PATTERN)
		.flatMap(([name, { source }]) =>
			isDocumentCollection(name) ? [{ collection: name, base: source.base }] : [],
		),
]

async function documentPaths(directory: string): Promise<string[]> {
	let entries
	try {
		entries = await readdir(directory, { recursive: true, withFileTypes: true })
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
		throw error
	}
	return entries
		.filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
		.map((entry) => path.join(entry.parentPath, entry.name))
		.sort()
}

export async function loadDocumentFiles(
	root: string,
	modules: readonly ModuleManifest[] = lockedModules(root),
): Promise<DocumentFiles> {
	const paths = new Map<ParsedDocumentFile, string>()
	for (const { collection, base } of documentSources(modules)) {
		for (const filePath of await documentPaths(path.resolve(root, base))) {
			const raw = await readFile(filePath, 'utf8')
			try {
				paths.set(
					parseDocumentFile({ collection, filename: path.basename(filePath), raw }),
					filePath,
				)
			} catch (error) {
				const file = path.relative(root, filePath).split(path.sep).join('/')
				throw new Error(`${file}: ${(error as Error).message}`, { cause: error })
			}
		}
	}
	return { files: [...paths.keys()], pathOf: (file) => paths.get(file)! }
}
