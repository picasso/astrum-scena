import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { Session } from 'node:inspector'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

import {
	PUBLICATION_LEDGER_PATH,
	publicationLedgerFileSchema,
} from '../../packages/core/src/cli/images/ledger.ts'
import {
	MASTERS_REGISTRY_PATH,
	mastersRegistryFileSchema,
} from '../../packages/core/src/cli/images/masters.ts'
import {
	PLACE_GPS_BOUNDS_PATH,
	placeGpsBoundsSchema,
} from '../../packages/core/src/cli/images/place-gps-bounds.ts'
import { BIN, cliSurface } from '../../packages/core/src/cli/registry.ts'
import { MDX_COMPONENT_PROPS } from '../../packages/core/src/components/content/mdx-component-props.ts'
import { COLLECTION_SOURCES } from '../../packages/core/src/config/collection-sources.ts'
import { DERIVED_FROM_KEYWORD } from '../../packages/core/src/config/images-schema.ts'
import { SUPPORTED_LOCALES } from '../../packages/core/src/config/locale-schema.ts'
import {
	SITE_CONFIG_PATH,
	SITE_LOCK_PATH,
	siteLockSchema,
} from '../../packages/core/src/config/lock.ts'
import { siteSchema } from '../../packages/core/src/config/site-schema.ts'
import { CONSUMER_ENV } from '../../packages/core/src/consumer-env.ts'
import { moduleKeys, siteDictionarySchema } from '../../packages/core/src/i18n/dictionaries.ts'
import { SITE_DICTIONARY_PATH } from '../../packages/core/src/i18n/site-dictionary-path.ts'
import {
	DIRECTIVE_ATTRIBUTES,
	type DirectiveAttribute,
} from '../../packages/core/src/lib/blocks/directives.ts'
import {
	IMAGE_SETS_CONFIG_PATH,
	imageSetsFileSchema,
} from '../../packages/core/src/lib/blocks/gallery/image-sets.ts'
import {
	FACTCHECK_RELATIVE_PATH,
	factcheckSchema,
} from '../../packages/core/src/lib/content/factcheck.ts'
import {
	CATEGORIES_CONFIG_PATH,
	FEATURED_HOME_PATH,
	PLACES_CONFIG_PATH,
	TAGS_CONFIG_PATH,
} from '../../packages/core/src/lib/content/files.ts'
import {
	albumSchemaFor,
	articleSchema,
	categoriesConfigSchemaFor,
	featuredConfigSchemaFor,
	legalSchema,
	pageSchema,
	photoSchemaFor,
	placesConfigSchemaFor,
	tagsConfigSchemaFor,
} from '../../packages/core/src/lib/content/schemas.ts'
import {
	imagePublicConfigSchema,
	IMAGES_PUBLIC_RELATIVE_PATH,
} from '../../packages/core/src/lib/images/public-config.ts'
import {
	RELEASE_DESCRIPTOR_RELATIVE_PATH,
	releaseDescriptorSchema,
} from '../../packages/core/src/lib/images/release.ts'
import { MODULES } from '../../packages/core/src/modules/registry.ts'
import { REPLACEMENT_POINTS } from '../../packages/core/src/overrides/points.ts'
import {
	declaredTokens,
	layoutTokens,
	type TokenUse,
} from '../../packages/core/src/theme/tokens.ts'

// the consumer API of the core as plain JSON, one file per surface, each derived from the source
// the core itself reads; and the classifier that splits a change of it into compatible and breaking.
// A change the classifier does not recognise is breaking.

export const CORE_DIR = fileURLToPath(new URL('../../packages/core/', import.meta.url))
export const SNAPSHOT_DIR = 'packages/core/api-snapshot'

export const SURFACES = [
	'exports',
	'cli',
	'site-files',
	'mdx-components',
	'directives',
	'tokens',
	'i18n',
	'env',
	'replacement-points',
	'modules',
] as const
export type Surface = (typeof SURFACES)[number]
export type Snapshot = Record<Surface, unknown>

export type SourceFile = { file: string; source: string }

// ---------------------------------------------------------------------------------------------------
// extraction

// the part of a zod schema the snapshot uses; the scripts do not depend on zod themselves
type Schema = {
	toJSONSchema(params: {
		io: 'input'
		unrepresentable: 'any'
		override: (context: { zodSchema: unknown; jsonSchema: object }) => void
	}): object
}

// the files a collection's loader reads, as the loader declares them
const collectionFiles = ({ base, pattern }: { base: string; pattern: string }, part = ''): string =>
	`${path.posix.join(base, pattern)}${part}`

// keyed by the site file a schema validates, not by the schema's name; a schema built from the site's
// `content.locales` is taken with every supported locale, the widest set a site may write
const SITE_FILE_SCHEMAS: Record<string, Schema> = {
	// the whole tree, its `seo` and `images` sections included
	[SITE_CONFIG_PATH]: siteSchema,
	// the effective config resolve writes from it, with the versions of the content collections
	[SITE_LOCK_PATH]: siteLockSchema,
	[collectionFiles(COLLECTION_SOURCES.albums)]: albumSchemaFor(SUPPORTED_LOCALES),
	[collectionFiles(COLLECTION_SOURCES.photos)]: photoSchemaFor(SUPPORTED_LOCALES),
	[collectionFiles(COLLECTION_SOURCES.articles, ' frontmatter')]: articleSchema,
	[collectionFiles(COLLECTION_SOURCES.pages, ' frontmatter')]: pageSchema,
	[collectionFiles(COLLECTION_SOURCES.legal, ' frontmatter')]: legalSchema,
	[CATEGORIES_CONFIG_PATH]: categoriesConfigSchemaFor(SUPPORTED_LOCALES),
	[PLACES_CONFIG_PATH]: placesConfigSchemaFor(SUPPORTED_LOCALES),
	[TAGS_CONFIG_PATH]: tagsConfigSchemaFor(SUPPORTED_LOCALES),
	[IMAGE_SETS_CONFIG_PATH]: imageSetsFileSchema,
	[FEATURED_HOME_PATH]: featuredConfigSchemaFor(SUPPORTED_LOCALES),
	[IMAGES_PUBLIC_RELATIVE_PATH]: imagePublicConfigSchema,
	[RELEASE_DESCRIPTOR_RELATIVE_PATH]: releaseDescriptorSchema,
	// read by the image commands only
	[PLACE_GPS_BOUNDS_PATH]: placeGpsBoundsSchema,
	// a first line with the version, then one row per line: `rows` holds the lines after it
	[MASTERS_REGISTRY_PATH]: mastersRegistryFileSchema,
	[PUBLICATION_LEDGER_PATH]: publicationLedgerFileSchema,
	// optional, read and written by the fact-check commands and gate
	[FACTCHECK_RELATIVE_PATH]: factcheckSchema,
	// one partial dictionary per active locale, over the core's (the `i18n` surface)
	[SITE_DICTIONARY_PATH]: siteDictionarySchema,
	// the collections of the modules, which a site has while it enables the module
	...Object.fromEntries(
		MODULES.flatMap((module) =>
			Object.values(module.collections).map((collection) => [
				collectionFiles(collection.source, ' frontmatter'),
				collection.schema,
			]),
		),
	),
}

