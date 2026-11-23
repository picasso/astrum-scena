import { readFileSync } from 'node:fs'
import path from 'node:path'

import { Linter } from 'eslint'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'

import { CORE_ROOT } from './core-root.ts'
import {
	astrumScenaEslint,
	astrumScenaStyle,
	type CoreManifest,
	declaredSpecifiers,
	deepImportRules,
	enumDeclaration,
	type FlatConfig,
	installedManifest,
} from './eslint.ts'

const linter = new Linter({ configType: 'flat' })

// typed as a site's TS config would type it: the preset must fit ESLint's own config type
const configOf = (manifest?: CoreManifest) => defineConfig(...astrumScenaEslint({}, manifest))
const typescript = defineConfig({
	files: ['**/*.ts'],
	languageOptions: { parser: tseslint.parser },
})

const restricted = (code: string, manifest?: CoreManifest, file = 'probe.mjs') =>
	linter
		.verify(code, [...configOf(manifest), ...typescript], file)
		.filter(
			(message) =>
				message.ruleId === 'no-restricted-imports' ||
				message.ruleId === 'no-restricted-syntax',
		)

const CORE = installedManifest().name

const forms = [
	(source: string) => `import x from '${source}'\nexport { x }\n`,
	(source: string) => `export { x } from '${source}'\n`,
	(source: string) => `export * from '${source}'\n`,
	(source: string) => `export const load = () => import('${source}')\n`,
	(source: string) => `export const load = () => import(\`${source}\`)\n`,
]

const expectBlocked = (source: string, manifest?: CoreManifest) => {
	for (const form of forms) {
		const messages = restricted(form(source), manifest)
		expect(messages, form(source)).toHaveLength(1)
		expect(messages[0]!.message, form(source)).toContain('"exports"')
	}
}

const expectAllowed = (source: string, manifest?: CoreManifest) => {
	for (const form of forms) expect(restricted(form(source), manifest), form(source)).toEqual([])
}

describe('astrumScenaEslint', () => {
	it('reads the declared entry points from the core package.json', () => {
		const manifest = JSON.parse(
			readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8'),
		) as CoreManifest
		expect(installedManifest()).toEqual(manifest)
		expect(declaredSpecifiers(manifest)).toEqual(
			Object.keys(manifest.exports).map((key) =>
				key === '.' ? manifest.name : `${manifest.name}/${key.slice(2)}`,
			),
		)
	})

	it('allows the package root, every declared entry point and a package with a longer name', () => {
		for (const specifier of declaredSpecifiers(installedManifest())) expectAllowed(specifier)
		expectAllowed(`${CORE}-extra`)
		expectAllowed(`${CORE}-extra/src/x`)
	})

	it('bans internal paths in static imports, re-exports and dynamic import()', () => {
		for (const source of [
			`${CORE}/src/lib/x`,
			`${CORE}/dist/index.js`,
			`${CORE}/package.json`,
			`${CORE}/collections/x`,
			`${CORE}/`,
			`../node_modules/${CORE}/src/x`,
			`node_modules/${CORE}`,
		])
			expectBlocked(source)
	})

	it('names the specifier and the exports in a static import message', () => {
		const [message] = restricted(`import x from '${CORE}/src/lib/x'\nexport { x }\n`)
		expect(message!.message).toContain(`'${CORE}/src/lib/x'`)
		expect(message!.message).toContain(`${CORE}/collections`)
	})

	it('bans a computed import() source that starts inside the package', () => {
		for (const code of [
			`export const load = (x) => import(\`${CORE}/src/\${x}\`)\n`,
			`export const load = (x) => import(\`${CORE}/collections\${x}\`)\n`,
			`export const load = (x) => import('${CORE}/src/' + x)\n`,
			`export const load = (x) => import(x ? '${CORE}/src/a' : 'b')\n`,
		])
			expect(restricted(code), code).toHaveLength(1)
		expect(restricted(`export const load = (x) => import('./' + x)\n`)).toEqual([])
	})

	it('matches the case of the declared entry points exactly', () => {
		expectBlocked(`${CORE}/COLLECTIONS`)
		expect(deepImportRules().patterns.every((pattern) => pattern.caseSensitive)).toBe(true)
	})

	it('bans a computed import() source that starts with the bare package name', () => {
		for (const code of [
			`export const load = () => import('${CORE}' + '/src/x')\n`,
			`export const load = (x) => import(\`${CORE}\${x}\`)\n`,
		])
			expect(restricted(code), code).toHaveLength(1)
	})

	it('reads only the source of import(), not its options', () => {
		expect(
			restricted(
				`export const load = (x) => import('./a' + x, { with: { type: '${CORE}/src/x' } })\n`,
			),
		).toEqual([])
	})

	it('bans internal paths in import() types and allows declared ones', () => {
		const typeOf = (source: string) => `export type T = import('${source}').X\n`
		expect(restricted(typeOf(`${CORE}/src/x`), undefined, 'probe.ts')).toHaveLength(1)
		expect(restricted(typeOf(`${CORE}/collections`), undefined, 'probe.ts')).toEqual([])
	})

	it('leaves a subpath with a null target out of the allowed list', () => {
		const blocked: CoreManifest = {
			name: CORE,
			exports: { '.': './dist/index.js', './x': null, './y': './dist/y.js' },
		}
		expect(declaredSpecifiers(blocked)).toEqual([CORE, `${CORE}/y`])
		expectBlocked(`${CORE}/x`, blocked)
		expectAllowed(`${CORE}/y`, blocked)
	})

	it('follows the exports of the manifest it is given, with no second list', () => {
		const declaredX: CoreManifest = {
			name: CORE,
			exports: { '.': './dist/index.js', './x': './dist/x.js' },
		}
		expectAllowed(`${CORE}/x`, declaredX)
		expectBlocked(`${CORE}/collections`, declaredX)
		expectBlocked(`${CORE}/x`)
		expect(deepImportRules(declaredX)).not.toEqual(deepImportRules())
	})

	it('bans every subpath when only the root is exported', () => {
		const rootOnly: CoreManifest = { name: CORE, exports: { '.': './dist/index.js' } }
		expectAllowed(CORE, rootOnly)
		expectBlocked(`${CORE}/collections`, rootOnly)
	})

	it('keeps the selectors the site passes and scopes the object to its files', () => {
		const own = { selector: 'TSEnumDeclaration', message: 'no enum' }
		const [config] = astrumScenaEslint({ files: ['site/**'], syntax: [own] })
		expect(config!.files).toEqual(['site/**'])
		expect(config!.rules['no-restricted-syntax']).toEqual([
			'error',
			own,
			...deepImportRules().syntax,
		])
		expect(astrumScenaEslint()[0]).not.toHaveProperty('files')
	})
})

