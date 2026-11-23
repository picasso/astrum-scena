import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, expect, it } from 'vitest'

import { runAstrumScena } from '../test-fixtures.ts'

// a fixture core under `core/` and sites beside it; the bin runs in `site/`

let root: string

const write = (relative: string, content: string) => {
	const file = path.join(root, relative)
	mkdirSync(path.dirname(file), { recursive: true })
	writeFileSync(file, content)
}

const run = (...args: string[]) =>
	runAstrumScena(path.join(root, 'site'), args, { coreRoot: path.join(root, 'core') })

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), 'color-literals-'))
	for (const site of ['site', 'other']) write(`${site}/site.yaml`, 'schemaVersion: 3\n')
	write('site/src/theme/theme.css', ':root {\n\t--color-shade: #000000;\n}\n')
	write('site/src/generated/layout-tokens.css', ':root {\n\t--x: 1px;\n}\n')
	write('core/src/styles/deep/rule.css', '.a {\n\tcolor: var(--color-shade);\n}\n')
	write(
		'core/src/components/nested/card.astro',
		'<p>x</p>\n<style>\n\t.b { color: currentColor; }\n</style>\n',
	)
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

it('passes literals in the site theme and fails with file:line on a literal in the core', async () => {
	const clean = await run('check', 'color-literals')
	expect(clean.status, clean.stderr).toBe(0)
	expect(clean.stdout).toContain('check color-literals OK')

	write('core/src/styles/deep/rule.css', '.a {\n\tcolor: #fff;\n}\n')
	write(
		'core/src/components/nested/card.astro',
		'<p>x</p>\n<style>\n\t.b { color: black; }\n</style>\n',
	)
	const dirty = await run('check', 'color-literals')
	expect(dirty.status).toBe(1)
	expect(dirty.stderr).toContain('../core/src/styles/deep/rule.css:2: #fff')
	expect(dirty.stderr).toContain('../core/src/components/nested/card.astro:3: black')
	expect(dirty.stderr).not.toContain('theme.css:')
})

it('scans the site sources and takes the site root from --root', async () => {
	write('site/src/styles/site.css', '.s {\n\tcolor: red;\n}\n')
	const site = await run('check', 'color-literals')
	expect(site.status).toBe(1)
	expect(site.stderr).toContain('src/styles/site.css:2: red')
	expect(site.stderr).toContain('Declare the color as a token in src/theme/theme.css')

	write('other/src/theme/theme.css', ':root {\n\t--color-shade: #111;\n}\n')
	const other = await run('check', 'color-literals', '--root', '../other')
	expect(other.status, other.stderr).toBe(0)

	write('core/src/theme/theme.css', ':root {\n\t--x: #fff;\n}\n')
	const coreTheme = await run('check', 'color-literals', '--root', '../other')
	expect(coreTheme.status).toBe(1)
	expect(coreTheme.stderr).toContain('../core/src/theme/theme.css:2: #fff')
})