// --- fingerprints: the checks and transforms JSON Schema cannot express. A check only rejects, so
// dropping one widens; a transform rewrites what a site wrote before the schema sees it, so dropping
// one rejects what it used to accept and any change of it is breaking

export const REFINEMENTS = 'x-refinements'
export const TRANSFORMS = 'x-transforms'

type ZodCheck = { _zod: { def: { check: string; fn?: unknown; tx?: unknown }; check?: unknown } }
type ZodNode = {
	_zod: {
		def: {
			type: string
			checks?: ZodCheck[]
			fn?: unknown
			in?: ZodNode
			out?: ZodNode
			transform?: unknown
		}
	}
}

let inspector: Session | undefined

// the inspector answers a post on the main thread synchronously
function inspect<T>(method: string, params: object): T {
	if (!inspector) {
		inspector = new Session()
		inspector.connect()
	}
	let result: unknown
	let failure: Error | null = null
	inspector.post(method, params, (error, answer) => {
		failure = error
		result = answer
	})
	if (failure) throw failure
	if (result === undefined) throw new Error(`inspector: no synchronous answer to ${method}`)
	return result as T
}

type RemoteObject = { type: string; objectId?: string; value?: unknown }
type PropertyList = {
	result: { name: string; value?: RemoteObject }[]
	internalProperties?: { name: string; value?: RemoteObject }[]
}

const PROBE = '__apiSurfaceClosureProbe'
const PROBE_GROUP = 'api-surface'

// the source of a function a closure captured under `name`: `superRefine` wraps the refinement in a
// closure of zod's, so the wrapper's own source is the same for every refinement
function capturedSource(closure: unknown, name: string): string {
	const global = globalThis as Record<string, unknown>
	global[PROBE] = closure
	try {
		const { result } = inspect<{ result: RemoteObject }>('Runtime.evaluate', {
			expression: `globalThis.${PROBE}`,
			objectGroup: PROBE_GROUP,
		})
		const properties = (objectId: string | undefined) =>
			inspect<PropertyList>('Runtime.getProperties', { objectId, ownProperties: true })
		const scopes = properties(result.objectId).internalProperties?.find(
			(property) => property.name === '[[Scopes]]',
		)
		for (const scope of properties(scopes?.value?.objectId).result) {
			const captured = properties(scope.value?.objectId).result.find(
				(variable) => variable.name === name && variable.value?.type === 'function',
			)
			if (!captured) continue
			const { result: source } = inspect<{ result: RemoteObject }>('Runtime.callFunctionOn', {
				objectId: captured.value!.objectId,
				functionDeclaration:
					'function () { return Function.prototype.toString.call(this) }',
				returnByValue: true,
			})
			return source.value as string
		}
		throw new Error(`no function "${name}" in the closure of a zod refinement`)
	} finally {
		delete global[PROBE]
		inspect('Runtime.releaseObjectGroup', { objectGroup: PROBE_GROUP })
	}
}

let superRefineWrapper: string | undefined

// zod's own `superRefine` wrapper, taken from a probe schema so a zod upgrade that changes it is seen
function isSuperRefineWrapper(schema: unknown, fn: unknown): boolean {
	if (superRefineWrapper === undefined) {
		const probe = (schema as unknown as { superRefine(fn: () => void): ZodNode }).superRefine(
			() => {},
		)
		superRefineWrapper = String(probe._zod.def.checks!.at(-1)!._zod.check)
	}
	return typeof fn === 'function' && String(fn) === superRefineWrapper
}

type Fingerprints = { checks: string[]; transforms: string[] }

// checks: `refine`, `superRefine`, `z.custom`; transforms: `transform`, `preprocess` and `overwrite`,
// which the built-in `.trim()`, `.toLowerCase()`, `.toUpperCase()`, `.normalize()` are
function fingerprintSources(schema: unknown): Fingerprints {
	const def = (schema as unknown as ZodNode)._zod.def
	const checks: string[] = []
	const transforms: string[] = []
	const add = (into: string[], fn: unknown) => {
		if (typeof fn === 'function') into.push(String(fn))
	}
	for (const check of def.checks ?? []) {
		const { check: kind, fn, tx } = check._zod.def
		if (kind === 'overwrite') add(transforms, tx)
		else if (kind !== 'custom') continue
		else if (typeof fn === 'function') add(checks, fn)
		else if (isSuperRefineWrapper(schema, check._zod.check))
			checks.push(capturedSource(check._zod.check, 'fn'))
		else add(checks, check._zod.check)
	}
	if (def.type === 'custom') add(checks, def.fn)
	if (def.type === 'transform') add(transforms, def.transform)
	if (def.type === 'pipe')
		for (const side of [def.in, def.out])
			if (side?._zod.def.type === 'transform') add(transforms, side._zod.def.transform)
	return { checks, transforms }
}

// a short digest of each function's source, whitespace collapsed, so a site sees that a check it
// cannot read from the JSON Schema appeared or changed
export const refinementDigest = (source: string): string =>
	createHash('sha256').update(source.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12)

// what a site writes, so the input side; `$schema` is a URL that says nothing about the contract. A
// node keeps the fingerprints of the node it wraps (`.optional()`, `.default()`) and adds its own.
export function jsonSchema(schema: Schema): unknown {
	const json = schema.toJSONSchema({
		io: 'input',
		unrepresentable: 'any',
		override: ({ zodSchema, jsonSchema: node }) => {
			const { checks, transforms } = fingerprintSources(zodSchema)
			const target = node as Record<string, unknown>
			for (const [keyword, sources] of [
				[REFINEMENTS, checks],
				[TRANSFORMS, transforms],
			] as const) {
				if (sources.length === 0) continue
				const inherited = (target[keyword] as string[] | undefined) ?? []
				target[keyword] = [
					...new Set([...inherited, ...sources.map(refinementDigest)]),
				].sort()
			}
		},
	}) as Record<string, unknown>
	delete json.$schema
	return json
}

