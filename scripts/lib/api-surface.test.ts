import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

// the zod the core's schemas use (`astro/zod`); the workspace root does not depend on astro
import { z } from '../../packages/core/node_modules/astro/dist/zod.js'
import { cliSurface } from '../../packages/core/src/cli/registry.ts'
import { MDX_COMPONENT_PROPS } from '../../packages/core/src/components/content/mdx-component-props.ts'
import { COLLECTION_SOURCES } from '../../packages/core/src/config/collection-sources.ts'
import { DERIVED_FROM_KEYWORD } from '../../packages/core/src/config/images-schema.ts'
import { CONSUMER_ENV } from '../../packages/core/src/consumer-env.ts'
import { moduleKeys } from '../../packages/core/src/i18n/dictionaries.ts'
import { DIRECTIVES } from '../../packages/core/src/lib/blocks/directives.ts'
import { NOTE_TONES } from '../../packages/core/src/lib/blocks/note/schema.ts'
import { IMAGES_PUBLIC_RELATIVE_PATH } from '../../packages/core/src/lib/images/public-config.ts'
import { RELEASE_DESCRIPTOR_RELATIVE_PATH } from '../../packages/core/src/lib/images/release.ts'
import { MODULES } from '../../packages/core/src/modules/registry.ts'
import { REPLACEMENT_POINTS } from '../../packages/core/src/overrides/points.ts'
import {
	type Change,
	changelogBreakingEntries,
	compareSchemas,
	compareSnapshots,
	compareSurface,
	contractTokens,
	CORE_DIR,
	coreEnvReads,
	envReads,
	extractExports,
	extractSnapshot,
	jsonSchema,
	layoutTokens,
	type ModuleEntry,
	refinementDigest,
	REFINEMENTS,
	requireDefaults,
	serializeSurface,
	type Snapshot,
	snapshotDrift,
	SURFACES,
	TRANSFORMS,
	unannouncedBreaking,
	undeclaredEnv,
} from './api-surface.ts'

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
	type: 'object',
	additionalProperties: false,
	properties,
	required,
})
const text = { type: 'string' }

const only = (changes: Change[]) => changes.map(({ name, breaking }) => ({ name, breaking }))

let snapshot: Snapshot
beforeAll(() => {
	snapshot = extractSnapshot()
})

