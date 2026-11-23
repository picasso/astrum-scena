import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import { FEATURED_HOME_PATH } from './content/files.ts'
import { featuredConfigSchema } from './content/schemas.ts'
import { loadFeaturedHome } from './featured.ts'

const roots: string[] = []
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function siteRoot(home?: string): string {
	const root = mkdtempSync(path.join(tmpdir(), 'featured-home-'))
	roots.push(root)
	if (home === undefined) return root
	const file = path.join(root, FEATURED_HOME_PATH)
	mkdirSync(path.dirname(file), { recursive: true })
	writeFileSync(file, home)
	return root
}

describe('loadFeaturedHome', () => {
	it('reads the slides from the site root', async () => {
		const root = siteRoot()
		const file = path.join(root, FEATURED_HOME_PATH)
		mkdirSync(path.dirname(file), { recursive: true })
		const fixture = fileURLToPath(
			new URL('./content/__fixtures__/featured-home.yaml', import.meta.url),
		)
		cpSync(fixture, file)
		expect(await loadFeaturedHome(root)).toEqual(
			featuredConfigSchema.parse(parseYaml(readFileSync(fixture, 'utf8'))),
		)
	})

	it('gives no slider to a site without the file', async () => {
		expect(await loadFeaturedHome(siteRoot())).toBeUndefined()
	})

	it('still rejects a file without slides', async () => {
		await expect(loadFeaturedHome(siteRoot('schemaVersion: 1\nslides: []\n'))).rejects.toThrow(
			/slides/,
		)
	})

	it('rejects a file without schemaVersion, naming it and the supported versions', async () => {
		await expect(loadFeaturedHome(siteRoot('slides: []\n'))).rejects.toThrow(
			`${FEATURED_HOME_PATH}: missing schemaVersion; supported: 1`,
		)
	})
})
