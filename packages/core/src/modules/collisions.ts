import { readFileSync } from 'node:fs'
import path from 'node:path'

import { MDX_COMPONENT_PROPS } from '../components/content/mdx-component-props.ts'
import { COLLECTION_SOURCES } from '../config/collection-sources.ts'
import { moduleKeys, UI_KEYS } from '../i18n/dictionaries.ts'
import { coreSegments } from '../integration-parts.ts'
import { DIRECTIVE_ATTRIBUTES } from '../lib/blocks/directives.ts'
import { parseTokenList } from '../theme/tokens.ts'
import { CORE_TOKENS_FILE } from '../theme/tokens-plugin.ts'
import type { ModuleManifest } from './manifest.ts'

// the names a module may not take: the core's own, then those of every other module. The checks are
// pure over manifests and an explicit set of the core's names, so a fixture module exercises each of
// them; a second source of names (a site's drafts) is one more list of manifests

export type CoreNames = {
	// each collection with the directory its loader reads, relative to the site root
	collections: Readonly<Record<string, { readonly base: string }>>
	// the first segments under `/{locale}/` the core's pages serve
	segments: readonly string[]
	mdx: readonly string[]
	directives: readonly string[]
	// the theme contract (`api-snapshot/tokens.json`)
	tokens: readonly string[]
	// the first segments of the core's dictionary keys
	namespaces: readonly string[]
}

const namespaceOf = (key: string): string => key.split('.')[0]!

// the core's names from the sources the core already reads
export const coreNames = (): CoreNames => ({
	collections: COLLECTION_SOURCES,
	segments: coreSegments(),
	mdx: Object.keys(MDX_COMPONENT_PROPS),
	directives: Object.keys(DIRECTIVE_ATTRIBUTES),
	tokens: Object.keys(parseTokenList(readFileSync(CORE_TOKENS_FILE, 'utf8'), CORE_TOKENS_FILE)),
	namespaces: [...new Set(UI_KEYS.map(namespaceOf))],
})

// "the core" or `module "<id>"`; the possessive of either reads "the core's", `module "a"'s`
type Owner = { owner: string; names: ReadonlySet<string> }
type Source = { base: string; owner: string; collection: string }

const CORE = 'the core'

// the owner of `name` among the core and the modules declared before this one
const ownerOf = (name: string, owners: readonly Owner[]): string | undefined => {
	const found = owners.find((owner) => owner.names.has(name))
	return found && `${found.owner}'s`
}

const normalizedBase = (base: string): string => path.posix.normalize(base).replace(/\/+$/, '')

// `.` is the site root, around every other directory
const contains = (outer: string, inner: string): boolean =>
	outer === '.' ? inner !== '.' : inner.startsWith(`${outer}/`)

// a loader whose directory is another's, or lies inside or around it, reads the other's files
function sourceCollision(base: string, sources: readonly Source[]): string | undefined {
	for (const source of sources) {
		const where =
			source.owner === CORE
				? `the core collection "${source.collection}"`
				: `collection "${source.collection}" of ${source.owner}`
		if (base === source.base) return `is the source of ${where}`
		if (contains(source.base, base)) return `is inside ${where}`
		if (contains(base, source.base)) return `contains ${where}`
	}
	return undefined
}

// every name of the given modules that the core or an earlier module already owns, one line each
export function moduleCollisions(
	modules: readonly ModuleManifest[],
	core: CoreNames = coreNames(),
): string[] {
	const errors: string[] = []
	const seen = new Set<string>()
	const of = (names: Iterable<string>): Owner[] => [{ owner: CORE, names: new Set(names) }]
	const owners = {
		collections: of(Object.keys(core.collections)),
		segments: of(core.segments),
		mdx: of(core.mdx),
		directives: of(core.directives),
		tokens: of(core.tokens),
		namespaces: of(core.namespaces),
	}
	const sources: Source[] = Object.entries(core.collections).map(([collection, { base }]) => ({
		base: normalizedBase(base),
		owner: CORE,
		collection,
	}))

	for (const module of modules) {
		if (seen.has(module.id)) {
			errors.push(`module id "${module.id}" is declared twice`)
			continue
		}
		seen.add(module.id)
		const report = (what: string, owner: string | undefined) => {
			if (owner) errors.push(`module "${module.id}": ${what} is ${owner}`)
		}

		const owner = `module "${module.id}"`
		for (const [name, collection] of Object.entries(module.collections)) {
			report(`collection "${name}"`, ownerOf(name, owners.collections))
			const base = normalizedBase(collection.source.base)
			const collision = sourceCollision(base, sources)
			if (collision)
				errors.push(
					`module "${module.id}": collection "${name}" source "${collection.source.base}" ${collision}`,
				)
			// a later collection of the same module may not read this one's files either
			sources.push({ base, owner, collection: name })
		}
		for (const segment of module.segments)
			report(`segment "${segment}"`, ownerOf(segment, owners.segments))
		for (const segment of module.menu.filter((segment) => !module.segments.includes(segment)))
			report(`menu segment "${segment}"`, ownerOf(segment, owners.segments))
		for (const name of module.mdx) report(`MDX component "${name}"`, ownerOf(name, owners.mdx))
		for (const name of module.directives)
			report(`directive "${name}"`, ownerOf(name, owners.directives))
		for (const name of module.tokens) report(`token "${name}"`, ownerOf(name, owners.tokens))
		const { namespace } = module.i18n
		// `nav.extra` puts its keys under the core's `nav.`, so the first segment is what collides
		report(`namespace "${namespace}"`, ownerOf(namespaceOf(namespace), owners.namespaces))
		for (const key of moduleKeys(module).filter((key) => !key.startsWith(`${namespace}.`)))
			errors.push(`module "${module.id}": key "${key}" is outside namespace "${namespace}"`)

		owners.collections.push({ owner, names: new Set(Object.keys(module.collections)) })
		owners.segments.push({ owner, names: new Set([...module.segments, ...module.menu]) })
		owners.mdx.push({ owner, names: new Set(module.mdx) })
		owners.directives.push({ owner, names: new Set(module.directives) })
		owners.tokens.push({ owner, names: new Set(module.tokens) })
		owners.namespaces.push({ owner, names: new Set([namespaceOf(namespace)]) })
	}
	return errors
}

// a page the `[locale]/[slug]` route builds under a segment a static route of the core or of an
// enabled module serves would be silently shadowed by that route; a disabled module has no route
export function slugCollisions(
	pages: readonly { id: string; slug: string }[],
	modules: readonly ModuleManifest[],
	segments: readonly string[] = coreSegments(),
): string[] {
	return pages.flatMap(({ id, slug }) => {
		const module = modules.find((candidate) => candidate.segments.includes(slug))
		const owner = segments.includes(slug) ? CORE : module && `module "${module.id}"`
		return owner ? [`page "${id}": slug "${slug}" is the route segment of ${owner}`] : []
	})
}