describe('extraction from the core sources', () => {
	it('exports the integration and the props types of the replacement points from the package root', () => {
		const exports = snapshot.exports as Record<string, Record<string, unknown>>
		expect(Object.keys(exports['@picasso-ai/astrum-scena']!).sort()).toEqual([
			'FooterCopyrightReplacementProps',
			'LogoReplacementProps',
			'ReplacementPointProps',
			'default',
		])
		expect(Object.keys(exports).sort()).toEqual([
			'@picasso-ai/astrum-scena',
			'@picasso-ai/astrum-scena/collections',
			'@picasso-ai/astrum-scena/eslint',
			'@picasso-ai/astrum-scena/markdownlint.json',
			'@picasso-ai/astrum-scena/prettier',
			'@picasso-ai/astrum-scena/tsconfig.json',
		])
	})

	it('lists every entry point, one without types too, and interfaces with all their declarations', () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'api-exports-'))
		try {
			const write = (file: string, content: string) => {
				mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
				writeFileSync(path.join(dir, file), content)
			}
			write(
				'package.json',
				JSON.stringify({
					name: 'pkg',
					exports: {
						'.': { types: './dist/index.d.ts', default: './dist/index.js' },
						'./styles.css': './src/styles.css',
					},
				}),
			)
			write(
				'tsconfig.build.json',
				JSON.stringify({ compilerOptions: { strict: true, types: [] } }),
			)
			write(
				'src/index.ts',
				[
					'export interface Base { a: string }',
					'export interface Box<T extends string = string> extends Base { value: T }',
					'export interface Box<T extends string = string> { extra?: number }',
				].join('\n'),
			)
			const exports = extractExports(dir)
			expect(exports['pkg/styles.css']).toEqual({})
			const box = exports.pkg!.Box!.declaration
			expect(box).toContain('<T extends string = string> extends Base { value: T; }')
			expect(box).toContain('{ extra?: number; }')
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	it('reads the MDX names, directives and i18n keys from the lists the core uses', () => {
		expect(Object.keys(snapshot['mdx-components'] as object).sort()).toEqual(
			Object.keys(MDX_COMPONENT_PROPS).sort(),
		)
		const directives = snapshot.directives as Record<string, Record<string, unknown>>
		expect(Object.keys(directives).sort()).toEqual(Object.values(DIRECTIVES).sort())
		expect(directives.note!.claim).toEqual({ required: true })
		expect(directives.note!.tone).toEqual({ required: false, values: [...NOTE_TONES].sort() })
		expect(directives.note!.notitle).toEqual({ required: false })
		const en = JSON.parse(readFileSync(`${CORE_DIR}src/i18n/en.json`, 'utf8')) as object
		expect(snapshot.i18n).toEqual([...Object.keys(en), ...MODULES.flatMap(moduleKeys)].sort())
		expect(snapshot.cli).toEqual(cliSurface())
	})

	it('reads the replacement points from the list the integration checks a site against', () => {
		expect(snapshot['replacement-points']).toEqual([...REPLACEMENT_POINTS])
		expect(snapshot['replacement-points']).toEqual(['footer-copyright', 'logo'])
		const root = snapshot.exports as Record<string, Record<string, { kind: string }>>
		for (const name of [
			'LogoReplacementProps',
			'FooterCopyrightReplacementProps',
			'ReplacementPointProps',
		])
			expect(root['@picasso-ai/astrum-scena']![name]?.kind, name).toBe('type')
	})

	// a lock gets no defaults, so a field site.yaml may leave out is required in it
	it('requires every defaulted field in the lock, not in site.yaml', () => {
		type Node = { properties: Record<string, Node>; required?: string[] }
		const files = snapshot['site-files'] as Record<string, Node>
		const viewerOf = (tree: Node) => tree.properties.viewer!
		const yamlTree = files['site.yaml']!
		const lockTree = files['site.lock.yaml']!.properties.site!

		expect(viewerOf(yamlTree).required ?? []).not.toContain('counter')
		expect(yamlTree.required).not.toContain('viewer')
		expect(viewerOf(lockTree).required).toContain('counter')
		expect(lockTree.required).toContain('viewer')
		expect(lockTree.properties.images).toHaveProperty('x-transforms')
		// the rights derived from origin may be left out of site.yaml, never out of the lock
		const rightsOf = (tree: Node) => tree.properties.images!.properties.rights!
		expect(rightsOf(yamlTree).required).not.toContain('source')
		expect(rightsOf(yamlTree).required).not.toContain('webStatement')
		expect(rightsOf(lockTree).required).toEqual(
			expect.arrayContaining(['source', 'webStatement']),
		)
		expect(requireDefaults({ properties: { a: { default: 1 }, b: {} } })).toEqual({
			properties: { a: { default: 1 }, b: {} },
			required: ['a'],
		})
		const derived = { [DERIVED_FROM_KEYWORD]: 'origin' }
		expect(requireDefaults({ properties: { a: derived, b: {} } })).toEqual({
			properties: { a: derived, b: {} },
			required: ['a'],
		})
	})

	it('keys the schemas by site file and keeps them deterministic', () => {
		const files = Object.keys(snapshot['site-files'] as object)
		// one config tree: seo.yaml and images.yaml are its sections, read from no path of their own
		expect(files).toContain('site.yaml')
		for (const retired of ['src/config/site.yaml', 'src/config/seo.yaml', 'config/images.yaml'])
			expect(files).not.toContain(retired)
		const tree = (snapshot['site-files'] as Record<string, { properties: object }>)[
			'site.yaml'
		]!
		expect(Object.keys(tree.properties)).toEqual(expect.arrayContaining(['seo', 'images']))
		// the lock resolve writes from it holds the same tree under `site`
		const lock = (snapshot['site-files'] as Record<string, { properties: object }>)[
			'site.lock.yaml'
		]!
		expect(Object.keys(lock.properties)).toEqual(['schemaVersion', 'collections', 'site'])
		// collection keys come from the loaders' own base and pattern
		expect(files).toContain('src/content/albums/**/*.{yaml,yml}')
		expect(files).toContain('src/content/articles/**/*.{md,mdx} frontmatter')
		expect(serializeSurface(snapshot['site-files'])).not.toContain('$schema')
		expect(serializeSurface(extractSnapshot()['site-files'])).toBe(
			serializeSurface(snapshot['site-files']),
		)
	})

	// each site file the core reads declares the shape it is written in; the content collections do
	// not, their version is the one of the config lock
	it('requires a schemaVersion constant in every site file but the content collections', () => {
		type FileSchema = { properties?: Record<string, unknown>; required?: string[] }
		const collections = [
			...Object.values(COLLECTION_SOURCES),
			...MODULES.flatMap((module) =>
				Object.values(module.collections).map((collection) => collection.source),
			),
		].map(({ base }) => `${path.posix.normalize(base)}/`)
		const isCollection = (file: string) => collections.some((dir) => file.startsWith(dir))
		const files = Object.entries(snapshot['site-files'] as Record<string, FileSchema>)
		const versioned = files.filter(([file]) => !isCollection(file))

		expect(files.filter(([file]) => isCollection(file))).toHaveLength(collections.length)
		expect(versioned.map(([file]) => file)).toEqual(
			expect.arrayContaining([IMAGES_PUBLIC_RELATIVE_PATH, RELEASE_DESCRIPTOR_RELATIVE_PATH]),
		)
		for (const [file, schema] of versioned) {
			expect(schema.required, file).toContain('schemaVersion')
			expect(schema.properties?.schemaVersion, file).toEqual({
				const: expect.any(Number),
				type: 'number',
			})
		}
		for (const [file, schema] of files.filter(([name]) => isCollection(name)))
			expect(schema.properties ?? {}, file).not.toHaveProperty('schemaVersion')
	})

	it('lists only the public env names, and the core reads no undeclared one', () => {
		const internal = Object.entries(CONSUMER_ENV)
			.filter(([, scope]) => scope === 'internal')
			.map(([name]) => name)
		expect(internal.length).toBeGreaterThan(0)
		for (const name of internal) expect(snapshot.env).not.toContain(name)
		expect(snapshot.env).toContain('PUBLIC_TURNSTILE_SITE_KEY')
		expect(undeclaredEnv(coreEnvReads())).toEqual([])
	})

	it('takes the layout tokens and the theme contract as required tokens', () => {
		const tokens = snapshot.tokens as Record<string, string>
		for (const name of layoutTokens()) expect(tokens[name]).toBe('required')
		expect(tokens['--color-accent']).toBe('required')
		// tailwind's own theme defines these: the ones the core reads the site may override, the rest
		// are not the theme's at all
		expect(tokens['--font-sans']).toBe('optional')
		expect(tokens['--ease-out']).toBe('optional')
		expect(tokens).not.toHaveProperty('--color-pink-950')
		// the core defines its own layout primitives
		expect(tokens).not.toHaveProperty('--container-max')
	})
})

