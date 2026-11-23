import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { BIN } from '../packages/core/src/cli/registry.ts'

// the demo is a thin site: its package scripts only alias the core's bin and Astro, so a site that
// copies them gets every operation from the installed core, never from this repository's scripts
const DEMO_MANIFEST = fileURLToPath(new URL('../demo/package.json', import.meta.url))
const ALIAS = new RegExp(`^(?:${BIN}|astro)(?: [\\w:<>./=-]+)*$`)

const nonAliasScripts = (scripts: Readonly<Record<string, string>>): string[] =>
	Object.entries(scripts)
		.filter(([, command]) => !ALIAS.test(command))
		.map(([name, command]) => `${name}: ${command}`)

describe('the demo package scripts', () => {
	it('are aliases of the core bin or Astro commands', () => {
		const { scripts } = JSON.parse(readFileSync(DEMO_MANIFEST, 'utf8')) as {
			scripts: Record<string, string>
		}
		expect(Object.values(scripts)).toContain(`${BIN} check`)
		expect(nonAliasScripts(scripts)).toEqual([])
	})

	it('reject a script that runs anything else', () => {
		expect(
			nonAliasScripts({
				build: 'astro build',
				gates: `${BIN} check --root .`,
				local: 'node --experimental-strip-types ../scripts/check-pages.ts',
				chained: `${BIN} check && node x.js`,
				prefixed: `${BIN}-extra check`,
			}),
		).toEqual([
			'local: node --experimental-strip-types ../scripts/check-pages.ts',
			`chained: ${BIN} check && node x.js`,
			`prefixed: ${BIN}-extra check`,
		])
	})
})
