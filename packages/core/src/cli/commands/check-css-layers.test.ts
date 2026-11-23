import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { runAstrumScena } from '../test-fixtures.ts'

// the gate exits non-zero on a violation, run on a fixture core under `core/` and sites beside it;
// the bin runs in `site/`

let root: string

const write = (file: string, text: string) => {
	mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
	writeFileSync(path.join(root, file), text)
}

const run = (...args: string[]) =>
	runAstrumScena(path.join(root, 'site'), ['check', 'css-layers', ...args], {
		coreRoot: path.join(root, 'core'),
	})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('check css-layers', () => {
	const tree = (
		component: string,
		global = "'/src/generated/layout-tokens.css' layer(theme)",
	) => {
		root = mkdtempSync(path.join(tmpdir(), 'css-layers-cli-'))
		write('core/src/styles/layers.css', '@layer theme, base, components;\n')
		write(
			'core/src/styles/global.css',
			`@import './layers.css';\n@import '/src/theme/theme.css';\n@import ${global};\n`,
		)
		write('core/src/layouts/shell.astro', "---\nimport '../styles/global.css'\n---\n")
		write('core/src/components/card.css', component)
		for (const site of ['site', 'other']) write(`${site}/site.yaml`, 'schemaVersion: 3\n')
		write('site/src/theme/theme.css', '@layer theme {\n\t:root {\n\t\t--y: 1px;\n\t}\n}\n')
		write('site/src/generated/layout-tokens.css', ':root {\n\t--x: 1px;\n}\n')
	}
	const LAYERED = "@import '../styles/layers.css';\n@layer components {\n\t.card {}\n}\n"

	it('exits 0 on a layered tree', async () => {
		tree(LAYERED)
		const result = await run()
		expect(result.status, result.stderr).toBe(0)
	})

	it('exits non-zero on a rule outside a layer, naming file and line', async () => {
		tree("@import '../styles/layers.css';\n.card {}\n")
		const result = await run()
		expect(result.status).not.toBe(0)
		expect(result.stderr).toContain('../core/src/components/card.css:2: .card outside @layer')
		expect(result.stderr).toContain('@import of ../core/src/styles/layers.css')
	})

	it('exits non-zero when global.css imports the layout tokens outside layer(theme)', async () => {
		tree(LAYERED, "'/src/generated/layout-tokens.css'")
		const result = await run()
		expect(result.status).not.toBe(0)
		expect(result.stderr).toContain(
			"../core/src/styles/global.css:1: must @import '/src/generated/layout-tokens.css' layer(theme)",
		)
	})

	it('exits non-zero on an unlayered rule in the site files, read from --root', async () => {
		tree(LAYERED)
		write('other/src/theme/theme.css', '.x {}\n')
		write('other/src/generated/layout-tokens.css', ':root {\n\t--x: 1px;\n}\n')
		const result = await run('--root', '../other')
		expect(result.status).not.toBe(0)
		expect(result.stderr).toContain('../other/src/theme/theme.css:1: .x outside @layer')
	})
})