describe('tokens', () => {
	it('keeps tokens the core reads but does not define, required unless always read with a fallback', () => {
		const styles = [
			{
				file: 'a.css',
				source: '.a { color: var(--ink); margin: var(--gap, 1px); --own: 1px; width: var(--own); }',
			},
			{ file: 'b.astro', source: '<style>.b { padding: var(--gap); }</style>' },
			{ file: 'c.css', source: '/* var(--commented) */ .c { top: var(--sticky, 0); }' },
			{ file: 'd.astro', source: '<div style={`--x:var(--wrap-${size})`} />' },
		]
		const scripts = [{ file: 'e.ts', source: "el.style.setProperty('--sticky', '1px')" }]
		expect(contractTokens(styles, scripts, ['--ink-defined'])).toEqual({
			'--gap': 'required',
			'--ink': 'required',
		})
		expect(
			contractTokens([{ file: 'a.css', source: '.a { margin: var(--gap, 1px) }' }], [], []),
		).toEqual({ '--gap': 'optional' })
	})

	it("lists a token Tailwind's theme defines as optional, however the core reads it", () => {
		const styles = [{ file: 'a.css', source: '.a { font-family: var(--font-sans); }' }]
		expect(contractTokens(styles, [], ['--font-sans'])).toEqual({ '--font-sans': 'optional' })
	})
})

describe('env', () => {
	it('finds process.env, import.meta.env, env.X, env[…] and (env, …) reads', () => {
		const reads = envReads([
			{
				file: 'src/x.ts',
				source: [
					'process.env.ONE',
					'import.meta.env?.TWO',
					'context.env.THREE',
					"env['FOUR']",
					"required(env, 'FIVE')",
					'environment.lower',
				].join('\n'),
			},
		])
		expect(reads.map((read) => [read.name, read.line])).toEqual([
			['ONE', 1],
			['TWO', 2],
			['THREE', 3],
			['FOUR', 4],
			['FIVE', 5],
		])
	})

	it('finds names destructured from an env object', () => {
		const reads = envReads([
			{
				file: 'src/x.ts',
				source: [
					'const {',
					'\tONE,',
					"\tTWO: two, 'THREE': three = '',",
					'\t...rest',
					'} = process.env',
					'const { FOUR } = import.meta.env',
					'const { FIVE } = env',
					'const { lower } = env.nested',
				].join('\n'),
			},
		])
		expect(reads.map((read) => [read.name, read.line])).toEqual([
			['ONE', 2],
			['TWO', 3],
			['THREE', 3],
			['FOUR', 6],
			['FIVE', 7],
		])
	})

	it('fails a name the core reads but does not declare', () => {
		const reads = envReads([{ file: 'src/x.ts', source: 'process.env.NEW_FLAG' }])
		expect(undeclaredEnv(reads, { OLD: 'public' })).toEqual([
			{ name: 'NEW_FLAG', file: 'src/x.ts', line: 1 },
		])
		expect(undeclaredEnv(reads, { NEW_FLAG: 'internal' })).toEqual([])
	})
})