const PLUGIN = 'astrum-scena'
const STYLE_PEERS = ['typescript-eslint', 'eslint-plugin-simple-import-sort']

const ruleIdsOf = (code: string, config: readonly object[], file = 'probe.ts') =>
	linter
		.verify(code, [...(config as FlatConfig[]), ...typescript] as never, file)
		.map((message) => ({ ruleId: message.ruleId, severity: message.severity }))

const INLINE = `${PLUGIN}/no-inline-config`

describe('the inline config ban of the base preset', () => {
	const deep = `import x from '${CORE}/src/lib/x'\nexport { x }\n`

	it('ignores an eslint-disable comment and reports it as an error', () => {
		for (const comment of [
			'// eslint-disable-next-line no-restricted-imports',
			'/* eslint-disable */',
			'/* eslint no-restricted-imports: off */',
		]) {
			const ids = ruleIdsOf(`${comment}\n${deep}`, configOf())
			expect(ids, comment).toContainEqual({ ruleId: 'no-restricted-imports', severity: 2 })
			expect(ids, comment).toContainEqual({ ruleId: INLINE, severity: 2 })
		}
	})

	it('reports directives only where ESLint reads them', () => {
		const ids = (code: string) =>
			ruleIdsOf(`${code}\nexport const a = 1\n`, configOf()).map((entry) => entry.ruleId)
		expect(ids('/* global window */')).toContain(INLINE)
		expect(ids('// global settings live in site.yaml')).not.toContain(INLINE)
		expect(ids('// eslint is configured by the core')).not.toContain(INLINE)
		expect(ids('// eslint-disable-line')).toContain(INLINE)
	})
})

describe('astrumScenaStyle', () => {
	it('bans JSDoc, enum, interface, any and default exports outside tool configs', async () => {
		const style = defineConfig(
			...((await astrumScenaStyle()) as never[]),
			...astrumScenaEslint({ syntax: [enumDeclaration] }),
		)
		const ids = (code: string, file = 'src/probe.ts') =>
			linter.verify(code, style, file).map((message) => message.ruleId)
		expect(ids('/** x */\nexport const a = 1\n')).toContain(`${PLUGIN}/no-jsdoc`)
		expect(ids('export enum E {\n\tA,\n}\n')).toContain('no-restricted-syntax')
		expect(ids('export interface A {\n\ta: number\n}\n')).toContain(
			'@typescript-eslint/consistent-type-definitions',
		)
		expect(ids('export const a = (b: any) => b\n')).toContain(
			'@typescript-eslint/no-explicit-any',
		)
		expect(ids('export default {}\n')).toContain('no-restricted-exports')
		expect(ids('export default {}\n', 'astro.config.mjs')).not.toContain(
			'no-restricted-exports',
		)
		expect(ids("import b from 'b'\nimport a from 'a'\nexport { a, b }\n")).toContain(
			'simple-import-sort/imports',
		)
		expect(ids('// Foo\nexport const a = 1\n')).toContain('capitalized-comments')
		expect(ids('// eslint-disable-next-line prefer-const\nlet a = 1\nexport { a }\n')).toEqual(
			expect.arrayContaining(['prefer-const', INLINE]),
		)
	})

	it('asks to install a missing optional peer', async () => {
		for (const missing of STYLE_PEERS) {
			const importPeer = (name: string) =>
				name === missing
					? Promise.reject(
							Object.assign(
								new Error(`Cannot find package '${name}' imported from x.js`),
								{
									code: 'ERR_MODULE_NOT_FOUND',
								},
							),
						)
					: import(name)
			await expect(astrumScenaStyle(importPeer)).rejects.toThrow(
				`pnpm add -D ${STYLE_PEERS.join(' ')}`,
			)
		}
	})
})
