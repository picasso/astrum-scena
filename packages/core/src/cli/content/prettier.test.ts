import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CORE_ROOT } from '../../core-root.ts'
import { loadPrettier, PRETTIER_PACKAGE } from './prettier.ts'

// prettier is an optional peer of the core: a site without it runs every command and gate but the
// writing content commands, so no other module of the core imports it
const PRETTIER_MODULES = new Set(['cli/content/prettier.ts'])
const PRETTIER_IMPORT = /\bfrom\s+['"]prettier['"]|\bimport\(\s*['"]prettier['"]\s*\)/

const missingPackage = () =>
	Promise.reject(
		Object.assign(new Error(`Cannot find package '${PRETTIER_PACKAGE}' imported from x.js`), {
			code: 'ERR_MODULE_NOT_FOUND',
		}),
	)

describe(PRETTIER_PACKAGE, () => {
	it('is an optional peer, not a dependency', () => {
		const manifest = JSON.parse(readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8')) as {
			dependencies?: Record<string, string>
			peerDependencies?: Record<string, string>
			peerDependenciesMeta?: Record<string, { optional?: boolean }>
		}
		expect(manifest.dependencies?.[PRETTIER_PACKAGE]).toBeUndefined()
		expect(manifest.peerDependencies?.[PRETTIER_PACKAGE]).toBeDefined()
		expect(manifest.peerDependenciesMeta?.[PRETTIER_PACKAGE]?.optional).toBe(true)
	})

	it('is imported by no module of the core outside the formatter', () => {
		const src = path.join(CORE_ROOT, 'src')
		const importers = readdirSync(src, { recursive: true, encoding: 'utf8' })
			.map((file) => file.split(path.sep).join('/'))
			.filter((file) => /\.(?:tsx?|astro|m?js)$/.test(file) && !/\.test\.tsx?$/.test(file))
			.filter((file) => !PRETTIER_MODULES.has(file))
			.filter((file) => PRETTIER_IMPORT.test(readFileSync(path.join(src, file), 'utf8')))
		expect(importers).toEqual([])
	})

	it('asks to install it when the package is missing', async () => {
		await expect(loadPrettier(missingPackage)).rejects.toThrow(
			'install it in the site: pnpm add -D prettier',
		)
	})

	it('passes other import errors through', async () => {
		await expect(loadPrettier(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
	})
})