// the loader rejects a lock that leaves out a defaulted or derived field, so the lock's snapshot lists
// every property with a `default` or a DERIVED_FROM_KEYWORD as required; values under `default`,
// `const` and `enum` are data, not schemas
const DATA_KEYWORDS = new Set(['default', 'const', 'enum'])
export function requireDefaults(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(requireDefaults)
	if (node === null || typeof node !== 'object') return node
	const result = Object.fromEntries(
		Object.entries(node).map(([key, value]) => [
			key,
			DATA_KEYWORDS.has(key)
				? value
				: key === 'properties'
					? Object.fromEntries(
							Object.entries(value as object).map(([name, child]) => [
								name,
								requireDefaults(child),
							]),
						)
					: requireDefaults(value),
		]),
	) as Record<string, unknown>
	if (result.properties && typeof result.properties === 'object') {
		const defaulted = Object.entries(result.properties)
			.filter(
				([, child]) =>
					child !== null &&
					typeof child === 'object' &&
					('default' in child || DERIVED_FROM_KEYWORD in child),
			)
			.map(([name]) => name)
		if (defaulted.length > 0)
			result.required = [
				...new Set([...((result.required as string[] | undefined) ?? []), ...defaulted]),
			].sort()
	}
	return result
}

type CoreManifest = {
	name: string
	exports: Record<string, { types?: string } | string | null>
	bin?: string | Record<string, string>
}

const readManifest = (coreDir: string): CoreManifest =>
	JSON.parse(readFileSync(path.join(coreDir, 'package.json'), 'utf8')) as CoreManifest

const specifier = (manifest: CoreManifest, key: string): string =>
	key === '.' ? manifest.name : `${manifest.name}/${key.slice(2)}`

// `dist/x.d.ts` is what `tsc -p tsconfig.build.json` emits from `src/x.ts`; reading the same program
// from source gives the declarations without depending on a built `dist/`
const sourceOfTypes = (types: string): string =>
	types.replace(/^\.\/dist\//, 'src/').replace(/\.d\.ts$/, '.ts')

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

export type ExportEntry = { kind: 'value' | 'type'; declaration: string }

export function extractExports(coreDir = CORE_DIR): Record<string, Record<string, ExportEntry>> {
	const manifest = readManifest(coreDir)
	const configPath = path.join(coreDir, 'tsconfig.build.json')
	const config = ts.readConfigFile(configPath, ts.sys.readFile)
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, coreDir)
	// an entry point without `types` still belongs to the API: it is listed without declarations
	const entries = Object.entries(manifest.exports).map(
		([key, target]) =>
			[
				key,
				typeof target === 'object' && target?.types
					? path.join(coreDir, sourceOfTypes(target.types))
					: undefined,
			] as const,
	)
	const program = ts.createProgram({
		rootNames: entries.flatMap(([, file]) => (file ? [file] : [])),
		options: { ...parsed.options, noEmit: true },
	})
	const checker = program.getTypeChecker()
	const printer = ts.createPrinter({ removeComments: true })

	const declarationOf = (symbol: ts.Symbol, file: ts.SourceFile): ExportEntry => {
		if (symbol.flags & ts.SymbolFlags.Value) {
			const type = checker.getTypeOfSymbolAtLocation(symbol, file)
			return {
				kind: 'value',
				declaration: checker.typeToString(type, file, ts.TypeFormatFlags.NoTruncation),
			}
		}
		const node = symbol.declarations?.[0]
		const interfaces = symbol.declarations?.filter(ts.isInterfaceDeclaration) ?? []
		if (node && ts.isTypeAliasDeclaration(node)) {
			const params = node.typeParameters
				? `<${node.typeParameters.map((p) => printer.printNode(ts.EmitHint.Unspecified, p, node.getSourceFile())).join(', ')}>`
				: ''
			const body = printer.printNode(ts.EmitHint.Unspecified, node.type, node.getSourceFile())
			return { kind: 'type', declaration: collapse(`${params}${body}`) }
		}
		// every declaration of the interface, each with its type parameters and `extends`
		if (interfaces.length > 0) {
			const declaration = interfaces
				.map((declaration) =>
					printer
						.printNode(
							ts.EmitHint.Unspecified,
							declaration,
							declaration.getSourceFile(),
						)
						.replace(/^(?:export\s+)?(?:declare\s+)?interface\s+[\w$]+/, ''),
				)
				.join(' ')
			return { kind: 'type', declaration: collapse(declaration) }
		}
		const type = checker.getDeclaredTypeOfSymbol(symbol)
		return {
			kind: 'type',
			declaration: checker.typeToString(
				type,
				file,
				ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias,
			),
		}
	}

	return Object.fromEntries(
		entries.map(([key, file]) => {
			if (!file) return [specifier(manifest, key), {}]
			const source = program.getSourceFile(file)
			if (!source) throw new Error(`exports "${key}": ${file} is not in the program`)
			const module = checker.getSymbolAtLocation(source)
			const symbols = module ? checker.getExportsOfModule(module) : []
			return [
				specifier(manifest, key),
				Object.fromEntries(
					symbols.map((symbol) => {
						const target =
							symbol.flags & ts.SymbolFlags.Alias
								? checker.getAliasedSymbol(symbol)
								: symbol
						return [symbol.name, declarationOf(target, source)]
					}),
				),
			]
		}),
	)
}

// the commands of the bin with their options, from the registry the CLI dispatches by; the manifest
// must declare that bin and no other
export function extractCliCommands(coreDir = CORE_DIR): string[] {
	const { name, bin } = readManifest(coreDir)
	if (bin === undefined) return []
	const bins = typeof bin === 'string' ? [name.split('/').at(-1)!] : Object.keys(bin)
	if (bins.length !== 1 || bins[0] !== BIN)
		throw new Error(`package.json bin must be { "${BIN}": … }, got ${bins.join(', ')}`)
	return cliSurface()
}

// the files the published package ships (package.json `files` leaves tests and fixtures out)
const UNSHIPPED =
	/\.test\.tsx?$|(?:^|\/)(?:__fixtures__|test-fixtures|config\/fixtures)\/|(?:^|\/)test-fixtures\.ts$/

export function coreSources(extensions: RegExp, coreDir = CORE_DIR): SourceFile[] {
	const src = path.join(coreDir, 'src')
	return readdirSync(src, { recursive: true, encoding: 'utf8' })
		.map((file) => file.split(path.sep).join('/'))
		.filter((file) => extensions.test(file) && !UNSHIPPED.test(file))
		.sort()
		.map((file) => ({
			file: `src/${file}`,
			source: readFileSync(path.join(src, file), 'utf8'),
		}))
}

// --- tokens: the names the theme may declare; the core checks a site's theme against them

export { declaredTokens, layoutTokens, type TokenUse }

