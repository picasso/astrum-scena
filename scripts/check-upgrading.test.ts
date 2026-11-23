import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./check-upgrading.ts', import.meta.url))

let root: string

const write = (file: string, content: string) => {
	mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
	writeFileSync(path.join(root, file), content)
}

const run = () =>
	spawnSync(process.execPath, ['--experimental-strip-types', script], {
		cwd: root,
		encoding: 'utf8',
	})

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), 'upgrading-'))
	write('packages/core/package.json', '{ "version": "0.4.0" }\n')
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

it('passes the repository UPGRADING.md', () => {
	const result = spawnSync(process.execPath, ['--experimental-strip-types', script], {
		encoding: 'utf8',
	})
	expect(result.status, result.stderr).toBe(0)
})

it('passes complete entries and fails one without a part, with its number and the part', () => {
	const entry = (name: string, verify: boolean) =>
		[
			`### \`${name}\``,
			'',
			'**Before:** `a: 1`',
			'',
			'**After:** `a: 2`',
			'',
			'**Order:** first.',
			'',
			'**Writers:** none.',
			'',
			...(verify ? ['**Verify:** `pnpm build` passes.', ''] : []),
		].join('\n')
	const file = (verify: boolean) =>
		['# Upgrading', '', '## [Unreleased]', '', '## [0.4.0] - 2026-11-06', '']
			.concat(entry('nav.home', true), entry('nav.portfolio', verify))
			.join('\n')

	write('UPGRADING.md', file(true))
	const passed = run()
	expect(passed.status, passed.stderr).toBe(0)

	write('UPGRADING.md', file(false))
	const failed = run()
	expect(failed.status).toBe(1)
	expect(failed.stderr).toContain('entry 2 "`nav.portfolio`"')
	expect(failed.stderr).toContain('lacks **Verify:**')
})

it('fails without UPGRADING.md', () => {
	const result = run()
	expect(result.status).toBe(1)
	expect(result.stderr).toContain('check:upgrading FAILED: UPGRADING.md')
})
