import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { inCi } from './lib/identity.ts'
import {
	checkPublicationTree,
	dockerGitleaks,
	GITLEAKS_CONFIG,
	GITLEAKS_IMAGE,
	gitleaksArgs,
	parseGitleaksReport,
	type SecretFinding,
	type SecretScanner,
} from './publication-tree.ts'

// samples are assembled from parts, so this file does not trip the gate it tests
const OWNER = ['Acme', 'Owner'].join(' ')
const TOKEN = ['fake', 'token', 'for', 'tests'].join('-')
// a token shaped like a GitHub personal access token, built at run time so no source line holds one
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const GITHUB_TOKEN = `${'ghp'}_${Array.from({ length: 36 }, (_, i) => ALPHABET[(i * 7 + 3) % ALPHABET.length]).join('')}`

// the published tree carries its own gate, which the check runs from the clone
const GATE_FILES = ['check-identity.ts', 'lib/identity.ts', 'lib/local-paths.ts']
const gateFiles = (): Record<string, string> =>
	Object.fromEntries(
		GATE_FILES.map((file) => [
			`scripts/${file}`,
			readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'),
		]),
	)

const git = (cwd: string, ...args: string[]) =>
	spawnSync(
		'git',
		[
			'-c',
			'user.name=t',
			'-c',
			'user.email=t@example.invalid',
			'-c',
			'commit.gpgsign=false',
			...args,
		],
		{ cwd, encoding: 'utf8' },
	).stdout.trim()

// a stand-in for gitleaks: it records what the clone holds and flags the sample token in its files
function fakeScanner({ unavailable }: { unavailable?: string } = {}) {
	const seen: { commits: string[]; refs: string[] }[] = []
	const scanner: SecretScanner = {
		unavailable: () => unavailable,
		scan: (clone) => {
			seen.push({
				commits: git(clone, 'rev-list', '--all').split('\n'),
				refs: git(clone, 'for-each-ref', '--format=%(refname)').split('\n'),
			})
			const findings: SecretFinding[] = git(clone, 'grep', '-n', TOKEN, 'HEAD')
				.split('\n')
				.filter(Boolean)
				.map((hit) => {
					const [, file, line] = hit.split(':')
					return { file: file!, line: Number(line), rule: 'fake-token' }
				})
			return { findings }
		},
	}
	return { scanner, seen }
}

