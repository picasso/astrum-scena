import type { z } from 'astro/zod'

import type { Locale } from '../config/locale-schema.ts'

// what an optional feature of the core declares about itself. A site enables a module with its section
// `modules.<id>` in site.yaml, which resolve checks with `config`; everything else the core does for a
// module (collections, routes, menu segments, dictionaries) reads this object and nothing else, so a
// disabled module leaves no trace in a build

export type ModuleCollection = {
	// relative to the site root, as the core's own collections (config/collection-sources.ts)
	source: { readonly base: string; readonly pattern: string }
	schema: z.ZodType
	// the shapes the core reads, the last one current; the lock records the one a site is on
	versions: readonly [number, ...number[]]
}

export type ModuleDictionary = Readonly<Record<string, string>>

export type ModuleManifest<Id extends string = string, Config extends z.ZodType = z.ZodType> = {
	id: Id
	collections: Readonly<Record<string, ModuleCollection>>
	// an absolute directory routed like the core's `src/pages` (integration-parts.ts `coreRoutes`)
	pagesDir: string
	// the first path segments under `/{locale}/` that the module's pages own
	segments: readonly string[]
	// the schema of `modules.<id>`, with the module's defaults; `{}` enables it with all of them
	config: Config
	// every key starts with `<namespace>.`; a dictionary per locale of the default catalog, complete
	// like the core's
	i18n: { namespace: string; dictionaries: Readonly<Partial<Record<Locale, ModuleDictionary>>> }
	mdx: readonly string[]
	directives: readonly string[]
	// theme tokens the module's styles read
	tokens: readonly string[]
	// the segments a site may put in `menu.items` once the module is enabled
	menu: readonly string[]
	// modules that must be enabled with this one
	dependsOn: readonly string[]
	// the `moreDocs` target kinds (`kind` of `moreDocs.docs[]`) that point at the module's documents
	moreDocsKinds: readonly string[]
	// the banner photo of each surface the module's pages render, from its section (`off` for none);
	// the core checks and resolves them with its own surfaces (lib/banner)
	surfaceBanners?: (config: z.output<Config>) => Readonly<Record<string, string>>
}

export const defineModule = <const Id extends string, Config extends z.ZodType>(
	manifest: ModuleManifest<Id, Config>,
): ModuleManifest<Id, Config> => manifest