const COMMENTS = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g
// a name built at runtime (`var(--gap-${size})`) is not a token name, so the name must end the match
const VAR_READ = /var\(\s*(--[\w-]+)(?![\w$-])\s*([,)])/g
const DECLARATION = /(--[\w-]+)\s*:/g
const SET_PROPERTY = /setProperty\(\s*['"`](--[\w-]+)['"`]/g
const TS_DECLARATION = /['"`](--[\w-]+)\s*:/g

// a token the core reads with var() but never defines is the site theme's to define; read anywhere
// without a fallback it is required. One Tailwind's theme defines (`tailwind`) is optional: the core
// gets a value either way and the site may override it
export function contractTokens(
	styles: readonly SourceFile[],
	scripts: readonly SourceFile[],
	tailwind: Iterable<string>,
): Record<string, TokenUse> {
	const reads = new Map<string, TokenUse>()
	const own = new Set<string>()
	const fromTailwind = new Set(tailwind)
	for (const { source } of styles) {
		const text = source.replace(COMMENTS, '')
		for (const [, name, end] of text.matchAll(VAR_READ)) {
			if (end === ')' || !reads.has(name!))
				reads.set(name!, end === ')' ? 'required' : 'optional')
		}
		for (const [, name] of text.matchAll(DECLARATION)) own.add(name!)
		for (const [, name] of text.matchAll(SET_PROPERTY)) own.add(name!)
	}
	for (const { source } of scripts) {
		for (const [, name] of source.matchAll(SET_PROPERTY)) own.add(name!)
		for (const [, name] of source.matchAll(TS_DECLARATION)) own.add(name!)
	}
	return Object.fromEntries(
		[...reads]
			.filter(([name]) => !own.has(name))
			.map(([name, use]): [string, TokenUse] => [
				name,
				fromTailwind.has(name) ? 'optional' : use,
			])
			.sort(([a], [b]) => (a < b ? -1 : 1)),
	)
}

function tailwindThemeTokens(coreDir: string): string[] {
	const require = createRequire(path.join(coreDir, 'package.json'))
	return declaredTokens(readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8'))
}

export function extractTokens(coreDir = CORE_DIR): Record<string, TokenUse> {
	const tokens = contractTokens(
		coreSources(/\.(?:css|astro)$/, coreDir),
		coreSources(/\.tsx?$/, coreDir),
		tailwindThemeTokens(coreDir),
	)
	for (const name of layoutTokens()) tokens[name] = 'required'
	return sortKeys(tokens) as Record<string, TokenUse>
}

// --- env

export type EnvRead = { name: string; file: string; line: number }

// `process.env.X`, `import.meta.env.X`, `env.X`, `env['X']` and `fn(env, 'X')`
const ENV_READS = [
	/\benv\??\.([A-Z][A-Z0-9_]*)\b/g,
	/\benv(?:\?\.)?\[\s*(['"`])([A-Z][A-Z0-9_]*)\1\s*\]/g,
	/\(\s*env\s*,\s*(['"`])([A-Z][A-Z0-9_]*)\1/g,
]

// `const { A, B: b, C = '' } = process.env` (or `import.meta.env`, `env`); the body is the names
const ENV_DESTRUCTURING = /\{([^{}]*)\}\s*=\s*(?:[\w$]+\??\.)*env\b(?!\s*(?:\?\.|\.|\[))/g
const DESTRUCTURED_NAME = /^\s*(?!\.\.\.)(['"]?)([\w$]+)\1/

const lineAt = (source: string, index: number): number => source.slice(0, index).split('\n').length

function destructuredEnvReads({ file, source }: SourceFile): EnvRead[] {
	return [...source.matchAll(ENV_DESTRUCTURING)].flatMap((match) => {
		const reads: EnvRead[] = []
		let offset = match.index + 1
		for (const part of match[1]!.split(',')) {
			const name = DESTRUCTURED_NAME.exec(part)
			if (name)
				reads.push({
					name: name[2]!,
					file,
					line: lineAt(source, offset + name.index + name[0].length),
				})
			offset += part.length + 1
		}
		return reads
	})
}

export function envReads(files: readonly SourceFile[]): EnvRead[] {
	return files.flatMap((sourceFile) => [
		...ENV_READS.flatMap((pattern) =>
			[...sourceFile.source.matchAll(pattern)].map((match) => ({
				name: match.at(-1)!,
				file: sourceFile.file,
				line: lineAt(sourceFile.source, match.index),
			})),
		),
		...destructuredEnvReads(sourceFile),
	])
}

export const undeclaredEnv = (
	reads: readonly EnvRead[],
	declared: Readonly<Record<string, string>> = CONSUMER_ENV,
): EnvRead[] => reads.filter((read) => !Object.hasOwn(declared, read.name))

export const publicEnv = (declared: Readonly<Record<string, string>> = CONSUMER_ENV): string[] =>
	Object.entries(declared)
		.filter(([, scope]) => scope === 'public')
		.map(([name]) => name)
		.sort()

export const coreEnvReads = (coreDir = CORE_DIR): EnvRead[] =>
	envReads(coreSources(/\.(?:tsx?|astro|m?js)$/, coreDir))

// --- directives

export type DirectiveAttributeEntry = { required: boolean; values?: string[] }

export const extractDirectives = (): Record<string, Record<string, DirectiveAttributeEntry>> =>
	Object.fromEntries(
		Object.entries(DIRECTIVE_ATTRIBUTES).map(([directive, attributes]) => [
			directive,
			Object.fromEntries(
				Object.entries(attributes as Record<string, DirectiveAttribute>).map(
					([name, { required, values }]) => [
						name,
						values ? { required, values: [...values].sort() } : { required },
					],
				),
			),
		]),
	)

// --- modules: what a site relies on of each module besides its collection schemas (site-files) and
// its keys (i18n)

export type ModuleEntry = {
	collections: Record<string, { source: string; versions: number[] }>
	// the schema of `modules.<id>`, every defaulted field required as in the lock
	config: unknown
	segments: string[]
	menu: string[]
	namespace: string
	mdx: string[]
	directives: string[]
	tokens: string[]
	dependsOn: string[]
	moreDocsKinds: string[]
}

export const extractModules = (): Record<string, ModuleEntry> =>
	Object.fromEntries(
		MODULES.map((module) => [
			module.id,
			{
				collections: Object.fromEntries(
					Object.entries(module.collections).map(([name, collection]) => [
						name,
						{
							source: collectionFiles(collection.source),
							versions: [...collection.versions],
						},
					]),
				),
				config: requireDefaults(jsonSchema(module.config)),
				segments: [...module.segments].sort(),
				menu: [...module.menu].sort(),
				namespace: module.i18n.namespace,
				mdx: [...module.mdx].sort(),
				directives: [...module.directives].sort(),
				tokens: [...module.tokens].sort(),
				dependsOn: [...module.dependsOn].sort(),
				moreDocsKinds: [...module.moreDocsKinds].sort(),
			},
		]),
	)

// --- the whole snapshot

export function extractSnapshot(coreDir = CORE_DIR): Snapshot {
	const en = JSON.parse(readFileSync(path.join(coreDir, 'src/i18n/en.json'), 'utf8')) as Record<
		string,
		string
	>
	return {
		exports: extractExports(coreDir),
		cli: extractCliCommands(coreDir),
		'site-files': Object.fromEntries(
			Object.entries(SITE_FILE_SCHEMAS).map(([file, schema]) => [
				file,
				file === SITE_LOCK_PATH ? requireDefaults(jsonSchema(schema)) : jsonSchema(schema),
			]),
		),
		'mdx-components': Object.fromEntries(
			Object.entries(MDX_COMPONENT_PROPS).map(([name, schema]) => [name, jsonSchema(schema)]),
		),
		directives: extractDirectives(),
		tokens: extractTokens(coreDir),
		// the core's keys and those of every module, each in its namespace
		i18n: [...Object.keys(en), ...MODULES.flatMap(moduleKeys)].sort(),
		env: publicEnv(),
		'replacement-points': [...REPLACEMENT_POINTS],
		modules: extractModules(),
	}
}

// order-insensitive lists are sorted so a reordering in the source is not a change
const SORTED_ARRAYS = new Set(['required', 'enum', REFINEMENTS, TRANSFORMS])

export function sortKeys(value: unknown, key?: string): unknown {
	if (Array.isArray(value)) {
		const items = value.map((item) => sortKeys(item))
		return key && SORTED_ARRAYS.has(key) && items.every((item) => typeof item === 'string')
			? [...(items as string[])].sort()
			: items
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((k) => [k, sortKeys((value as Record<string, unknown>)[k], k)]),
		)
	}
	return value
}

export const serializeSurface = (value: unknown): string =>
	`${JSON.stringify(sortKeys(value), null, '\t')}\n`

// ---------------------------------------------------------------------------------------------------
// snapshot files

// the committed snapshot lives in `packages/core/api-snapshot/`; of it the package ships only
// `tokens.json`, which the integration checks a site's theme against.
// `--snapshot-dir <dir>` points the scripts elsewhere, relative to the working directory
export function snapshotDirArg(argv: readonly string[] = process.argv.slice(2)): string {
	const index = argv.indexOf('--snapshot-dir')
	if (index === -1) return path.resolve(SNAPSHOT_DIR)
	const value = argv[index + 1]
	if (!value || value.startsWith('--')) throw new Error('--snapshot-dir needs a directory')
	return path.resolve(value)
}

export const surfaceFile = (surface: Surface): string => `${surface}.json`

// the raw text of each surface file; a missing file is left out
export const readSnapshotTexts = (
	read: (file: string) => string | undefined,
): Partial<Record<Surface, string>> =>
	Object.fromEntries(
		SURFACES.flatMap((surface) => {
			const text = read(surfaceFile(surface))
			return text === undefined ? [] : [[surface, text]]
		}),
	)

export const readSnapshotDir = (dir: string): Partial<Record<Surface, string>> =>
	readSnapshotTexts((file) => {
		const full = path.join(dir, file)
		return existsSync(full) ? readFileSync(full, 'utf8') : undefined
	})

export const parseSnapshot = (texts: Partial<Record<Surface, string>>): Partial<Snapshot> =>
	Object.fromEntries(
		Object.entries(texts).map(([surface, text]) => [surface, JSON.parse(text!) as unknown]),
	)

// ---------------------------------------------------------------------------------------------------
// classification

export type Change = { surface: Surface; name: string; breaking: boolean; detail: string }

type Json = unknown
type JsonObject = Record<string, Json>

const isObject = (value: Json): value is JsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const equal = (a: Json, b: Json): boolean =>
	JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))

function compareList(surface: Surface, before: Json, after: Json): Change[] {
	const old = new Set(before as string[])
	const now = new Set(after as string[])
	return [
		...[...old]
			.filter((name) => !now.has(name))
			.map((name) => ({ surface, name, breaking: true, detail: 'removed' })),
		...[...now]
			.filter((name) => !old.has(name))
			.map((name) => ({ surface, name, breaking: false, detail: 'added' })),
	]
}

function compareExports(before: Json, after: Json): Change[] {
	const surface = 'exports'
	const old = before as Record<string, Record<string, ExportEntry>>
	const now = after as Record<string, Record<string, ExportEntry>>
	const changes: Change[] = []
	for (const [entry, members] of Object.entries(old)) {
		const next = now[entry]
		if (!next) {
			changes.push({ surface, name: entry, breaking: true, detail: 'entry point removed' })
			continue
		}
		for (const [name, declaration] of Object.entries(members)) {
			const current = next[name]
			if (!current)
				changes.push({ surface, name, breaking: true, detail: `removed from ${entry}` })
			else if (!equal(declaration, current))
				changes.push({
					surface,
					name,
					breaking: true,
					detail: `declaration in ${entry} changed: ${declaration.declaration} → ${current.declaration}`,
				})
		}
		for (const name of Object.keys(next).filter((name) => !(name in members)))
			changes.push({ surface, name, breaking: false, detail: `added to ${entry}` })
	}
	for (const entry of Object.keys(now).filter((entry) => !(entry in old)))
		changes.push({ surface, name: entry, breaking: false, detail: 'entry point added' })
	return changes
}

function compareDirectives(before: Json, after: Json): Change[] {
	const surface = 'directives'
	const old = before as Record<string, Record<string, DirectiveAttributeEntry>>
	const now = after as Record<string, Record<string, DirectiveAttributeEntry>>
	const changes: Change[] = []
	const add = (name: string, breaking: boolean, detail: string) =>
		changes.push({ surface, name, breaking, detail })
	for (const [directive, attributes] of Object.entries(old)) {
		const next = now[directive]
		if (!next) {
			add(directive, true, 'removed')
			continue
		}
		for (const [attribute, was] of Object.entries(attributes)) {
			const name = `${directive}.${attribute}`
			const is = next[attribute]
			if (!is) {
				add(name, true, 'attribute removed')
				continue
			}
			if (!was.required && is.required) add(name, true, 'now required')
			if (was.required && !is.required) add(name, false, 'now optional')
			if (was.values && !is.values) add(name, false, 'now takes any value')
			else if (!was.values && is.values)
				add(name, true, `restricted to ${JSON.stringify(is.values)}`)
			else if (was.values && is.values) {
				const removed = was.values.filter((value) => !is.values!.includes(value))
				const added = is.values.filter((value) => !was.values!.includes(value))
				if (removed.length > 0)
					add(name, true, `values removed: ${JSON.stringify(removed)}`)
				if (added.length > 0) add(name, false, `values added: ${JSON.stringify(added)}`)
			}
		}
		for (const [attribute, is] of Object.entries(next).filter(
			([attribute]) => !(attribute in attributes),
		))
			add(
				`${directive}.${attribute}`,
				is.required,
				is.required ? 'added as a required attribute' : 'attribute added',
			)
	}
	for (const directive of Object.keys(now).filter((directive) => !(directive in old)))
		add(directive, false, 'added')
	return changes
}

function compareTokens(before: Json, after: Json): Change[] {
	const surface = 'tokens'
	const old = before as Record<string, TokenUse>
	const now = after as Record<string, TokenUse>
	const changes: Change[] = []
	for (const [name, use] of Object.entries(old)) {
		if (!now[name]) changes.push({ surface, name, breaking: true, detail: 'removed' })
		else if (use !== now[name])
			changes.push({
				surface,
				name,
				breaking: now[name] === 'required',
				detail: `now ${now[name]}`,
			})
	}
	for (const [name, use] of Object.entries(now).filter(([name]) => !(name in old)))
		changes.push({
			surface,
			name,
			breaking: use === 'required',
			detail: use === 'required' ? 'added, the theme must define it' : 'added (optional)',
		})
	return changes
}

// --- JSON Schema

type SchemaChange = { path: string; breaking: boolean; detail: string }

const DOC_KEYWORDS = new Set(['description', 'title', 'examples', '$comment', '$schema'])
const LOWER_BOUNDS = new Set([
	'minimum',
	'exclusiveMinimum',
	'minLength',
	'minItems',
	'minProperties',
])
const UPPER_BOUNDS = new Set([
	'maximum',
	'exclusiveMaximum',
	'maxLength',
	'maxItems',
	'maxProperties',
])
// a constraint a value may newly fail; dropping one only widens
const CONSTRAINTS = new Set(['const', 'pattern', 'format', 'multipleOf', 'not', 'contentEncoding'])

const join = (at: string, segment: string): string =>
	at === '' ? segment : segment.startsWith('[') ? `${at}${segment}` : `${at}.${segment}`

// `true`, `{}` and an absent subschema accept anything
const acceptsAll = (schema: Json): boolean =>
	schema === undefined ||
	schema === true ||
	(isObject(schema) && Object.keys(schema).length === 0)

const typeSet = (schema: JsonObject): Set<string> | undefined => {
	const type = schema.type
	if (type === undefined) return undefined
	const types = new Set(Array.isArray(type) ? (type as string[]) : [type as string])
	if (types.has('number')) types.add('integer')
	return types
}

const subset = (a: Set<string>, b: Set<string>): boolean => [...a].every((item) => b.has(item))

// `wasRequired`: every site wrote the value, so a default given to it changes no site; a default given
// to an optional value, or one changed or removed, changes what a site that leaves it out gets
export function compareSchemas(
	before: Json,
	after: Json,
	at = '',
	wasRequired = false,
): SchemaChange[] {
	if (equal(before, after) || (acceptsAll(before) && acceptsAll(after))) return []
	const changes: SchemaChange[] = []
	const breaking = (path: string, detail: string) =>
		changes.push({ path, breaking: true, detail })
	const compatible = (path: string, detail: string) =>
		changes.push({ path, breaking: false, detail })

	// a transform's removal is breaking even when the schema left behind accepts anything
	const transforms = (schema: Json) => (isObject(schema) ? schema[TRANSFORMS] : undefined)
	if (
		!equal(transforms(before), transforms(after)) &&
		(acceptsAll(before) || acceptsAll(after))
	) {
		breaking(at, 'a transform of what the site writes was added, changed or removed')
		return changes
	}
	if (acceptsAll(before)) {
		breaking(at, 'constrained where anything was accepted')
		return changes
	}
	if (acceptsAll(after)) {
		compatible(at, 'now accepts anything')
		return changes
	}
	if (!isObject(before) || !isObject(after)) {
		breaking(at, 'schema changed')
		return changes
	}

	const oldRequired = new Set((before.required as string[] | undefined) ?? [])
	const newRequired = new Set((after.required as string[] | undefined) ?? [])
	const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()

	for (const key of keys) {
		const a = before[key]
		const b = after[key]
		if (equal(a, b) || DOC_KEYWORDS.has(key)) continue

		if (key === REFINEMENTS) {
			const known = new Set((a as string[] | undefined) ?? [])
			if (((b as string[] | undefined) ?? []).some((digest) => !known.has(digest)))
				breaking(at, 'a check JSON Schema cannot express was added or changed')
			else compatible(at, 'a check JSON Schema cannot express was removed')
		} else if (key === TRANSFORMS) {
			breaking(at, 'a transform of what the site writes was added, changed or removed')
		} else if (key === 'type') {
			const oldTypes = typeSet(before)
			const newTypes = typeSet(after)
			if (!newTypes) compatible(at, 'type constraint removed')
			else if (!oldTypes) breaking(at, `type constrained to ${JSON.stringify(b)}`)
			else if (subset(oldTypes, newTypes))
				compatible(at, `type widened to ${JSON.stringify(b)}`)
			else if (subset(newTypes, oldTypes))
				breaking(at, `type narrowed from ${JSON.stringify(a)} to ${JSON.stringify(b)}`)
			else breaking(at, `type changed from ${JSON.stringify(a)} to ${JSON.stringify(b)}`)
		} else if (key === 'properties' || key === '$defs' || key === 'definitions') {
			const oldProps = (a as JsonObject | undefined) ?? {}
			const newProps = (b as JsonObject | undefined) ?? {}
			const prefix = key === 'properties' ? '' : `${key}.`
			for (const name of Object.keys(oldProps).sort()) {
				const path = join(at, `${prefix}${name}`)
				if (!(name in newProps)) breaking(path, 'removed')
				else
					changes.push(
						...compareSchemas(
							oldProps[name],
							newProps[name],
							path,
							key === 'properties' && oldRequired.has(name),
						),
					)
			}
			for (const name of Object.keys(newProps)
				.filter((name) => !(name in oldProps))
				.sort()) {
				const path = join(at, `${prefix}${name}`)
				if (key === 'properties' && newRequired.has(name))
					breaking(path, 'added as a required field')
				else compatible(path, 'added')
			}
		} else if (key === 'required') {
			const oldProps = (before.properties as JsonObject | undefined) ?? {}
			for (const name of [...newRequired].filter((name) => !oldRequired.has(name)).sort()) {
				// a field new to the schema is reported under `properties`
				if (name in oldProps || !isObject(after.properties) || !(name in after.properties))
					breaking(join(at, name), 'now required')
			}
			for (const name of [...oldRequired].filter((name) => !newRequired.has(name)).sort())
				compatible(join(at, name), 'now optional')
		} else if (
			key === 'additionalProperties' ||
			key === 'unevaluatedProperties' ||
			key === 'propertyNames'
		) {
			const segment = key === 'propertyNames' ? '(keys)' : '*'
			if (a === false && b !== false) compatible(join(at, segment), 'now allowed')
			else if (b === false) breaking(join(at, segment), 'no longer allowed')
			else changes.push(...compareSchemas(a, b, join(at, segment)))
		} else if (key === 'items' || key === 'contains') {
			changes.push(...compareSchemas(a, b, join(at, '[]')))
		} else if (key === 'enum') {
			if (b === undefined) compatible(at, 'enum removed')
			else if (a === undefined) breaking(at, `restricted to ${JSON.stringify(b)}`)
			else {
				const removed = (a as Json[]).filter(
					(value) => !(b as Json[]).some((v) => equal(v, value)),
				)
				const added = (b as Json[]).filter(
					(value) => !(a as Json[]).some((v) => equal(v, value)),
				)
				if (removed.length > 0)
					breaking(at, `enum narrowed: ${JSON.stringify(removed)} removed`)
				if (added.length > 0) compatible(at, `enum widened: ${JSON.stringify(added)} added`)
			}
		} else if (LOWER_BOUNDS.has(key) || UPPER_BOUNDS.has(key)) {
			const tighter = LOWER_BOUNDS.has(key)
				? (b as number) > (a as number)
				: (b as number) < (a as number)
			if (b === undefined) compatible(at, `${key} removed`)
			else if (a === undefined || tighter) breaking(at, `${key} ${a ?? 'none'} → ${b}`)
			else compatible(at, `${key} ${a} → ${b}`)
		} else if (key === 'default') {
			if (a === undefined && wasRequired) compatible(at, 'default added to a required field')
			else breaking(at, a === undefined ? 'default added' : 'default changed')
		} else if (key === 'uniqueItems') {
			if (b === true) breaking(at, 'items must now be unique')
			else compatible(at, 'items may now repeat')
		} else if (CONSTRAINTS.has(key) && b === undefined) {
			compatible(at, `${key} removed`)
		} else if (key === 'anyOf' || key === 'oneOf') {
			changes.push(...compareVariants(key, a, b, at))
		} else if (
			(key === 'allOf' || key === 'prefixItems') &&
			Array.isArray(a) &&
			Array.isArray(b) &&
			a.length === b.length
		) {
			a.forEach((item, index) =>
				changes.push(
					...compareSchemas(
						item,
						b[index],
						key === 'prefixItems' ? join(at, `[${index}]`) : at,
					),
				),
			)
		} else {
			breaking(at, `${key} changed`)
		}
	}
	return changes
}

// a variant kept as it was is unaffected and a new one widens `anyOf`. Any change of `oneOf` is
// breaking: a new or widened variant may match a value another variant matched, which `oneOf` then
// rejects. A gone or changed `anyOf` variant is compared position by position only when the count is
// the same, otherwise it is breaking
function compareVariants(key: string, a: Json, b: Json, at: string): SchemaChange[] {
	if (!Array.isArray(a) || !Array.isArray(b))
		return [
			{ path: at, breaking: true, detail: `${key} ${a === undefined ? 'added' : 'removed'}` },
		]
	const missing = a.filter((variant) => !b.some((other) => equal(variant, other)))
	const fresh = b.filter((variant) => !a.some((other) => equal(variant, other)))
	if (missing.length === 0 && fresh.length === 0) return []
	if (key === 'oneOf')
		return [{ path: at, breaking: true, detail: 'oneOf: variants added, removed or changed' }]
	if (missing.length === 0)
		return [{ path: at, breaking: false, detail: `${key}: variant added` }]
	if (a.length === b.length)
		return a.flatMap((variant, index) => compareSchemas(variant, b[index], at))
	return [
		{
			path: at,
			breaking: true,
			detail: `${key}: ${missing.length} variant(s) removed or changed`,
		},
	]
}

// a module's names a site builds on. A new route segment may shadow the slug of a site's page and a
// new dependency asks the site to enable another module, so both break; a gone collection version
// leaves a site's lock unsupported, as a new collection leaves it incomplete; a new module breaks as
// well. Any other removal breaks and any other addition is compatible
const ADDED_BREAKS = new Set(['segments', 'dependsOn'])

function compareModules(before: Json, after: Json): Change[] {
	const surface = 'modules'
	const old = before as Record<string, JsonObject>
	const now = after as Record<string, JsonObject>
	const changes: Change[] = []
	const add = (name: string, breaking: boolean, detail: string) =>
		changes.push({ surface, name, breaking, detail })
	for (const [id, was] of Object.entries(old)) {
		const is = now[id]
		if (!is) {
			add(id, true, 'module removed')
			continue
		}
		for (const field of [...new Set([...Object.keys(was), ...Object.keys(is)])].sort()) {
			const a = was[field]
			const b = is[field]
			const name = `${id}.${field}`
			if (equal(a, b)) continue
			if (field === 'config') {
				for (const change of compareSchemas(a, b))
					add(join(name, change.path), change.breaking, change.detail)
			} else if (field === 'collections' && isObject(a) && isObject(b)) {
				changes.push(...compareModuleCollections(name, a, b))
			} else if (Array.isArray(a) && Array.isArray(b)) {
				for (const value of a.filter((value) => !b.includes(value)))
					add(`${name}.${String(value)}`, true, 'removed')
				for (const value of b.filter((value) => !a.includes(value)))
					add(`${name}.${String(value)}`, ADDED_BREAKS.has(field), 'added')
			} else if (a === undefined) {
				add(name, false, 'added')
			} else {
				add(
					name,
					true,
					b === undefined
						? 'removed'
						: `changed from ${JSON.stringify(a)} to ${JSON.stringify(b)}`,
				)
			}
		}
	}
	// a new module takes its menu segments and content directory even while no site enables it
	for (const id of Object.keys(now).filter((id) => !(id in old))) add(id, true, 'module added')
	return changes
}

function compareModuleCollections(at: string, before: JsonObject, after: JsonObject): Change[] {
	const surface = 'modules'
	const changes: Change[] = []
	const add = (name: string, breaking: boolean, detail: string) =>
		changes.push({ surface, name, breaking, detail })
	for (const [collection, was] of Object.entries(before) as [string, JsonObject][]) {
		const name = `${at}.${collection}`
		const is = after[collection] as JsonObject | undefined
		if (!is) {
			add(name, true, 'removed')
			continue
		}
		if (!equal(was.source, is.source))
			add(
				`${name}.source`,
				true,
				`changed from ${JSON.stringify(was.source)} to ${JSON.stringify(is.source)}`,
			)
		const oldVersions = (was.versions as number[] | undefined) ?? []
		const newVersions = (is.versions as number[] | undefined) ?? []
		const removed = oldVersions.filter((version) => !newVersions.includes(version))
		const added = newVersions.filter((version) => !oldVersions.includes(version))
		if (removed.length > 0)
			add(`${name}.versions`, true, `versions removed: ${JSON.stringify(removed)}`)
		if (added.length > 0)
			add(`${name}.versions`, false, `versions added: ${JSON.stringify(added)}`)
	}
	for (const collection of Object.keys(after).filter((collection) => !(collection in before)))
		add(
			`${at}.${collection}`,
			true,
			'added, the lock of a site that enables the module lacks its version',
		)
	return changes
}

function compareSchemaMap(surface: Surface, before: Json, after: Json): Change[] {
	const old = before as Record<string, Json>
	const now = after as Record<string, Json>
	const changes: Change[] = []
	for (const [key, schema] of Object.entries(old)) {
		if (!(key in now)) {
			changes.push({ surface, name: key, breaking: true, detail: 'removed' })
			continue
		}
		for (const change of compareSchemas(schema, now[key])) {
			// a component's prop is named with its component; a site file's field by its path, the
			// file in the detail
			const name =
				change.path === ''
					? key
					: surface === 'mdx-components'
						? join(key, change.path)
						: change.path
			const where = surface === 'site-files' && change.path !== '' ? ` (${key})` : ''
			changes.push({
				surface,
				name,
				breaking: change.breaking,
				detail: `${change.detail}${where}`,
			})
		}
	}
	for (const key of Object.keys(now).filter((key) => !(key in old)))
		changes.push({ surface, name: key, breaking: false, detail: 'added' })
	return changes
}

export function compareSurface(surface: Surface, before: Json, after: Json): Change[] {
	if (equal(before, after)) return []
	switch (surface) {
		case 'exports':
			return compareExports(before, after)
		case 'site-files':
		case 'mdx-components':
			return compareSchemaMap(surface, before, after)
		case 'tokens':
			return compareTokens(before, after)
		case 'directives':
			return compareDirectives(before, after)
		case 'modules':
			return compareModules(before, after)
		case 'cli':
		case 'i18n':
		case 'env':
		case 'replacement-points':
			return compareList(surface, before, after)
	}
}

// a surface the previous snapshot does not have yet is new as a whole, not a change of it
export const compareSnapshots = (before: Partial<Snapshot>, after: Partial<Snapshot>): Change[] =>
	SURFACES.flatMap((surface) =>
		before[surface] === undefined
			? []
			: compareSurface(
					surface,
					before[surface],
					after[surface] ?? (Array.isArray(before[surface]) ? [] : {}),
				),
	)

export type SurfaceDrift = { surface: Surface; missing: boolean; changes: Change[] }

// each surface whose committed file differs from the snapshot of the source, with what changed; a
// difference the classifier sees no change in is a file not in its generated form
export function snapshotDrift(
	computed: Snapshot,
	texts: Partial<Record<Surface, string>>,
): SurfaceDrift[] {
	return SURFACES.flatMap((surface): SurfaceDrift[] => {
		const text = texts[surface]
		if (text === undefined) return [{ surface, missing: true, changes: [] }]
		if (text === serializeSurface(computed[surface])) return []
		let before: unknown
		try {
			before = JSON.parse(text)
		} catch {
			return [{ surface, missing: false, changes: [] }]
		}
		return [
			{
				surface,
				missing: false,
				changes: compareSurface(surface, before, computed[surface]),
			},
		]
	})
}

export const formatChange = (change: Change): string =>
	`${change.surface}: ${change.name} — ${change.detail} [${change.breaking ? 'breaking' : 'compatible'}]`

// ---------------------------------------------------------------------------------------------------
// CHANGELOG and UPGRADING.md

export type MarkdownLine = { text: string; number: number }

// the lines outside code fences, numbered from 1: an example inside a fence is never an entry, a
// heading or a label
export function unfencedLines(markdown: string): MarkdownLine[] {
	const lines: MarkdownLine[] = []
	let fenced = false
	for (const [index, text] of markdown.split(/\r?\n/).entries()) {
		if (/^\s*```/.test(text)) {
			fenced = !fenced
			continue
		}
		if (!fenced) lines.push({ text, number: index + 1 })
	}
	return lines
}

// the unfenced lines of the `## [heading]` section, without the heading; undefined without one
export function releaseSection(markdown: string, heading: string): MarkdownLine[] | undefined {
	const lines = unfencedLines(markdown)
	const open = `## [${heading}]`
	const start = lines.findIndex(({ text }) => text === open || text.startsWith(`${open} `))
	if (start === -1) return undefined
	const end = lines.findIndex(({ text }, index) => index > start && /^## /.test(text))
	return lines.slice(start + 1, end === -1 ? undefined : end)
}

// the entries of the given sections (`## [Unreleased]` by default) that carry `**Breaking:**`; an
// entry is a list item with its continuation lines
export function changelogBreakingEntries(
	changelog: string,
	sections: readonly string[] = ['Unreleased'],
): string[] {
	const entries: string[] = []
	for (const section of sections) {
		const first = entries.length
		for (const { text } of releaseSection(changelog, section) ?? []) {
			if (/^\s*[-*] /.test(text)) entries.push(text)
			else if (/^\s+\S/.test(text) && entries.length > first)
				entries[entries.length - 1] += `\n${text}`
			else if (!/^\s*$/.test(text)) entries.push(text)
		}
	}
	return entries.filter((entry) => entry.includes('**Breaking:**'))
}

// the whole name: `nav.home` is not named by `nav.homepage`, `--color-accent` by
// `--color-accent-fixed`, nor `@scope/pkg` by `@scope/pkg/collections`
export const namesChange = (entry: string, name: string): boolean =>
	new RegExp(`(?<![\\w./-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w./-])`).test(
		entry,
	)

// the breaking changes no entry names
export const unnamedBreaking = (changes: readonly Change[], entries: readonly string[]): Change[] =>
	changes.filter(
		(change) => change.breaking && !entries.some((entry) => namesChange(entry, change.name)),
	)

export const unannouncedBreaking = (
	changes: readonly Change[],
	changelog: string,
	sections?: readonly string[],
): Change[] => unnamedBreaking(changes, changelogBreakingEntries(changelog, sections))
