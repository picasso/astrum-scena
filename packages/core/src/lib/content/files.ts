import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import type { z } from 'astro/zod'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import { COLLECTION_SOURCES, LOCALIZED_DOCUMENT_PATTERN } from '../../config/collection-sources.ts'
import { loadSiteSection } from '../../config/loader.ts'
import { LOCALE_FILE_PATTERN } from '../../config/locale-schema.ts'
import { UPGRADE_HINT } from '../../config/lock.ts'
import { assertSchemaVersion, type VersionedSchema } from '../../config/schema-version.ts'
import type { TaxonomyConfig } from '../../config/taxonomy.ts'
import { validate } from '../../config/yaml-file.ts'
import { COURSES_COLLECTION } from '../../modules/courses/manifest.ts'
import { courseSchema } from '../../modules/courses/schema.ts'
import type { ModuleManifest } from '../../modules/manifest.ts'
import { enabledModules, moduleCollections, MODULES } from '../../modules/registry.ts'
import { validateContentSnapshot } from './integrity.ts'
import type { ContentSnapshot } from './model.ts'
import {
	albumSchemaFor,
	articleSchema,
	categoriesConfigSchemaFor,
	legalSchema,
	type Locale,
	pageSchema,
	photoSchemaFor,
	placesConfigSchemaFor,
	tagsConfigSchemaFor,
} from './schemas.ts'

export function parseLeadingFrontmatter(value: string): {
	data: unknown
	body: string
} {
	const normalized = value.replace(/\r\n?/g, '\n')
	if (!normalized.startsWith('---\n'))
		throw new Error('Markdown entry must start with frontmatter')
	const end = normalized.indexOf('\n---\n', 4)
	if (end < 0) throw new Error('Markdown entry has no closing frontmatter delimiter')
	return {
		data: parseYaml(normalized.slice(4, end)),
		body: normalized.slice(end + 5),
	}
}

export function serializeYamlDocument(value: unknown): string {
	return stringifyYaml(value, {
		aliasDuplicateObjects: false,
		lineWidth: 0,
		sortMapEntries: false,
	})
}

export function serializeMarkdownDocument(data: unknown, body: string): string {
	const normalizedBody = body.replace(/\r\n?/g, '\n').trim()
	return `---\n${serializeYamlDocument(data)}---\n${normalizedBody ? `\n${normalizedBody}\n` : '\n'}`
}

async function regularFiles(directory: string, extension: RegExp): Promise<string[]> {
	try {
		const entries = await readdir(directory, { withFileTypes: true })
		const files = await Promise.all(
			entries.map(async (entry) => {
				const entryPath = path.join(directory, entry.name)
				if (entry.isDirectory()) return regularFiles(entryPath, extension)
				return entry.isFile() && extension.test(entry.name) ? [entryPath] : []
			}),
		)
		return files.flat().sort()
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
		throw error
	}
}

async function loadDataEntries<T>(
	root: string,
	directory: string,
	schema: { parse(value: unknown): T },
): Promise<{ id: string; data: T }[]> {
	const files = await regularFiles(directory, /\.ya?ml$/)
	return Promise.all(
		files.map(async (filePath) => ({
			id: path
				.relative(directory, filePath)
				.replaceAll(path.sep, '/')
				.replace(/\.ya?ml$/, ''),
			data: parseDataEntry(
				root,
				schema,
				filePath,
				parseYaml(await readFile(filePath, 'utf8')),
			),
		})),
	)
}

// an entry's schema error names the file from the site root and the field path
// (`src/content/albums/x.yaml: layout: …`)
// so the owner knows which entry to fix instead of a bare ZodError
function parseDataEntry<T>(
	root: string,
	schema: { parse(value: unknown): T },
	filePath: string,
	value: unknown,
): T {
	try {
		return schema.parse(value)
	} catch (error) {
		const issues = (error as { issues?: { path: PropertyKey[]; message: string }[] }).issues
		if (!issues) throw error
		const detail = issues
			.map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
			.join('; ')
		throw new Error(`${path.relative(root, filePath).split(path.sep).join('/')}: ${detail}`, {
			cause: error,
		})
	}
}

async function loadLocalizedEntries<T>(
	root: string,
	directory: string,
	schema: { parse(value: unknown): T },
): Promise<{ id: string; data: T }[]> {
	const files = await regularFiles(directory, /\.mdx?$/)
	return Promise.all(
		files.map(async (filePath) => {
			const match = LOCALE_FILE_PATTERN.exec(path.basename(filePath))
			if (!match) throw new Error(`Invalid localized content filename: ${filePath}`)
			const parsed = parseLeadingFrontmatter(await readFile(filePath, 'utf8'))
			return {
				id: `${match[1]}-${match[2]}`,
				data: parseDataEntry(root, schema, filePath, parsed.data),
			}
		}),
	)
}