describe('check:publication-tree', () => {
	const root = mkdtempSync(join(tmpdir(), 'publication-tree-test-'))
	afterAll(() => rmSync(root, { recursive: true, force: true }))

	const write = (repo: string, files: Record<string, string>) => {
		for (const [file, content] of Object.entries(files)) {
			mkdirSync(dirname(join(repo, file)), { recursive: true })
			writeFileSync(join(repo, file), content)
		}
	}
	// the history and a side branch hold what HEAD no longer has: only HEAD's tree is published
	const repoWith = (files: Record<string, string>, { gate = true } = {}) => {
		const repo = mkdtempSync(join(root, 'repo-'))
		git(repo, 'init', '-q', '-b', 'main')
		write(repo, { 'old.txt': `by ${OWNER}\n${TOKEN}\n` })
		git(repo, 'add', '.')
		git(repo, 'commit', '-qm', 'old')
		git(repo, 'branch', 'side')
		git(repo, 'tag', 'v0')
		git(repo, 'rm', '-q', 'old.txt')
		write(repo, { ...(gate ? gateFiles() : {}), ...files })
		git(repo, 'add', '.')
		git(repo, 'commit', '-qm', 'head')
		return repo
	}
	const run = (
		repo: string,
		scanner: SecretScanner,
		denylistText = `first-entry\n${OWNER}\n`,
	) => {
		const out: string[] = []
		const err: string[] = []
		const status = checkPublicationTree({
			repo,
			denylistText,
			scanner,
			report: { out: (line) => out.push(line), err: (line) => err.push(line) },
		})
		return { status, out: out.join('\n'), err: err.join('\n') }
	}

	it('passes a clean HEAD, scanning one orphan commit, and prints its tree', () => {
		const repo = repoWith({ 'packages/core/index.ts': 'export const name = "core"\n' })
		const { scanner, seen } = fakeScanner()
		const result = run(repo, scanner)
		expect(result.err).toBe('')
		expect(result.status).toBe(0)
		expect(result.out).toContain('check:identity OK (2 denylist entries')
		expect(result.out).toContain(`tree ${git(repo, 'rev-parse', 'HEAD^{tree}')}`)
		expect(seen).toHaveLength(1)
		expect(seen[0]!.commits).toHaveLength(1)
		expect(seen[0]!.refs).toEqual(['refs/heads/publication'])
	})

	it('leaves the working repository as it was', () => {
		const repo = repoWith({ 'a.ts': 'x\n' })
		write(repo, { 'draft.md': 'not committed\n' })
		const before = [
			git(repo, 'for-each-ref'),
			git(repo, 'status', '--porcelain'),
			git(repo, 'rev-parse', 'HEAD'),
		]
		const result = run(repo, fakeScanner().scanner)
		expect(result.status).toBe(0)
		expect(result.err).toContain('uncommitted changes; only the tree of HEAD is checked')
		expect([
			git(repo, 'for-each-ref'),
			git(repo, 'status', '--porcelain'),
			git(repo, 'rev-parse', 'HEAD'),
		]).toEqual(before)
	})

	it('fails on an owner string with path and entry number, never the string', () => {
		const repo = repoWith({ 'docs/a.md': `# a\nby ${OWNER}\n` })
		const result = run(repo, fakeScanner().scanner)
		expect(result.status).toBe(1)
		expect(result.err).toContain('docs/a.md:2:4: denylist entry #2')
		expect(result.err).toContain('check:publication-tree FAILED — the identity gate failed.')
		expect(result.out + result.err).not.toMatch(/acme/i)
	})

	it('runs the gate of the published tree, not uncommitted edits of the working one', () => {
		const repo = repoWith({ 'docs/a.md': `by ${OWNER}\n` })
		write(repo, { 'scripts/check-identity.ts': 'process.exitCode = 0\n' })
		const result = run(repo, fakeScanner().scanner)
		expect(result.status).toBe(1)
		expect(result.err).toContain('docs/a.md:1:4: denylist entry #2')
	})

	it('fails when the tree of HEAD has no identity gate', () => {
		const result = run(repoWith({ 'a.ts': 'x\n' }, { gate: false }), fakeScanner().scanner)
		expect(result.status).toBe(1)
		expect(result.err).toContain('the tree of HEAD has no scripts/check-identity.ts')
	})

	it('fails on a secret with path and gitleaks rule', () => {
		const repo = repoWith({ 'scripts/a.ts': `// one\nconst key = '${TOKEN}'\n` })
		const result = run(repo, fakeScanner().scanner)
		expect(result.status).toBe(1)
		expect(result.err).toContain('scripts/a.ts:2: gitleaks rule fake-token')
		expect(result.err).not.toContain(TOKEN)
	})

	it('fails when the secret scan itself fails', () => {
		const scanner: SecretScanner = {
			unavailable: () => undefined,
			scan: () => ({ error: 'gitleaks exited with 1: boom' }),
		}
		const result = run(repoWith({ 'a.ts': 'x\n' }), scanner)
		expect(result.status).toBe(1)
		expect(result.err).toContain('gitleaks exited with 1: boom')
	})

	it('fails with a hint and scans nothing without the owner list', () => {
		for (const denylist of ['', '# comments only\n', '!@scope/\n']) {
			const { scanner, seen } = fakeScanner()
			const result = run(repoWith({ 'a.ts': 'x\n' }), scanner, denylist)
			expect(result.status).toBe(1)
			expect(result.err).toContain('owner denylist is missing or empty')
			expect(result.err).toContain('.identity-denylist')
			expect(seen).toHaveLength(0)
		}
	})

	it('fails with a hint and scans nothing without Docker', () => {
		const { scanner, seen } = fakeScanner({ unavailable: 'docker is not installed. Start it.' })
		const result = run(repoWith({ 'a.ts': 'x\n' }), scanner)
		expect(result.status).toBe(1)
		expect(result.err).toContain('docker is not installed. Start it.')
		expect(seen).toHaveLength(0)
	})
})

