import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, expect, it } from 'vitest'

import { buildSiteConfig } from '../../config/fixtures/site-config.ts'
import { writeSiteFiles } from '../../config/fixtures/site-files.ts'
import { LAYOUT_TOKENS_RELATIVE_PATH as TOKENS } from '../../lib/layout-tokens.ts'
import { runAstrumScena } from '../test-fixtures.ts'

let root: string

const writeLayout = (site: string, prose: number) =>
	writeSiteFiles(
		path.join(root, site),
		buildSiteConfig({ layout: { prose, medium: 960, standard: 1200, gallery: 1440 } }),
	)

const run = (...args: string[]) => runAstrumScena(path.join(root, 'site'), args)

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), 'layout-tokens-'))
	writeLayout('site', 680)
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

it('generates the tokens byte-identically and passes the drift gate', async () => {
	const generated = await run('layout-tokens')
	expect(generated.status, generated.stderr).toBe(0)
	const first = readFileSync(path.join(root, 'site', TOKENS), 'utf8')
	expect(first).toContain('--container-prose: 680px;')
	expect((await run('layout-tokens')).status).toBe(0)
	expect(readFileSync(path.join(root, 'site', TOKENS), 'utf8')).toBe(first)
	const checked = await run('check', 'layout-tokens')
	expect(checked.status, checked.stderr).toBe(0)
	expect(checked.stdout).toContain(`path: ${TOKENS}`)
})

it('fails with the regeneration hint when the site config changes without generation', async () => {
	expect((await run('layout-tokens')).status).toBe(0)
	writeLayout('site', 700)
	const result = await run('check', 'layout-tokens')
	expect(result.status).toBe(1)
	expect(result.stderr).toContain(`differ from the site.yaml projection (${TOKENS})`)
	expect(result.stderr).toContain('Regenerate: astrum-scena layout-tokens.')
})

it('fails with the regeneration hint when the tokens file is missing', async () => {
	const result = await run('check', 'layout-tokens')
	expect(result.status).toBe(1)
	expect(result.stderr).toContain(`tracked CSS tokens missing (${TOKENS})`)
	expect(result.stderr).toContain('Regenerate: astrum-scena layout-tokens.')
})

it('reads and writes the site given by --root', async () => {
	writeLayout('other', 720)
	expect((await run('layout-tokens', '--root', '../other')).status).toBe(0)
	expect(readFileSync(path.join(root, 'other', TOKENS), 'utf8')).toContain(
		'--container-prose: 720px;',
	)
	expect((await run('check', 'layout-tokens', '--root', '../other')).status).toBe(0)
	expect((await run('check', 'layout-tokens')).status).toBe(1)
	writeLayout('other', 740)
	expect((await run('check', 'layout-tokens', '--root', '../other')).stderr).toContain(
		'Regenerate: astrum-scena layout-tokens --root ../other.',
	)
})
