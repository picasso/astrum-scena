import type { CollectionConfig } from 'astro/content/config'
import { glob } from 'astro/loaders'
import { defineCollection } from 'astro:content'

import { COLLECTION_SOURCES, LOCALIZED_DOCUMENT_PATTERN } from './config/collection-sources.ts'
import { loadSiteSection } from './config/loader.ts'
import { siteRoot } from './config/site-root.ts'
import { localizedDocumentLoader } from './lib/content/localized-glob.ts'
import {
	albumSchema,
	articleSchema,
	legalSchema,
	pageSchema,
	photoSchema,
} from './lib/content/schemas.ts'
import type { courseSchema } from './modules/courses/schema.ts'
import { enabledModules, moduleCollections } from './modules/registry.ts'

export type CoreCollections = {
	albums: CollectionConfig<typeof albumSchema>
	articles: CollectionConfig<typeof articleSchema>
	legal: CollectionConfig<typeof legalSchema>
	pages: CollectionConfig<typeof pageSchema>
	photos: CollectionConfig<typeof photoSchema>
}

// the collections of every module, typed for the core's own code; a build defines only those of the
// modules its lock enables
export type ModuleCollections = {
	courses: CollectionConfig<typeof courseSchema>
}

// the site's `src/content.config.ts` is one line: `export const collections = defineCoreCollections()`.
// Loader bases are relative to the site root, which Astro resolves them against. The enabled modules
// come from the site's lock, so enabling one is an edit of site.yaml and
// `astrum-scena config resolve`.
export function defineCoreCollections(): CoreCollections & ModuleCollections {
	const modules = enabledModules({ modules: loadSiteSection(siteRoot, 'modules') })
	const moduleEntries = Object.entries(moduleCollections(modules)).map(([name, collection]) => [
		name,
		defineCollection({
			loader:
				collection.source.pattern === LOCALIZED_DOCUMENT_PATTERN
					? localizedDocumentLoader(collection.source)
					: glob({ ...collection.source }),
			schema: collection.schema,
		}),
	])
	return {
		albums: defineCollection({
			loader: glob({ ...COLLECTION_SOURCES.albums }),
			schema: albumSchema,
		}),
		articles: defineCollection({
			loader: localizedDocumentLoader(COLLECTION_SOURCES.articles),
			schema: articleSchema,
		}),
		legal: defineCollection({
			loader: localizedDocumentLoader(COLLECTION_SOURCES.legal),
			schema: legalSchema,
		}),
		pages: defineCollection({
			loader: localizedDocumentLoader(COLLECTION_SOURCES.pages),
			schema: pageSchema,
		}),
		photos: defineCollection({
			loader: glob({ ...COLLECTION_SOURCES.photos }),
			schema: photoSchema,
		}),
		...(Object.fromEntries(moduleEntries) as ModuleCollections),
	}
}
