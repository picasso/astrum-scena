import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildSiteConfig } from '../../config/fixtures/site-config.ts'
import { writeSiteConfig } from '../../config/fixtures/site-files.ts'
import { SITE_LOCK_PATH } from '../../config/lock.ts'
import { runAstrumScena } from '../test-fixtures.ts'

const STALE = `${SITE_LOCK_PATH} is stale; run astrum-scena config resolve`

let root: string
const lockOf = (site: string) => path.join(root, site, SITE_LOCK_PATH)
// the bin run in the site directory, as a site's package script runs it
const run = (...args: string[]) => runAstrumScena(path.join(root, 'site'), args)

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), 'config-lock-'))
	writeSiteConfig(path.join(root, 'site'), buildSiteConfig())
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('config resolve and its drift gate', () => {
	it('writes the lock byte-identically and passes the gate', async () => {
		const resolved = await run('config', 'resolve')
		expect(resolved.status, resolved.stderr).toBe(0)
		expect(resolved.stdout).toContain(`path: ${SITE_LOCK_PATH}`)
		const first = readFileSync(lockOf('site'), 'utf8')
		expect((await run('config', 'resolve')).status).toBe(0)
		expect(readFileSync(lockOf('site'), 'utf8')).toBe(first)
		const checked = await run('check', 'config-lock')
		expect(checked.status, checked.stderr).toBe(0)
		expect(checked.stdout).toContain(`path: ${SITE_LOCK_PATH}`)
	})

	it('fails when site.yaml changed after the lock was resolved, naming the command and the lock', async () => {
		expect((await run('config', 'resolve')).status).toBe(0)
		writeSiteConfig(path.join(root, 'site'), {
			...buildSiteConfig(),
			viewer: { counter: 'on' },
		})
		const result = await run('check', 'config-lock')
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`${STALE} (${SITE_LOCK_PATH})`)
	})

	it('fails when there is no lock', async () => {
		const result = await run('check', 'config-lock')
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`${STALE} (${SITE_LOCK_PATH})`)
	})

	it('fails on a hand edit of the lock, even one the loader would accept', async () => {
		expect((await run('config', 'resolve')).status).toBe(0)
		const lock = readFileSync(lockOf('site'), 'utf8')
		writeFileSync(lockOf('site'), lock.replace('counter: off', 'counter: on'))
		expect(readFileSync(lockOf('site'), 'utf8')).not.toBe(lock)
		expect((await run('check', 'config-lock')).stderr).toContain(STALE)
		writeFileSync(lockOf('site'), `${lock}\n`)
		expect((await run('check', 'config-lock')).stderr).toContain(STALE)
	})

	it('writes no lock for a site.yaml that fails resolve, naming the key', async () => {
		writeSiteConfig(path.join(root, 'site'), {
			...buildSiteConfig(),
			theme: { defualt: 'light' },
		})
		const resolved = await run('config', 'resolve')
		expect(resolved.status).toBe(1)
		expect(resolved.stderr).toContain('site.yaml: theme.defualt: unrecognized key')
		expect(existsSync(lockOf('site'))).toBe(false)
		const checked = await run('check', 'config-lock')
		expect(checked.status).toBe(1)
		expect(checked.stderr).toContain('site.yaml: theme.defualt: unrecognized key')
	})

	it('reads and writes the site given by --root, and names it in the hint', async () => {
		writeSiteConfig(path.join(root, 'other'), buildSiteConfig({ origin: 'https://other.test' }))
		const resolved = await run('config', 'resolve', '--root', '../other')
		expect(resolved.status, resolved.stderr).toBe(0)
		expect(resolved.stdout).toContain(`path: ../other/${SITE_LOCK_PATH}`)
		expect(readFileSync(lockOf('other'), 'utf8')).toContain('origin: https://other.test')
		expect((await run('check', 'config-lock', '--root', '../other')).status).toBe(0)
		expect((await run('check', 'config-lock')).status).toBe(1)
		writeSiteConfig(path.join(root, 'other'), buildSiteConfig())
		expect((await run('check', 'config-lock', '--root', '../other')).stderr).toContain(
			`${STALE} --root ../other (../other/${SITE_LOCK_PATH})`,
		)
	})
})
