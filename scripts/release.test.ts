import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import {
	isNpmRecentEnough,
	type Npm,
	type NpmResult,
	parseArgs,
	publishablePackages,
	release,
	tarballName,
} from './release.ts'

type FakeNpm = Npm & { calls: string[][] }

const ok = (stdout = ''): NpmResult => ({ status: 0, stdout, stderr: '' })
const notFound: NpmResult = { status: 1, stdout: '', stderr: 'npm error code E404\nnpm error 404' }

// npm 11.6.2 by default; `view` answers per spec, `publish` succeeds unless told otherwise
function fakeNpm({
	version = '11.6.2',
	view = () => notFound,
	publish = () => ok('+ published'),
}: {
	version?: string
	view?: (spec: string) => NpmResult
	publish?: (args: readonly string[]) => NpmResult
} = {}): FakeNpm {
	const calls: string[][] = []
	const npm = ((args: readonly string[]) => {
		calls.push([...args])
		if (args[0] === '--version') return ok(`${version}\n`)
		if (args[0] === 'view') return view(args[1]!)
		if (args[0] === 'publish') return publish(args)
		throw new Error(`unexpected npm ${args.join(' ')}`)
	}) as FakeNpm
	npm.calls = calls
	return npm
}

const publishCalls = (npm: FakeNpm) => npm.calls.filter((args) => args[0] === 'publish')

let root: string
let packDir: string
let lines: string[]

function writePackage(dir: string, manifest: Record<string, unknown> | null) {
	mkdirSync(join(root, 'packages', dir), { recursive: true })
	if (manifest)
		writeFileSync(join(root, 'packages', dir, 'package.json'), JSON.stringify(manifest))
}

function pack(name: string, version: string) {
	writeFileSync(join(packDir, tarballName({ name, version })), '')
}

const run = (npm: Npm, dryRun = true) =>
	release({ dryRun, packDir, root, npm, log: (line) => lines.push(line) })

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'release-'))
	packDir = join(root, '.cache', 'release')
	mkdirSync(packDir, { recursive: true })
	lines = []
	writePackage('core', { name: '@scope/core', version: '1.2.3' })
	writePackage('placeholder', null)
	writePackage('tool', { name: 'private-tool', version: '9.9.9', private: true })
	pack('@scope/core', '1.2.3')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('publishablePackages', () => {
	it('takes packages/* with a manifest that is not private', () => {
		expect(publishablePackages(root)).toEqual([{ name: '@scope/core', version: '1.2.3' }])
	})
})

