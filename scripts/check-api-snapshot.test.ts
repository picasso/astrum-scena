import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, expect, it } from 'vitest'

// each run builds the TypeScript program of the core's entry points
const TIMEOUT = 30_000

// the scripts read the core from the repository and write the snapshot into a scratch directory
const script = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url))

let dir: string
// a scratch repository root for the gate's source checks
let root: string

const runIn = (cwd: string | undefined, name: string, ...args: string[]) =>
	spawnSync(
		process.execPath,
		['--experimental-strip-types', script(name), ...args, '--snapshot-dir', dir],
		{ cwd, encoding: 'utf8' },
	)
const run = (name: string, ...args: string[]) => runIn(undefined, name, ...args)

const write = (relative: string, content: string) => {
	const file = path.join(root, relative)
	mkdirSync(path.dirname(file), { recursive: true })
	writeFileSync(file, content)
}

beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), 'api-snapshot-'))
	root = mkdtempSync(path.join(tmpdir(), 'api-snapshot-root-'))
	write('packages/core/src/lib/clean.ts', 'export const flag = 1\n')
})

afterEach(() => {
	rmSync(dir, { recursive: true, force: true })
	rmSync(root, { recursive: true, force: true })
})

it(
	'fails on a missing snapshot and passes once --update has written it',
	() => {
		const missing = run('check-api-snapshot.ts')
		expect(missing.status).toBe(1)
		expect(missing.stderr).toContain('i18n:')
		expect(missing.stderr).toContain('is missing. Update the snapshot: pnpm api:snapshot.')

		const updated = run('api-snapshot.ts', '--update')
		expect(updated.status, updated.stderr).toBe(0)
		const passed = run('check-api-snapshot.ts')
		expect(passed.status, passed.stderr).toBe(0)
		expect(passed.stdout).toContain('check:api-snapshot OK')
	},
	TIMEOUT,
)

it(
	'names the surface and the name of a difference, with its classification',
	() => {
		expect(run('api-snapshot.ts', '--update').status).toBe(0)
		const i18n = path.join(dir, 'i18n.json')
		const keys = JSON.parse(readFileSync(i18n, 'utf8')) as string[]
		// a key the snapshot has and the source lacks reads as removed from the source
		writeFileSync(i18n, `${JSON.stringify(['zz.removed', ...keys.slice(1)], null, '\t')}\n`)
		const result = run('check-api-snapshot.ts')
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('i18n: zz.removed — removed [breaking]')
		expect(result.stderr).toContain(`i18n: ${keys[0]} — added [compatible]`)
	},
	TIMEOUT,
)

it(
	'fails on an env name the core sources read without declaring it',
	() => {
		expect(run('api-snapshot.ts', '--update').status).toBe(0)
		write('packages/core/src/lib/probe.ts', 'export const flag = process.env.NEW_FLAG\n')
		const result = runIn(root, 'check-api-snapshot.ts')
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			'env NEW_FLAG is read at packages/core/src/lib/probe.ts:1 but not declared',
		)
	},
	TIMEOUT,
)