describe('gitleaks in Docker', () => {
	it('runs the pinned image on the read-only clone and reports leaks with exit code 2', () => {
		const args = gitleaksArgs('/scratch/tree', '/scratch/report')
		expect(GITLEAKS_IMAGE).toMatch(/^ghcr\.io\/gitleaks\/gitleaks:v[\d.]+@sha256:[0-9a-f]{64}$/)
		expect(args).toContain(GITLEAKS_IMAGE)
		expect(args).toContain('/scratch/tree:/repo:ro')
		expect(
			args.slice(args.indexOf(GITLEAKS_IMAGE) + 1, args.indexOf(GITLEAKS_IMAGE) + 4),
		).toEqual(['detect', '--source', '/repo'])
		expect(args).toContain('--redact')
		expect(args[args.indexOf('--exit-code') + 1]).toBe('2')
	})

	it('keeps only the path, line and rule of a finding', () => {
		const report = JSON.stringify([
			{
				File: 'a.ts',
				StartLine: 3,
				RuleID: 'generic-api-key',
				Secret: 'REDACTED',
				Match: 'x',
			},
		])
		expect(parseGitleaksReport(report)).toEqual([
			{ file: 'a.ts', line: 3, rule: 'generic-api-key' },
		])
		expect(parseGitleaksReport('[]')).toEqual([])
	})
})

// the real adapter against the pinned gitleaks: skipped locally without Docker, but CI has Docker, so
// there an unreachable daemon fails the test instead of hiding a broken adapter
const dockerUnavailable = dockerGitleaks.unavailable()

describe.skipIf(dockerUnavailable !== undefined && !inCi())('dockerGitleaks', () => {
	const root = mkdtempSync(join(tmpdir(), 'publication-tree-gitleaks-'))
	afterAll(() => rmSync(root, { recursive: true, force: true }))

	// every fixture carries the repository's own config, as the published tree does
	const config = readFileSync(new URL(`../${GITLEAKS_CONFIG}`, import.meta.url), 'utf8')
	const cloneWith = (files: Record<string, string>, { withConfig = true } = {}) => {
		const repo = mkdtempSync(join(root, 'clone-'))
		git(repo, 'init', '-q', '-b', 'main')
		const all = withConfig ? { [GITLEAKS_CONFIG]: config, ...files } : files
		for (const [file, content] of Object.entries(all)) {
			mkdirSync(dirname(join(repo, file)), { recursive: true })
			writeFileSync(join(repo, file), content)
		}
		git(repo, 'add', '.')
		git(repo, 'commit', '-qm', 'tree')
		return repo
	}

	it('reports the path and rule of a token gitleaks detects', { timeout: 300_000 }, () => {
		expect(dockerUnavailable).toBeUndefined()
		const scan = dockerGitleaks.scan(
			cloneWith({ 'src/config.ts': `// config\nexport const auth = '${GITHUB_TOKEN}'\n` }),
		)
		expect(scan).toEqual({
			findings: [{ file: 'src/config.ts', line: 2, rule: expect.stringMatching(/github/) }],
		})
	})

	it('reports no findings for a clean tree', { timeout: 300_000 }, () => {
		expect(dockerUnavailable).toBeUndefined()
		expect(dockerGitleaks.scan(cloneWith({ 'src/a.ts': 'export const a = 1\n' }))).toEqual({
			findings: [],
		})
	})

	it('allows hash lines only in the BMAD files manifest', { timeout: 300_000 }, () => {
		expect(dockerUnavailable).toBeUndefined()
		const hash = createHash('sha256').update('sample').digest('hex')
		const manifest = `type,name,module,path,hash\n"md","api-key-guide","tea","tea/api-key-guide.md","${hash}"\n`
		expect(
			dockerGitleaks.scan(cloneWith({ '_bmad/_config/files-manifest.csv': manifest })),
		).toEqual({ findings: [] })
		expect(dockerGitleaks.scan(cloneWith({ 'docs/files-manifest.csv': manifest }))).toEqual({
			findings: [{ file: 'docs/files-manifest.csv', line: 2, rule: 'generic-api-key' }],
		})
	})

	it('fails without the config in the tree', () => {
		expect(dockerGitleaks.scan(cloneWith({ 'a.ts': 'x\n' }, { withConfig: false }))).toEqual({
			error: 'the tree of HEAD has no .gitleaks.toml',
		})
	})
})