describe('classification', () => {
	it('is empty without changes', () => {
		expect(compareSnapshots(snapshot, snapshot)).toEqual([])
	})

	it('takes an added export, optional field or i18n key as compatible', () => {
		const exports = {
			pkg: { a: { kind: 'value', declaration: '() => void' } },
		}
		expect(
			only(
				compareSurface('exports', exports, {
					pkg: { ...exports.pkg, b: { kind: 'value', declaration: '() => void' } },
				}),
			),
		).toEqual([{ name: 'b', breaking: false }])
		expect(
			only(
				compareSurface(
					'site-files',
					{ 'site.yaml': object({ a: text }, ['a']) },
					{ 'site.yaml': object({ a: text, b: text }, ['a']) },
				),
			),
		).toEqual([{ name: 'b', breaking: false }])
		expect(only(compareSurface('i18n', ['a'], ['a', 'b']))).toEqual([
			{ name: 'b', breaking: false },
		])
	})

	// a site's src/overrides/<point>.astro stops building when its point goes away or is renamed
	it('takes a removed or renamed replacement point as breaking and an added one as compatible', () => {
		const points = snapshot['replacement-points'] as string[]
		expect(
			compareSurface(
				'replacement-points',
				points,
				points.filter((point) => point !== 'logo'),
			),
		).toEqual([
			{ surface: 'replacement-points', name: 'logo', breaking: true, detail: 'removed' },
		])
		expect(only(compareSurface('replacement-points', ['logo'], ['brand-mark']))).toEqual([
			{ name: 'logo', breaking: true },
			{ name: 'brand-mark', breaking: false },
		])
		expect(only(compareSurface('replacement-points', ['logo'], ['logo', 'menu-icon']))).toEqual(
			[{ name: 'menu-icon', breaking: false }],
		)
	})

	it('takes a removed export, i18n key, token or directive as breaking, by name', () => {
		expect(
			only(
				compareSurface(
					'exports',
					{ pkg: { gone: { kind: 'value', declaration: 'string' } } },
					{ pkg: {} },
				),
			),
		).toEqual([{ name: 'gone', breaking: true }])
		expect(only(compareSurface('i18n', ['a', 'b'], ['a']))).toEqual([
			{ name: 'b', breaking: true },
		])
		expect(
			only(
				compareSurface(
					'tokens',
					{ '--a': 'required', '--b': 'optional' },
					{ '--a': 'required' },
				),
			),
		).toEqual([{ name: '--b', breaking: true }])
		expect(
			only(compareSurface('directives', { callout: {}, note: {} }, { callout: {} })),
		).toEqual([{ name: 'note', breaking: true }])
	})

	it('takes a changed export declaration and a token turned required as breaking', () => {
		const before = { pkg: { f: { kind: 'value', declaration: '() => void' } } }
		const after = { pkg: { f: { kind: 'value', declaration: '(x: string) => void' } } }
		expect(only(compareSurface('exports', before, after))).toEqual([
			{ name: 'f', breaking: true },
		])
		expect(
			only(compareSurface('tokens', { '--a': 'optional' }, { '--a': 'required' })),
		).toEqual([{ name: '--a', breaking: true }])
		expect(
			only(compareSurface('tokens', { '--a': 'required' }, { '--a': 'optional' })),
		).toEqual([{ name: '--a', breaking: false }])
	})

	it('takes an added required token as breaking and an added optional one as compatible', () => {
		const before = { '--a': 'required' }
		expect(only(compareSurface('tokens', before, { ...before, '--b': 'required' }))).toEqual([
			{ name: '--b', breaking: true },
		])
		expect(only(compareSurface('tokens', before, { ...before, '--b': 'optional' }))).toEqual([
			{ name: '--b', breaking: false },
		])
	})

	it('names a directive attribute change directive.attribute: removals and new requirements break', () => {
		const tone = { required: false, values: ['alert', 'info', 'outdated'] }
		const note = { claim: { required: true }, tone, title: { required: false } }
		const compare = (after: object) => only(compareSurface('directives', { note }, after))

		expect(
			compare({ note: { ...note, tone: { ...tone, values: ['alert', 'info'] } } }),
		).toEqual([{ name: 'note.tone', breaking: true }])
		expect(
			compare({ note: { ...note, tone: { ...tone, values: [...tone.values, 'new'] } } }),
		).toEqual([{ name: 'note.tone', breaking: false }])
		expect(compare({ note: { claim: note.claim, tone } })).toEqual([
			{ name: 'note.title', breaking: true },
		])
		expect(compare({ note: { ...note, title: { required: true } } })).toEqual([
			{ name: 'note.title', breaking: true },
		])
		expect(compare({ note: { ...note, title: { required: false, values: ['a'] } } })).toEqual([
			{ name: 'note.title', breaking: true },
		])
		expect(compare({ note: { ...note, tone: { required: false } } })).toEqual([
			{ name: 'note.tone', breaking: false },
		])
		expect(compare({ note: { ...note, flag: { required: false } } })).toEqual([
			{ name: 'note.flag', breaking: false },
		])
		expect(compare({ note: { ...note, flag: { required: true } } })).toEqual([
			{ name: 'note.flag', breaking: true },
		])
		expect(compare({ note, other: {} })).toEqual([{ name: 'other', breaking: false }])
	})

	it('names a breaking field change by its path: newly required, enum narrowed, type changed', () => {
		const before = {
			'src/config/site.yaml': object({
				content: object({ locales: { type: 'array', items: text } }),
				mode: { type: 'string', enum: ['a', 'b'] },
				size: { type: 'number' },
			}),
		}
		const after = {
			'src/config/site.yaml': object({
				content: object({ locales: { type: 'array', items: text } }, ['locales']),
				mode: { type: 'string', enum: ['a'] },
				size: { type: 'string' },
			}),
		}
		expect(only(compareSurface('site-files', before, after))).toEqual([
			{ name: 'content.locales', breaking: true },
			{ name: 'mode', breaking: true },
			{ name: 'size', breaking: true },
		])
	})

	it('names component props with their component', () => {
		const before = { Gallery: object({ gap: { type: 'string', enum: ['s', 'm'] } }) }
		const after = { Gallery: object({ gap: { type: 'string', enum: ['s', 'm', 'l'] } }) }
		expect(only(compareSurface('mdx-components', before, after))).toEqual([
			{ name: 'Gallery.gap', breaking: false },
		])
		expect(only(compareSurface('mdx-components', after, before))).toEqual([
			{ name: 'Gallery.gap', breaking: true },
		])
	})

	it('treats removal and tightening as breaking, widening as compatible', () => {
		const cases: [unknown, unknown, boolean][] = [
			[object({ a: text }), object({}), true],
			[object({ a: text, b: text }, ['a']), object({ a: text, b: text }, []), false],
			[object({}), object({ a: text }, ['a']), true],
			[{ type: 'string', minLength: 1 }, { type: 'string', minLength: 2 }, true],
			[{ type: 'string', minLength: 2 }, { type: 'string', minLength: 1 }, false],
			[{ type: 'number', maximum: 10 }, { type: 'number', maximum: 5 }, true],
			[{ type: 'number' }, { type: 'integer' }, true],
			[{ type: 'integer' }, { type: 'number' }, false],
			[{ type: 'string' }, { type: 'string', pattern: '^a' }, true],
			[{ type: 'string', pattern: '^a' }, { type: 'string' }, false],
			[{ type: 'object' }, { type: 'object', additionalProperties: false }, true],
			[{ type: 'object', additionalProperties: false }, { type: 'object' }, false],
			[{ anyOf: [text] }, { anyOf: [text, { type: 'number' }] }, false],
			[{ anyOf: [text, { type: 'number' }] }, { anyOf: [text] }, true],
			// a new `oneOf` variant may match what another one matched, which `oneOf` then rejects
			[{ oneOf: [text] }, { oneOf: [text, { type: 'number' }] }, true],
			// a widened `oneOf` variant may overlap another one as well
			[
				{ oneOf: [{ type: 'string', minLength: 2 }, { type: 'number' }] },
				{ oneOf: [{ type: 'string', minLength: 1 }, { type: 'number' }] },
				true,
			],
			[{ oneOf: [text, { type: 'number' }] }, { oneOf: [{ type: 'number' }, text] }, false],
			[{ type: 'string', default: 'a' }, { type: 'string', default: 'b' }, true],
			[{ type: 'string', default: 'a' }, text, true],
			// a default for a field every site wrote changes no site; for an optional one it does
			[
				object({ a: text }, ['a']),
				object({ a: { type: 'string', default: 'x' } }, []),
				false,
			],
			[object({ a: text }, []), object({ a: { type: 'string', default: 'x' } }, []), true],
			[
				object({ a: { type: 'string', default: 'x' } }, []),
				object({ a: { type: 'string', default: 'y' } }, []),
				true,
			],
			[{}, text, true],
			[text, { type: 'string', description: 'doc' }, false],
			// an unknown keyword is breaking: the classifier is conservative
			[text, { type: 'string', 'x-unknown': 1 }, true],
		]
		// two spellings of "anything" are no change at all
		expect(compareSchemas({}, true)).toEqual([])
		expect(compareSchemas(true, {})).toEqual([])
		for (const [before, after, breaking] of cases) {
			const changes = compareSchemas(before, after)
			if (breaking)
				expect(
					changes.some((c) => c.breaking),
					JSON.stringify([before, after]),
				).toBe(true)
			else
				expect(
					changes.every((c) => !c.breaking),
					JSON.stringify([before, after]),
				).toBe(true)
		}
	})

	it('names a removed entry point, site file and component in full', () => {
		expect(
			only(
				compareSurface(
					'exports',
					{
						pkg: {},
						'pkg/collections': { f: { kind: 'value', declaration: '() => void' } },
					},
					{ pkg: {} },
				),
			),
		).toEqual([{ name: 'pkg/collections', breaking: true }])
		expect(
			only(
				compareSurface(
					'site-files',
					{ 'src/config/site.yaml': object({}), 'src/config/seo.yaml': object({}) },
					{ 'src/config/site.yaml': object({}) },
				),
			),
		).toEqual([{ name: 'src/config/seo.yaml', breaking: true }])
		expect(
			only(
				compareSurface(
					'mdx-components',
					{ Gallery: object({}), WrapAround: object({}) },
					{ Gallery: object({}) },
				),
			),
		).toEqual([{ name: 'WrapAround', breaking: true }])
	})

	it('takes a surface missing from the previous snapshot as new, not changed', () => {
		const before: Partial<Snapshot> = { ...snapshot }
		delete before.i18n
		expect(compareSnapshots(before, snapshot)).toEqual([])
	})
})