// the only readers of the taxonomy files (`pnpm check:taxonomy-readers`), so a consumer that needs one
// of them, such as GPS bounds over the places, reads it without the other two
export const CATEGORIES_CONFIG_PATH = 'src/content/config/categories.yaml'
export const PLACES_CONFIG_PATH = 'src/content/config/places.yaml'
export const TAGS_CONFIG_PATH = 'src/content/config/tags.yaml'

// read by `loadFeaturedHome`; declared here, in a module the scripts load, so the API snapshot keys the
// featured schema by the same path
export const FEATURED_HOME_PATH = 'src/content/featured/home.yaml'

// the locales whose texts the site's localized data holds: `content.locales` of its lock
export const lockedLocales = (root: string): readonly Locale[] =>
	loadSiteSection(root, 'content').locales

// the enumerations of the site's taxonomy: `content.taxonomy` of its lock
export const lockedTaxonomy = (root: string): TaxonomyConfig =>
	loadSiteSection(root, 'content').taxonomy

async function loadConfigFile<T>(
	root: string,
	relativePath: string,
	schema: z.ZodType<T> & VersionedSchema,
): Promise<T> {
	const raw: unknown = parseYaml(await readFile(path.join(root, relativePath), 'utf8'))
	assertSchemaVersion(raw, relativePath, schema, UPGRADE_HINT)
	return validate(schema, raw, relativePath)
}

export async function loadCategoriesConfig(
	root: string,
	locales: readonly Locale[] = lockedLocales(root),
	categories: readonly string[] = lockedTaxonomy(root).categories,
) {
	return (
		await loadConfigFile(
			root,
			CATEGORIES_CONFIG_PATH,
			categoriesConfigSchemaFor(locales, categories),
		)
	).categories
}

export async function loadPlacesConfig(
	root: string,
	locales: readonly Locale[] = lockedLocales(root),
	kinds: readonly string[] = lockedTaxonomy(root).placeKinds,
) {
	return (await loadConfigFile(root, PLACES_CONFIG_PATH, placesConfigSchemaFor(locales, kinds)))
		.places
}

export async function loadTagsConfig(
	root: string,
	locales: readonly Locale[] = lockedLocales(root),
	kinds: readonly string[] = lockedTaxonomy(root).tagKinds,
) {
	return (await loadConfigFile(root, TAGS_CONFIG_PATH, tagsConfigSchemaFor(locales, kinds))).tags
}

export async function loadTaxonomyConfig(
	root: string,
	locales: readonly Locale[] = lockedLocales(root),
	taxonomy: TaxonomyConfig = lockedTaxonomy(root),
) {
	const [categories, places, tags] = await Promise.all([
		loadCategoriesConfig(root, locales, taxonomy.categories),
		loadPlacesConfig(root, locales, taxonomy.placeKinds),
		loadTagsConfig(root, locales, taxonomy.tagKinds),
	])
	return { categories, places, tags }
}

// the modules whose collections a snapshot reads: those the site's lock enables
export const lockedModules = (root: string): ModuleManifest[] =>
	enabledModules({ modules: loadSiteSection(root, 'modules') })

// the collections read from the directories their loaders read (COLLECTION_SOURCES and the enabled
// modules' collections); a disabled module's collection is empty
export async function loadContentSnapshot(
	root: string,
	modules: readonly ModuleManifest[] = lockedModules(root),
	locales: readonly Locale[] = lockedLocales(root),
	taxonomy: TaxonomyConfig = lockedTaxonomy(root),
): Promise<ContentSnapshot> {
	const at = (source: { base: string }) => path.resolve(root, source.base)
	const enabled = moduleCollections(modules)
	const [albums, photos, articles, pages, courses, config] = await Promise.all([
		loadDataEntries(
			root,
			at(COLLECTION_SOURCES.albums),
			albumSchemaFor(locales, taxonomy.categories),
		),
		loadDataEntries(root, at(COLLECTION_SOURCES.photos), photoSchemaFor(locales)),
		loadLocalizedEntries(root, at(COLLECTION_SOURCES.articles), articleSchema),
		loadLocalizedEntries(root, at(COLLECTION_SOURCES.pages), pageSchema),
		enabled[COURSES_COLLECTION]
			? loadLocalizedEntries(root, at(enabled[COURSES_COLLECTION].source), courseSchema)
			: [],
		loadTaxonomyConfig(root, locales, taxonomy),
	])
	return { albums, photos, articles, pages, courses, ...config }
}

