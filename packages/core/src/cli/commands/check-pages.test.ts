import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, expect, it } from 'vitest'

import { runAstrumScena } from '../test-fixtures.ts'

// a fixture core under `core/` and sites beside it; the bin runs in `site/`

let root: string

const write = (relative: string) => {
	const file = path.join(root, relative)
	mkdirSync(path.dirname(file), { recursive: true })
	writeFileSync(file, '')
}

const run = (...args: string[]) =>
	runAstrumScena(path.join(root, 'site'), ['check', 'pages', ...args], {
		coreRoot: path.join(root, 'core'),
	})

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), 'pages-routes-'))
	for (const site of ['site', 'other', 'bare']) write(`${site}/site.yaml`)
	write('core/src/pages/[locale]/index.astro')
	write('core/src/lib/status/route.test.ts')
	write('site/src/pages/about.astro')
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

it('passes when no test file sits under either pages directory', async () => {
	const result = await run()
	expect(result.status, result.stderr).toBe(0)
	expect(result.stdout).toContain('check pages OK')
})

it('passes a site without pages of its own', async () => {
	const result = await run('--root', '../bare')
	expect(result.status, result.stderr).toBe(0)
})

it.each([
	'../core/src/pages/[locale]/index.test.ts',
	'../core/src/pages/status.spec.tsx',
	'../core/src/modules/courses/pages/[locale]/courses/index.test.ts',
	'src/pages/about.test.ts',
])('fails on %s and names the file', async (file) => {
	write(path.posix.join('site', file))
	const result = await run()
	expect(result.status).toBe(1)
	expect(result.stderr).toContain(`  - ${file}`)
})

it('reads the site pages from --root', async () => {
	write('other/src/pages/x.test.mjs')
	const result = await run('--root', '../other')
	expect(result.status).toBe(1)
	expect(result.stderr).toContain('  - ../other/src/pages/x.test.mjs')
	expect((await run()).status).toBe(0)
})
