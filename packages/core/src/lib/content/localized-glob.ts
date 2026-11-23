import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob, type Loader, type LoaderContext } from 'astro/loaders'

import { localizedDocumentId } from './localized-id.ts'

// accepts `.md` (plain text and directives) and `.mdx` (block components); the id ignores the
// extension. Astro glob only warns on a duplicate id and overwrites the earlier entry, so
// `foo.en.md` + `foo.en.mdx` would silently ship either body; the check lives in `generateId`
// because both the full sync and the dev watcher's single-file reload go through it

// a full load re-lists the directory, so it starts from a clean map; a deleted file frees its id, or
// a dev rename `.md` → `.mdx` would conflict with a source that no longer exists
export function createLocalizedIdGenerator(): {
	generateId: (entry: string) => string
	reset: () => void
	forget: (entry: string) => void
} {
	const sourceById = new Map<string, string>()

	return {
		generateId: (entry) => {
			const id = localizedDocumentId(entry)
			const existing = sourceById.get(id)
			if (existing && existing !== entry) {
				throw new Error(
					`Duplicate localized content id "${id}": "${existing}" and "${entry}" ` +
						'resolve to the same translation-key × locale pair',
				)
			}
			sourceById.set(id, entry)
			return id
		},
		reset: () => sourceById.clear(),
		forget: (entry) => {
			for (const [id, source] of sourceById) {
				if (source === entry) sourceById.delete(id)
			}
		},
	}
}

export function localizedDocumentLoader({
	base,
	pattern,
}: {
	base: string
	pattern: string
}): Loader {
	const ids = createLocalizedIdGenerator()
	let watching = false

	const inner = glob({
		base,
		generateId: ({ entry }) => ids.generateId(entry),
		pattern,
	})

	return {
		...inner,
		name: 'localized-document-loader',
		load: async (context: LoaderContext) => {
			ids.reset()
			await inner.load(context)

			if (watching || !context.watcher) return
			watching = true
			const baseDirectory = fileURLToPath(new URL(base, context.config.root))
			context.watcher.on('unlink', (deletedPath) => {
				ids.forget(path.relative(baseDirectory, deletedPath).split(path.sep).join('/'))
			})
		},
	}
}