// a `moreDocs` target of a module the site has not enabled names the file, the target and the module;
// the documents of the core and of the enabled modules are read
export async function moduleTargetErrors(
	root: string,
	enabled: readonly ModuleManifest[],
	modules: readonly ModuleManifest[] = MODULES,
): Promise<string[]> {
	const owners = new Map(
		modules
			.filter((module) => !enabled.some(({ id }) => id === module.id))
			.flatMap((module) => module.moreDocsKinds.map((kind) => [kind, module.id])),
	)
	if (owners.size === 0) return []
	const sources = [
		COLLECTION_SOURCES.articles,
		COLLECTION_SOURCES.pages,
		...Object.values(moduleCollections(enabled)).map((collection) => collection.source),
	].filter((source) => source.pattern === LOCALIZED_DOCUMENT_PATTERN)
	const files = (
		await Promise.all(
			sources.map((source) => regularFiles(path.resolve(root, source.base), /\.mdx?$/)),
		)
	).flat()
	const errors = await Promise.all(
		files.map(async (filePath) => {
			const { data } = parseLeadingFrontmatter(await readFile(filePath, 'utf8'))
			const docs = (data as { moreDocs?: { docs?: unknown } } | null)?.moreDocs?.docs
			if (!Array.isArray(docs)) return []
			const file = path.relative(root, filePath).replaceAll(path.sep, '/')
			return docs.flatMap((target: { kind?: unknown }, index) => {
				const owner = typeof target?.kind === 'string' ? owners.get(target.kind) : undefined
				return owner
					? [
							`${file}: moreDocs.docs.${index}.kind: "${target.kind as string}": module "${owner}" is not enabled in site.yaml (modules.${owner})`,
						]
					: []
			})
		}),
	)
	return errors.flat()
}

// a WordPress re-import (`import-wp`) must leave the legal texts intact
export const LEGAL_CONTENT_DIR = path.posix.normalize(COLLECTION_SOURCES.legal.base)

// legal texts a route renders unconditionally (`/rights/`, its URL is embedded in image metadata)
export const REQUIRED_LEGAL_KEYS = ['rights'] as const

// every legal text exists in every active locale, since its page renders one section per locale
export async function legalContentErrors(
	root: string,
	locales: readonly Locale[],
): Promise<string[]> {
	const entries = await loadLocalizedEntries(
		root,
		path.join(root, LEGAL_CONTENT_DIR),
		legalSchema,
	)
	const ids = new Set(entries.map((entry) => entry.id))
	const keys = new Set<string>([
		...REQUIRED_LEGAL_KEYS,
		...entries.map((entry) => entry.id.replace(/-[^-]+$/, '')),
	])
	return [...keys].flatMap((key) =>
		locales
			.filter((locale) => !ids.has(`${key}-${locale}`))
			.map((locale) => `${LEGAL_CONTENT_DIR}/${key}.${locale}.md is missing`),
	)
}

// an HTML or JSX `class`/`className`, or the directive form `{class="…"}`
const CLASS_ATTRIBUTE = /(?<![\w-])class(?:Name)?\s*=/gi
const LINE_BREAK = /\r\n|\r|\n/g

// content is outside the Tailwind sources (src/styles/global.css), so a class in a text would never get
// its CSS; articles are styled through components and directives
export async function classAttributeErrors(root: string): Promise<string[]> {
	const files = await regularFiles(path.join(root, 'src/content'), /\.(?:mdx?|ya?ml)$/)
	const errors = await Promise.all(
		files.map(async (filePath) => {
			const file = path.relative(root, filePath).replaceAll(path.sep, '/')
			const text = await readFile(filePath, 'utf8')
			return [...text.matchAll(CLASS_ATTRIBUTE)].map((match) => {
				const line = (text.slice(0, match.index).match(LINE_BREAK)?.length ?? 0) + 1
				return `${file}:${line}: class attribute in content; style through a component or directive`
			})
		}),
	)
	return errors.flat()
}

export async function assertValidRepositoryContent(
	root: string,
	referenceLocale: Locale,
	locales: readonly Locale[] = lockedLocales(root),
	modules?: readonly ModuleManifest[],
	taxonomy: TaxonomyConfig = lockedTaxonomy(root),
): Promise<ContentSnapshot> {
	const snapshot = await loadContentSnapshot(root, modules, locales, taxonomy)
	const result = validateContentSnapshot(snapshot, referenceLocale, locales)
	const legalErrors = await legalContentErrors(root, locales)
	if (legalErrors.length > 0)
		throw new Error(
			`Legal content failed:\n${legalErrors.map((error) => `- ${error}`).join('\n')}`,
		)
	const classErrors = await classAttributeErrors(root)
	if (classErrors.length > 0)
		throw new Error(
			`Content markup failed:\n${classErrors.map((error) => `- ${error}`).join('\n')}`,
		)
	if (!result.success) {
		throw new Error(
			`Content integrity failed:\n${result.errors
				.map((error) => `- [${error.code}] ${error.path}: ${error.message}`)
				.join('\n')}`,
		)
	}
	return snapshot
}