describe('release', () => {
	it('publishes a new version from its tarball, with --dry-run when asked', () => {
		const npm = fakeNpm()
		run(npm)
		expect(npm.calls).toContainEqual(['view', '@scope/core@1.2.3', 'version'])
		expect(publishCalls(npm)).toEqual([
			['publish', join(packDir, 'scope-core-1.2.3.tgz'), '--dry-run'],
		])
		expect(lines).toEqual(['publish @scope/core@1.2.3 (dry-run)', '+ published'])
	})

	it('publishes without --dry-run, --provenance or --access when not a dry run', () => {
		const npm = fakeNpm()
		run(npm, false)
		expect(publishCalls(npm)).toEqual([['publish', join(packDir, 'scope-core-1.2.3.tgz')]])
		expect(lines[0]).toBe('publish @scope/core@1.2.3')
	})

	it('fails when npm publish exits non-zero', () => {
		const npm = fakeNpm({ publish: () => ({ status: 1, stdout: '', stderr: 'E403' }) })
		expect(() => run(npm)).toThrow('npm publish @scope/core@1.2.3 failed (exit 1)')
	})

	it('skips a version npm already has and succeeds', () => {
		const npm = fakeNpm({ view: () => ok('1.2.3\n') })
		run(npm, false)
		expect(publishCalls(npm)).toEqual([])
		expect(lines).toEqual(['skip @scope/core@1.2.3: already published'])
	})

	it('publishes nothing when npm view fails without E404', () => {
		const npm = fakeNpm({
			view: () => ({ status: 1, stdout: '', stderr: 'npm error code ETIMEDOUT' }),
		})
		expect(() => run(npm)).toThrow(/npm view @scope\/core@1\.2\.3 failed:[\s\S]*ETIMEDOUT/)
		expect(publishCalls(npm)).toEqual([])
	})

	it('treats an empty npm view answer with exit 0 as a registry failure', () => {
		const npm = fakeNpm({ view: () => ok('') })
		expect(() => run(npm)).toThrow('npm view @scope/core@1.2.3 failed')
		expect(publishCalls(npm)).toEqual([])
	})

	it('publishes nothing when publishable packages differ in version', () => {
		writePackage('migrate', { name: '@scope/migrate', version: '1.3.0' })
		pack('@scope/migrate', '1.3.0')
		const npm = fakeNpm()
		expect(() => run(npm)).toThrow(
			'publishable packages must share one version: @scope/core@1.2.3, @scope/migrate@1.3.0',
		)
		expect(npm.calls).toEqual([])
	})

	it('publishes nothing when a package has no tarball', () => {
		writePackage('migrate', { name: '@scope/migrate', version: '1.2.3' })
		const npm = fakeNpm()
		expect(() => run(npm)).toThrow('no tarball for @scope/migrate@1.2.3')
		expect(publishCalls(npm)).toEqual([])
	})

	it('checks every package before publishing the first', () => {
		writePackage('migrate', { name: '@scope/migrate', version: '1.2.3' })
		pack('@scope/migrate', '1.2.3')
		const npm = fakeNpm({
			view: (spec) =>
				spec.startsWith('@scope/migrate')
					? { status: 1, stdout: '', stderr: 'npm error code E500' }
					: notFound,
		})
		expect(() => run(npm)).toThrow('npm view @scope/migrate@1.2.3 failed')
		expect(publishCalls(npm)).toEqual([])
	})

	it('after a partial release publishes only the package npm lacks', () => {
		writePackage('migrate', { name: '@scope/migrate', version: '1.2.3' })
		pack('@scope/migrate', '1.2.3')
		const npm = fakeNpm({
			view: (spec) => (spec === '@scope/core@1.2.3' ? ok('1.2.3\n') : notFound),
		})
		run(npm, false)
		expect(publishCalls(npm)).toEqual([['publish', join(packDir, 'scope-migrate-1.2.3.tgz')]])
		expect(lines[0]).toBe('skip @scope/core@1.2.3: already published')
	})

	it('treats E404 outside the npm error code line as a registry failure', () => {
		const npm = fakeNpm({
			view: () => ({ status: 1, stdout: '', stderr: 'npm error proxy said E404 somewhere' }),
		})
		expect(() => run(npm)).toThrow('npm view @scope/core@1.2.3 failed')
	})

	it('publishes nothing with an npm older than 11.5.1', () => {
		const npm = fakeNpm({ version: '11.5.0' })
		expect(() => run(npm)).toThrow('npm 11.5.0 cannot publish through trusted publishing')
		expect(npm.calls).toEqual([['--version']])
	})
})

describe('release.ts CLI', () => {
	it('exits 1 with the diagnostic when an argument is missing', () => {
		const result = spawnSync(
			process.execPath,
			['--experimental-strip-types', 'scripts/release.ts', '--dry-run'],
			{ encoding: 'utf8' },
		)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('--pack-dir <dir> is required')
	})
})

describe('isNpmRecentEnough', () => {
	it.each([
		['11.5.1', true],
		['11.6.2', true],
		['12.0.0', true],
		['11.5.0', false],
		['10.9.9', false],
		['garbage', false],
	])('%s → %s', (version, expected) => {
		expect(isNpmRecentEnough(version)).toBe(expected)
	})
})

describe('parseArgs', () => {
	it('reads --dry-run and --pack-dir', () => {
		expect(parseArgs(['--dry-run', '--pack-dir', '/tmp/pack'])).toEqual({
			dryRun: true,
			packDir: '/tmp/pack',
		})
	})

	it('requires --pack-dir and rejects unknown arguments', () => {
		expect(() => parseArgs(['--dry-run'])).toThrow('--pack-dir <dir> is required')
		expect(() => parseArgs(['--pack-dir'])).toThrow('--pack-dir needs a directory')
		expect(() => parseArgs(['--provenance', '--pack-dir', 'x'])).toThrow(
			'unknown argument: --provenance',
		)
	})
})

