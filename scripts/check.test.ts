import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CHECK_GROUPS, runGroups } from './check.ts'

const ALL_CHECKS = [
	'typecheck',
	'check:site',
	'test',
	'format:check',
	'lint:md',
	'check:identity',
	'check:local-paths',
	'lint',
	'check:code-comments',
	'check:taxonomy-readers',
	'check:api-snapshot',
	'check:upgrading',
	'check:notices',
]

describe('parallel checks', () => {
	it('runs every check exactly once, and the site gates and unit tests after typecheck', () => {
		expect([...CHECK_GROUPS.flat()].sort()).toEqual([...ALL_CHECKS].sort())
		expect(CHECK_GROUPS[0]).toEqual(['typecheck', 'check:site', 'test'])
	})
	it('names only scripts of the root package.json', () => {
		const { scripts } = JSON.parse(readFileSync('package.json', 'utf8')) as {
			scripts: Record<string, string>
		}
		for (const command of CHECK_GROUPS.flat())
			expect(scripts, command).toHaveProperty([command])
	})
	it('bounds active groups and continues independent checks after a failure', async () => {
		let active = 0
		let peak = 0
		const completed: string[] = []
		const passed = await runGroups(
			[['fail', 'unreachable'], ['b'], ['c']],
			async (command) => {
				active++
				peak = Math.max(peak, active)
				await new Promise((resolve) => setTimeout(resolve, 5))
				active--
				completed.push(command)
				if (command === 'fail') throw new Error('expected failure')
			},
			2,
		)
		expect(passed).toBe(false)
		expect(peak).toBe(2)
		expect(completed.sort()).toEqual(['b', 'c', 'fail'])
	})
	it('returns success only after every group finishes', async () => {
		expect(await runGroups([['a'], ['b']], async () => {})).toBe(true)
		await expect(runGroups([], async () => {}, 0)).rejects.toThrow('Invalid concurrency')
	})
})

function createPnpmFixture(body: string) {
	const root = mkdtempSync(path.join(tmpdir(), 'check-entrypoint-'))
	const calls = path.join(root, 'calls')
	writeFileSync(
		path.join(root, 'pnpm'),
		`#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const { spawn } = require('node:child_process')
${body}`,
		{ mode: 0o755 },
	)
	return {
		calls,
		env: { ...process.env, PATH: `${root}:${process.env.PATH}`, CHECK_CALLS: calls },
		remove: () => rmSync(root, { recursive: true, force: true }),
	}
}

function isLiveProcess(pid: number): boolean {
	try {
		if (process.platform === 'linux') {
			const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
			// container PID 1 may retain dead descendants; the state follows the final comm delimiter.
			return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z'
		}
		process.kill(pid, 0)
		return true
	} catch (error) {
		if (['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) return false
		throw error
	}
}

describe('check entrypoint', () => {
	it('invokes the actual commands and propagates a child failure as a nonzero exit', () => {
		const fixture = createPnpmFixture(`
appendFileSync(process.env.CHECK_CALLS, process.argv[2] + '\\n')
process.exit(process.argv[2] === 'typecheck' ? 7 : 0)
`)
		try {
			const result = spawnSync(
				process.execPath,
				['--experimental-strip-types', 'scripts/check.ts'],
				{ env: fixture.env, encoding: 'utf8', timeout: 10000 },
			)
			expect(result.status).toBe(1)
			const commands = readFileSync(fixture.calls, 'utf8').trim().split('\n')
			expect(commands).toContain('typecheck')
			expect(commands).not.toContain('check:site')
			expect(commands).not.toContain('test')
			expect(commands.sort()).toEqual(
				ALL_CHECKS.filter((command) => !['check:site', 'test'].includes(command)).sort(),
			)
		} finally {
			fixture.remove()
		}
	})
	it('waits for forced cleanup of a resistant descendant after its leader exits on SIGTERM', async () => {
		const fixture = createPnpmFixture(`
const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'pipe', 'ignore'] })
child.stdout.once('data', () => appendFileSync(process.env.CHECK_CALLS, child.pid + '\\n'))
setInterval(() => {}, 1000)
`)
		const runner = spawn(process.execPath, ['--experimental-strip-types', 'scripts/check.ts'], {
			env: fixture.env,
			stdio: 'ignore',
		})
		const closed = new Promise<number | null>((resolve) => runner.once('close', resolve))
		let descendants: number[] = []
		try {
			for (let attempt = 0; attempt < 100; attempt++) {
				if (existsSync(fixture.calls))
					descendants = readFileSync(fixture.calls, 'utf8')
						.trim()
						.split('\n')
						.filter(Boolean)
						.map(Number)
				if (descendants.length === 2) break
				await new Promise((resolve) => setTimeout(resolve, 25))
			}
			expect(descendants).toHaveLength(2)
			runner.kill('SIGTERM')
			expect(await closed).toBe(143)
			for (let attempt = 0; attempt < 40 && descendants.some(isLiveProcess); attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 25))
			}
			for (const pid of descendants) {
				expect(isLiveProcess(pid), `live descendant ${pid} survived`).toBe(false)
			}
		} finally {
			runner.kill('SIGKILL')
			for (const pid of descendants) {
				try {
					process.kill(pid, 'SIGKILL')
				} catch {}
			}
			fixture.remove()
		}
	}, 12000)
})