describe('modules', () => {
	const courses = (): ModuleEntry =>
		structuredClone((snapshot.modules as Record<string, ModuleEntry>).courses!)
	const changed = (edit: (module: ModuleEntry) => void) => {
		const after = courses()
		edit(after)
		return only(compareSurface('modules', { courses: courses() }, { courses: after }))
	}

	it('reads every module of the registry from its manifest', () => {
		const modules = snapshot.modules as Record<string, ModuleEntry>
		expect(Object.keys(modules)).toEqual(MODULES.map((module) => module.id))
		const [course] = MODULES
		expect(modules.courses).toMatchObject({
			collections: {
				courses: { source: 'src/content/courses/**/*.{md,mdx}', versions: [1] },
			},
			segments: [...course.segments],
			menu: [...course.menu],
			namespace: course.i18n.namespace,
			dependsOn: [],
		})
		// every defaulted setting is required, as in the lock
		expect((modules.courses!.config as { required: string[] }).required).toContain('order')
	})

	it('takes a removed and an added module as breaking', () => {
		expect(only(compareSurface('modules', { courses: courses() }, {}))).toEqual([
			{ name: 'courses', breaking: true },
		])
		expect(
			only(
				compareSurface(
					'modules',
					{ courses: courses() },
					{ courses: courses(), tours: courses() },
				),
			),
		).toEqual([{ name: 'tours', breaking: true }])
	})

	it('compares the settings as a schema with defaults, by the path of the setting', () => {
		expect(
			changed((module) => {
				const config = module.config as { properties: Record<string, unknown> }
				config.properties.extra = { type: 'string' }
			}),
		).toEqual([{ name: 'courses.config.extra', breaking: false }])
		expect(
			changed((module) => {
				const config = module.config as {
					properties: Record<string, { default?: unknown }>
				}
				config.properties.order!.default = 'newest'
			}),
		).toEqual([{ name: 'courses.config.order', breaking: true }])
		expect(
			changed((module) => {
				const config = module.config as { properties: Record<string, unknown> }
				delete config.properties.banner
			}),
		).toContainEqual({ name: 'courses.config.banner', breaking: true })
	})

	it('takes an added segment and an added dependency as breaking', () => {
		expect(changed((module) => module.segments.push('workshops'))).toEqual([
			{ name: 'courses.segments.workshops', breaking: true },
		])
		expect(changed((module) => module.dependsOn.push('tours'))).toEqual([
			{ name: 'courses.dependsOn.tours', breaking: true },
		])
	})

	it('takes a removed collection version as breaking and an added one as compatible', () => {
		expect(changed((module) => module.collections.courses!.versions.push(2))).toEqual([
			{ name: 'courses.collections.courses.versions', breaking: false },
		])
		const before = courses()
		before.collections.courses!.versions = [1, 2]
		expect(
			only(compareSurface('modules', { courses: before }, { courses: courses() })),
		).toEqual([{ name: 'courses.collections.courses.versions', breaking: true }])
		expect(changed((module) => delete module.collections.courses)).toEqual([
			{ name: 'courses.collections.courses', breaking: true },
		])
		expect(
			changed((module) => {
				module.collections.courses!.source = 'src/content/workshops/**/*.md'
			}),
		).toEqual([{ name: 'courses.collections.courses.source', breaking: true }])
	})

	it('takes an added collection of a module as breaking', () => {
		expect(
			changed((module) => {
				module.collections.lessons = {
					source: 'src/content/lessons/**/*.md',
					versions: [1],
				}
			}),
		).toEqual([{ name: 'courses.collections.lessons', breaking: true }])
	})

	it('takes a changed i18n namespace as breaking', () => {
		expect(changed((module) => (module.namespace = 'workshops'))).toEqual([
			{ name: 'courses.namespace', breaking: true },
		])
	})

	it('takes any other removal as breaking and any other addition as compatible', () => {
		expect(
			changed((module) => {
				module.menu = []
				module.tokens = []
				module.moreDocsKinds = []
				module.segments = []
			}),
		).toEqual([
			{ name: 'courses.menu.courses', breaking: true },
			{ name: 'courses.moreDocsKinds.course', breaking: true },
			{ name: 'courses.segments.courses', breaking: true },
			{ name: 'courses.tokens.--status-badge-courses', breaking: true },
		])
		expect(
			changed((module) => {
				module.mdx.push('Syllabus')
				module.directives.push('lesson')
				module.menu.push('workshops')
				module.tokens.push('--course-accent')
				module.moreDocsKinds.push('lesson')
			}),
		).toEqual([
			{ name: 'courses.directives.lesson', breaking: false },
			{ name: 'courses.mdx.Syllabus', breaking: false },
			{ name: 'courses.menu.workshops', breaking: false },
			{ name: 'courses.moreDocsKinds.lesson', breaking: false },
			{ name: 'courses.tokens.--course-accent', breaking: false },
		])
		expect(
			only(
				compareSurface(
					'modules',
					{ courses: { mdx: [], legacy: 1 } },
					{ courses: { mdx: [] } },
				),
			),
		).toEqual([{ name: 'courses.legacy', breaking: true }])
	})

	it('fails the snapshot check when a manifest changes without modules.json', () => {
		const texts = Object.fromEntries(
			SURFACES.map((surface) => [surface, serializeSurface(snapshot[surface])]),
		)
		const stale = courses()
		stale.segments = []
		texts.modules = serializeSurface({ courses: stale })
		expect(snapshotDrift(snapshot, texts)).toEqual([
			{
				surface: 'modules',
				missing: false,
				changes: [
					{
						surface: 'modules',
						name: 'courses.segments.courses',
						breaking: true,
						detail: 'added',
					},
				],
			},
		])
	})
})