type Step = { name?: string; if?: string; run?: string; env?: Record<string, unknown> }
type Job = { permissions?: Record<string, string>; steps?: Step[] }
type Workflow = { permissions?: Record<string, string>; jobs: Record<string, Job> }

const WORKFLOWS = '.github/workflows'
const readWorkflow = (file: string): Workflow =>
	parseYaml(readFileSync(join(WORKFLOWS, file), 'utf8')) as Workflow
const workflowFiles = readdirSync(WORKFLOWS).filter((file) => /\.ya?ml$/.test(file))
const PUBLISHING = /\bscripts\/release\.ts\b|\bpnpm (?:run )?release\b|\bnpm publish\b/
const DRY_RUN = /(?:^|\s)--dry-run(?:\s|$)/

// each shell command of a `run` on its own: continuations joined, comments dropped, lists split
const publishCommands = (run: string): string[] =>
	run
		.replace(/\\\n/g, ' ')
		.split('\n')
		.map((line) => line.replace(/(?:^|\s)#.*$/, ''))
		.flatMap((line) => line.split(/&&|\|\||;/))
		.map((command) => command.trim())
		.filter((command) => PUBLISHING.test(command))

const isDryRun = (command: string): boolean => DRY_RUN.test(command) && !command.includes('${{')

const publishSteps = (workflow: Workflow): Step[] =>
	Object.values(workflow.jobs)
		.flatMap((job) => job.steps ?? [])
		.filter((step) => publishCommands(step.run ?? '').length > 0)

const allDryRun = (step: Step): boolean => publishCommands(step.run ?? '').every(isDryRun)

describe('publish command guard', () => {
	it.each([
		['a flag only in a comment', 'pnpm release --pack-dir x # --dry-run'],
		[
			'a live line after a dry-run line',
			'pnpm release --dry-run --pack-dir x\nnpm publish x.tgz',
		],
		[
			'a live command chained after a dry run',
			'pnpm release --dry-run --pack-dir x && npm publish x.tgz',
		],
		['a flag from an expression', "pnpm release ${{ 'x' && '--dry-run' }} --pack-dir x"],
	])('rejects %s', (_, run) => {
		expect(allDryRun({ run })).toBe(false)
	})

	it('accepts a dry run continued over lines', () => {
		expect(allDryRun({ run: 'pnpm release \\\n  --dry-run --pack-dir x' })).toBe(true)
	})
})

describe('release.yml', () => {
	const workflow = readWorkflow('release.yml')

	it('grants id-token: write only to the release job of release.yml', () => {
		for (const file of workflowFiles) {
			const current = readWorkflow(file)
			expect(current.permissions, file).toEqual({ contents: 'read' })
			for (const [name, job] of Object.entries(current.jobs)) {
				const isRelease = file === 'release.yml' && name === 'release'
				if (isRelease)
					expect(job.permissions).toEqual({ contents: 'read', 'id-token': 'write' })
				else expect(job.permissions?.['id-token'], `${file}: ${name}`).toBeUndefined()
			}
		}
	})

	it('uses no npm token', () => {
		const text = readFileSync(join(WORKFLOWS, 'release.yml'), 'utf8')
		expect(text).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|_authToken|secrets\./)
	})

	it('runs the publish with --dry-run whenever the ref is not main', () => {
		const steps = publishSteps(workflow).filter(
			(step) => step.if !== "github.ref == 'refs/heads/main'",
		)
		expect(steps).toHaveLength(1)
		expect(steps[0]!.if).toBe("github.ref != 'refs/heads/main'")
		expect(allDryRun(steps[0]!), steps[0]!.name).toBe(true)
	})

	it('publishes from main without --dry-run, and no other workflow publishes', () => {
		const steps = publishSteps(workflow).filter(
			(step) => step.if === "github.ref == 'refs/heads/main'",
		)
		expect(steps).toHaveLength(1)
		const commands = publishCommands(steps[0]!.run ?? '')
		expect(commands, steps[0]!.name).toHaveLength(1)
		expect(DRY_RUN.test(commands[0]!), steps[0]!.name).toBe(false)
		for (const file of workflowFiles.filter((name) => name !== 'release.yml'))
			expect(publishSteps(readWorkflow(file)), file).toEqual([])
	})
})
