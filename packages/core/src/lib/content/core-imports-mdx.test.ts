import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { installedManifest } from '../../core-imports.ts'
import { coreImportsMdastPlugin, esmSources } from './core-imports-mdx.ts'

const CORE = installedManifest().name
const FILE = '/site/src/content/pages/probe.en.mdx'

const visit = (esm: string, plugin = coreImportsMdastPlugin()) =>
	plugin.mdxjsEsm({ value: esm }, { fileURL: pathToFileURL(FILE) })

describe('esmSources', () => {
	it('lists the sources of imports and re-exports, not of local exports', () => {
		expect(
			esmSources(
				"import a from 'a'\nimport { b } from 'b'\nexport * from 'c'\nexport { d } from 'd'\nexport const e = 1",
			),
		).toEqual(['a', 'b', 'c', 'd'])
	})
})

describe('coreImportsMdastPlugin', () => {
	it('rejects an import of core internals, naming the file, the specifier and exports', () => {
		for (const source of [
			`../../node_modules/${CORE}/src/x`,
			`${CORE}/src/x`,
			`${CORE}/dist/index.js`,
		]) {
			const failure = () => visit(`import X from '${source}'`)
			expect(failure, source).toThrow(FILE)
			expect(failure, source).toThrow(`'${source}'`)
			expect(failure, source).toThrow('package.json "exports"')
		}
	})

	it('rejects a re-export of core internals', () => {
		expect(() => visit(`export * from '${CORE}/src/x'`)).toThrow(`'${CORE}/src/x'`)
		expect(() => visit(`export { a } from '${CORE}/src/x'`)).toThrow(`'${CORE}/src/x'`)
	})

	it('passes declared entry points, other packages and local exports', () => {
		for (const esm of [
			`import { a } from '${CORE}'`,
			`import { b } from '${CORE}/collections'`,
			`import c from '${CORE}-extra/src/x'`,
			`import d from './local.ts'`,
			'export const e = 1',
		])
			expect(() => visit(esm), esm).not.toThrow()
	})

	it('follows the exports of the manifest it is given', () => {
		const plugin = coreImportsMdastPlugin({ name: CORE, exports: { '.': './dist/index.js' } })
		expect(() => visit(`import { b } from '${CORE}/collections'`, plugin)).toThrow(
			`'${CORE}/collections'`,
		)
	})
})