describe('checks JSON Schema cannot express', () => {
	const positive = (value: number) => value > 0
	const shorthand = (value: unknown) => (typeof value === 'string' ? { id: value } : value)
	const item = z.object({ id: z.string() })

	it('digests checks and transforms apart, on the node they apply to', () => {
		const schema = jsonSchema(
			z
				.object({
					size: z.number().refine(positive).optional(),
					items: z.array(z.preprocess(shorthand, item)),
					name: z.string().transform((value) => value.trim()),
					slug: z.string().trim().toLowerCase(),
					tag: z.string().overwrite((value) => value.replace(/^#/, '')),
				})
				.superRefine((value, context) => {
					if (value.items.length === 0) context.addIssue({ code: 'custom', message: 'x' })
				}),
		) as {
			[REFINEMENTS]: string[]
			properties: Record<string, Record<string, unknown> & { items?: object }>
		}
		expect(schema[REFINEMENTS]).toHaveLength(1)
		expect(schema).not.toHaveProperty([TRANSFORMS])
		expect(schema.properties.size![REFINEMENTS]).toHaveLength(1)
		expect(schema.properties.size).not.toHaveProperty([TRANSFORMS])
		expect(schema.properties.name![TRANSFORMS]).toHaveLength(1)
		expect(schema.properties.name).not.toHaveProperty([REFINEMENTS])
		expect(schema.properties.items!.items).toHaveProperty([TRANSFORMS])
		expect(schema.properties.items!.items).not.toHaveProperty([REFINEMENTS])
		// the built-in `.trim()` and `.toLowerCase()` are transforms
		expect(schema.properties.slug![TRANSFORMS]).toHaveLength(2)
		expect(schema.properties.tag![TRANSFORMS]).toHaveLength(1)
		// a superRefine is digested by its own source, not by zod's wrapper around it
		const other = jsonSchema(z.object({}).superRefine(() => {})) as Record<string, unknown>
		expect(other[REFINEMENTS]).not.toEqual(schema[REFINEMENTS])
	})

	it('keeps the digest across whitespace and changes it with the source', () => {
		const digest = (fn: (value: number) => boolean) =>
			(jsonSchema(z.number().refine(fn)) as Record<string, unknown>)[REFINEMENTS]
		expect(refinementDigest('(value) =>\n\t\tvalue  > 0 ')).toBe(
			refinementDigest('(value) => value > 0'),
		)
		expect(digest((value) => value > 0)).toEqual([refinementDigest('(value) => value > 0')])
		expect(digest((value) => value >= 0)).not.toEqual(digest((value) => value > 0))
	})

	it('takes an added or changed check as breaking by the field path, a removed one as compatible', () => {
		const props = (images: z.ZodType) => ({
			Gallery: jsonSchema(z.object({ images: z.array(images) })),
		})
		const plain = props(item)
		const refined = props(item.refine((value) => value.id !== ''))
		expect(only(compareSurface('mdx-components', plain, refined))).toEqual([
			{ name: 'Gallery.images[]', breaking: true },
		])
		expect(only(compareSurface('mdx-components', refined, plain))).toEqual([
			{ name: 'Gallery.images[]', breaking: false },
		])

		const site = (locales: z.ZodType) => ({
			'src/config/site.yaml': jsonSchema(z.object({ content: z.object({ locales }) })),
		})
		const once = site(z.array(z.string()).refine((list) => list.length > 0))
		const twice = site(z.array(z.string()).refine((list) => list.length > 1))
		expect(only(compareSurface('site-files', once, twice))).toEqual([
			{ name: 'content.locales', breaking: true },
		])
	})
})

describe('transforms JSON Schema cannot express', () => {
	const shorthand = (value: unknown) => (typeof value === 'string' ? { id: value } : value)
	const item = z.object({ id: z.string() })

	it('takes any change of a transform as breaking, its removal too', () => {
		const props = (images: z.ZodType) => ({
			Gallery: jsonSchema(z.object({ images: z.array(images) })),
		})
		const plain = props(item)
		const preprocessed = props(z.preprocess(shorthand, item))
		// dropping the shorthand rejects `images: ['id']`, which it used to accept
		expect(only(compareSurface('mdx-components', preprocessed, plain))).toEqual([
			{ name: 'Gallery.images[]', breaking: true },
		])
		expect(only(compareSurface('mdx-components', plain, preprocessed))).toEqual([
			{ name: 'Gallery.images[]', breaking: true },
		])
		const other = props(z.preprocess((value) => value, item))
		expect(only(compareSurface('mdx-components', preprocessed, other))).toEqual([
			{ name: 'Gallery.images[]', breaking: true },
		])
	})

	it('takes a transform removed from a schema that now accepts anything as breaking', () => {
		const before = jsonSchema(z.preprocess(shorthand, z.unknown()))
		expect(before).toHaveProperty([TRANSFORMS])
		expect(compareSchemas(before, {}).map((change) => change.breaking)).toEqual([true])
		expect(compareSchemas({}, before).map((change) => change.breaking)).toEqual([true])
	})

	it('takes an added or removed built-in trim as breaking by the field path', () => {
		const site = (title: z.ZodType) => ({
			'src/config/seo.yaml': jsonSchema(z.object({ title })),
		})
		const plain = site(z.string().min(1))
		const trimmed = site(z.string().trim().min(1))
		expect(only(compareSurface('site-files', plain, trimmed))).toEqual([
			{ name: 'title', breaking: true },
		])
		expect(only(compareSurface('site-files', trimmed, plain))).toEqual([
			{ name: 'title', breaking: true },
		])
	})
})

describe('drift of the committed files', () => {
	const texts = () =>
		Object.fromEntries(
			SURFACES.map((surface) => [surface, serializeSurface(snapshot[surface])]),
		)

	it('passes when every file is the generated one', () => {
		expect(snapshotDrift(snapshot, texts())).toEqual([])
	})

	it('names the surface and the change of a stale file, and a missing one', () => {
		const stale: Partial<Record<string, string>> = {
			...texts(),
			i18n: serializeSurface(['zz.gone', ...(snapshot.i18n as string[])]),
		}
		delete stale.env
		expect(snapshotDrift(snapshot, stale)).toEqual([
			{
				surface: 'i18n',
				missing: false,
				changes: [{ surface: 'i18n', name: 'zz.gone', breaking: true, detail: 'removed' }],
			},
			{ surface: 'env', missing: true, changes: [] },
		])
	})

	it('reports a hand-formatted file with the same content', () => {
		const reformatted = { ...texts(), cli: `${JSON.stringify(snapshot.cli)}\n` }
		expect(snapshotDrift(snapshot, reformatted)).toEqual([
			{ surface: 'cli', missing: false, changes: [] },
		])
	})
})

describe('CHANGELOG entries for breaking changes', () => {
	it('reads a CHANGELOG with CRLF line endings', () => {
		const changelog =
			'# Changelog\r\n\r\n## [Unreleased]\r\n\r\n- **Breaking:** `nav.home` is gone.\r\n'
		expect(changelogBreakingEntries(changelog)).toEqual(['- **Breaking:** `nav.home` is gone.'])
	})

	const changelog = [
		'# Changelog',
		'',
		'## [Unreleased]',
		'',
		'### Removed',
		'',
		'- **Breaking:** the `nav.home` key is gone; sites',
		'  that override `content.locales` must add it.',
		'- `other` removed without the marker.',
		'',
		'## [1.0.0] - 2026-01-01',
		'',
		'- **Breaking:** `old.key` (released already).',
	].join('\n')

	it('reads only the marked entries of [Unreleased], with their continuation lines', () => {
		expect(changelogBreakingEntries(changelog)).toEqual([
			'- **Breaking:** the `nav.home` key is gone; sites\n  that override `content.locales` must add it.',
		])
	})

	it('reads the marked entries of each given section, and only of those', () => {
		expect(changelogBreakingEntries(changelog, ['1.0.0'])).toEqual([
			'- **Breaking:** `old.key` (released already).',
		])
		expect(changelogBreakingEntries(changelog, ['Unreleased', '1.0.0'])).toHaveLength(2)
		expect(changelogBreakingEntries(changelog, ['2.0.0'])).toEqual([])
	})

	it('skips a **Breaking:** line inside a code fence', () => {
		const fenced = [
			'## [Unreleased]',
			'',
			'```md',
			'- **Breaking:** the `nav.home` key is gone.',
			'```',
			'',
			'- **Breaking:** `real.key` is gone.',
		].join('\n')
		expect(changelogBreakingEntries(fenced)).toEqual(['- **Breaking:** `real.key` is gone.'])
	})

	it('matches the whole name, not a longer one that contains it', () => {
		const entry = (text: string) =>
			['## [Unreleased]', '', `- **Breaking:** ${text}`].join('\n')
		const change = (name: string): Change => ({
			surface: 'i18n',
			name,
			breaking: true,
			detail: 'removed',
		})
		expect(
			unannouncedBreaking([change('nav.home')], entry('`nav.homepage` is gone.')),
		).toHaveLength(1)
		expect(
			unannouncedBreaking(
				[change('--color-accent')],
				entry('`--color-accent-fixed` is gone.'),
			),
		).toHaveLength(1)
		expect(unannouncedBreaking([change('home')], entry('`nav.home` is gone.'))).toHaveLength(1)
		expect(
			unannouncedBreaking([change('@scope/pkg')], entry('`@scope/pkg/collections` is gone.')),
		).toHaveLength(1)
		expect(
			unannouncedBreaking(
				[change('pkg/collections')],
				entry('`@scope/pkg/collections` is gone.'),
			),
		).toHaveLength(1)
		expect(
			unannouncedBreaking([change('@scope/pkg')], entry('`@scope/pkg` lost an export.')),
		).toEqual([])
		expect(unannouncedBreaking([change('nav.home')], entry('`nav.home` is gone.'))).toEqual([])
		expect(
			unannouncedBreaking([change('note.tone')], entry('note.tone: `outdated` removed')),
		).toEqual([])
	})

	it('requires every breaking change to be named in one of them', () => {
		const change = (name: string, breaking = true): Change => ({
			surface: 'i18n',
			name,
			breaking,
			detail: 'removed',
		})
		expect(
			unannouncedBreaking(
				[
					change('nav.home'),
					change('content.locales'),
					change('other'),
					change('old.key'),
					change('fine', false),
				],
				changelog,
			).map((c) => c.name),
		).toEqual(['other', 'old.key'])
	})
})
