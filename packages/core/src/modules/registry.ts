import { readdirSync } from 'node:fs'
import path from 'node:path'

import { coursesModule } from './courses/manifest.ts'
import type { ModuleCollection, ModuleManifest } from './manifest.ts'

// the one list of the core's modules. A module is enabled by its section `modules.<id>` of site.yaml;
// every consumer (the collection builder, routes, sitemap, menu, dictionaries, the content snapshot)
// asks the lock which ones are enabled through `enabledModules`, read once with the rest of the config

export const MODULES: readonly [typeof coursesModule] = [coursesModule]

export type ModuleId = (typeof MODULES)[number]['id']

export const MODULE_IDS: readonly ModuleId[] = MODULES.map((module) => module.id)

// the `modules` section as the lock holds it: a key per enabled module
export type ModulesSection = Readonly<Partial<Record<string, unknown>>>

export const enabledModules = <M extends ModuleManifest>(
	site: { modules: ModulesSection },
	modules: readonly M[] = MODULES as unknown as readonly M[],
): M[] => modules.filter((module) => site.modules[module.id] !== undefined)

export const isModuleEnabled = (site: { modules: ModulesSection }, id: ModuleId): boolean =>
	site.modules[id] !== undefined

// a collection the build defines: any of the core's, or one of an enabled module
export const isCollectionDefined = (site: { modules: ModulesSection }, name: string): boolean => {
	const owner = MODULES.find((module) => Object.hasOwn(module.collections, name))
	return !owner || isModuleEnabled(site, owner.id)
}

// the collections of the given modules by name, as the builder and the content snapshot read them
export const moduleCollections = (
	modules: readonly ModuleManifest[],
): Record<string, ModuleCollection> =>
	Object.fromEntries(modules.flatMap((module) => Object.entries(module.collections)))

// ---------------------------------------------------------------------------------------------------
// checks: pure over manifests, so each runs on a fixture module in tests

export type ModuleIssue = { path: (string | number)[]; message: string }

const known = (modules: readonly ModuleManifest[]): string =>
	modules.map((module) => module.id).join(', ')

const sectionHint = (id: string): string => `site.yaml (modules.${id})`

// a dependency on a module the core lacks or the site has not enabled; the issue sits on the module
// that declares it
export function dependencyIssues(
	enabledIds: readonly string[],
	modules: readonly ModuleManifest[] = MODULES,
): ModuleIssue[] {
	const ids = new Set(modules.map((module) => module.id))
	return modules
		.filter((module) => enabledIds.includes(module.id))
		.flatMap((module) =>
			module.dependsOn.flatMap((dependency): ModuleIssue[] => {
				if (!ids.has(dependency))
					return [
						{
							path: ['modules', module.id],
							message: `depends on unknown module "${dependency}"; known: ${known(modules)}`,
						},
					]
				if (!enabledIds.includes(dependency))
					return [
						{
							path: ['modules', module.id],
							message: `depends on module "${dependency}", which is not enabled`,
						},
					]
				return []
			}),
		)
}

export const moduleOfMenuSegment = (
	segment: string,
	modules: readonly ModuleManifest[] = MODULES,
): ModuleManifest | undefined => modules.find((module) => module.menu.includes(segment))

// a menu item the site writes for a module it has not enabled would link to a page that is not built
export function disabledMenuSegmentIssues(
	items: readonly { segment: string }[],
	enabledIds: readonly string[],
	modules: readonly ModuleManifest[] = MODULES,
): ModuleIssue[] {
	return items.flatMap((item, index) => {
		const owner = moduleOfMenuSegment(item.segment, modules)
		return owner && !enabledIds.includes(owner.id)
			? [
					{
						path: ['menu', 'items', index, 'segment'],
						message: `"${item.segment}" belongs to module "${owner.id}", which is not enabled`,
					},
				]
			: []
	})
}

// `known` is every segment the build serves: the core's sections, the enabled modules' and the slugs
// of the published generic pages
export function unknownMenuSegmentIssues(
	items: readonly { segment: string }[],
	known: readonly string[],
): ModuleIssue[] {
	return items.flatMap((item, index) =>
		known.includes(item.segment)
			? []
			: [
					{
						path: ['menu', 'items', index, 'segment'],
						message: `"${item.segment}" is not a known segment; known: ${[...known].sort().join(', ')}`,
					},
				],
	)
}

// any file or link but a hidden one (`.DS_Store`) counts as content
const hasFiles = (directory: string): boolean => {
	try {
		return readdirSync(directory, { recursive: true, withFileTypes: true }).some(
			(entry) => (entry.isFile() || entry.isSymbolicLink()) && !entry.name.startsWith('.'),
		)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
		throw error
	}
}

// content of a module the site has not enabled would silently never be built
export function disabledModuleContentErrors(
	root: string,
	enabledIds: readonly string[],
	modules: readonly ModuleManifest[] = MODULES,
): string[] {
	return modules
		.filter((module) => !enabledIds.includes(module.id))
		.flatMap((module) =>
			Object.values(module.collections)
				.map((collection) => path.posix.normalize(collection.source.base))
				.filter((base) => hasFiles(path.resolve(root, base)))
				.map(
					(base) =>
						`${base}: content of module "${module.id}", which is not enabled in ${sectionHint(module.id)}`,
				),
		)
}
