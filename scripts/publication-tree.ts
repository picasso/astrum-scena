import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
	DENYLIST_ENV,
	MISSING_DENYLIST_HINT,
	parseDenylist,
	readDenylistText,
} from './lib/identity.ts'

// `pnpm check:publication-tree`: the check of the tree the public repository is created from. HEAD
// becomes the single commit of an orphan branch in a throwaway clone with no other refs, the way the
// public repository starts, and both the identity gate with the owner's list and gitleaks scan that
// clone. The working repository is only read and nothing is pushed; the report names paths and rules,
// never the matched text.

// pinned like the Playwright image of `test:e2e:docker`: the tag for the reader, the digest for the pull
export const GITLEAKS_IMAGE =
	'ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f'

const PUBLICATION_BRANCH = 'publication'
// the published tree's own gitleaks config: the default rules plus its narrow allowlist
export const GITLEAKS_CONFIG = '.gitleaks.toml'
// the clone's own gate, so uncommitted edits of the working checkout cannot decide the verdict
const CHECK_IDENTITY = join('scripts', 'check-identity.ts')

export type SecretFinding = { file: string; line: number; rule: string }

export type SecretScanner = {
	// why the scanner cannot run, undefined when it can
	unavailable: () => string | undefined
	scan: (clone: string) => { findings: SecretFinding[] } | { error: string }
}

export type Report = { out: (line: string) => void; err: (line: string) => void }

const git = (cwd: string, args: string[]): string => {
	const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
	if (result.status !== 0)
		throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`)
	return result.stdout.trim()
}

// the commit is made as nobody in particular, outside the user's hooks and signing setup
const COMMIT_CONFIG = [
	'-c',
	'user.name=publication-tree',
	'-c',
	'user.email=publication-tree@example.invalid',
	'-c',
	'commit.gpgsign=false',
	'-c',
	'core.hooksPath=/dev/null',
]

// the throwaway clone holds one orphan commit with HEAD's tree and no other ref, so a history scan
// sees exactly what the public repository's first commit will hold
export function buildOrphanClone(repo: string, clone: string): { commit: string; tree: string } {
	const head = git(repo, ['rev-parse', 'HEAD'])
	git(repo, ['clone', '--quiet', '--no-local', repo, clone])
	git(clone, ['checkout', '--quiet', '--orphan', PUBLICATION_BRANCH, head])
	git(clone, [...COMMIT_CONFIG, 'commit', '--quiet', '--no-verify', '-m', 'Publication tree'])
	git(clone, ['remote', 'remove', 'origin'])
	for (const ref of git(clone, ['for-each-ref', '--format=%(refname)']).split('\n'))
		if (ref !== '' && ref !== `refs/heads/${PUBLICATION_BRANCH}`)
			git(clone, ['update-ref', '-d', ref])
	const commit = git(clone, ['rev-parse', 'HEAD'])
	const reachable = git(clone, ['rev-list', '--all']).split('\n')
	if (reachable.length !== 1 || reachable[0] !== commit)
		throw new Error(`the clone reaches ${reachable.length} commits instead of the orphan one`)
	const tree = git(clone, ['rev-parse', 'HEAD^{tree}'])
	if (tree !== git(repo, ['rev-parse', 'HEAD^{tree}']))
		throw new Error('the orphan commit does not hold the tree of HEAD')
	return { commit, tree }
}

// gitleaks report entries, reduced to what may be printed: never `Secret` or `Match`
export function parseGitleaksReport(json: string): SecretFinding[] {
	const entries = JSON.parse(json) as { File?: string; StartLine?: number; RuleID?: string }[]
	return entries.map((entry) => ({
		file: entry.File ?? '<unknown file>',
		line: entry.StartLine ?? 0,
		rule: entry.RuleID ?? '<unknown rule>',
	}))
}

// exit code 2 marks leaks, so a failure of gitleaks itself (1) is not taken for a clean scan or a leak
export function gitleaksArgs(clone: string, reportDir: string): string[] {
	return [
		'run',
		'--rm',
		'-v',
		`${clone}:/repo:ro`,
		'-v',
		`${reportDir}:/report`,
		// the mounted clone belongs to another user inside the container
		'-e',
		'GIT_CONFIG_COUNT=1',
		'-e',
		'GIT_CONFIG_KEY_0=safe.directory',
		'-e',
		'GIT_CONFIG_VALUE_0=*',
		GITLEAKS_IMAGE,
		'detect',
		'--source',
		'/repo',
		'--config',
		`/repo/${GITLEAKS_CONFIG}`,
		'--no-banner',
		'--redact',
		'--exit-code',
		'2',
		'--report-format',
		'json',
		'--report-path',
		'/report/gitleaks.json',
	]
}

const DOCKER_HINT = `The secret scan runs gitleaks in Docker (${GITLEAKS_IMAGE}); install and start Docker, then retry.`

export const dockerGitleaks: SecretScanner = {
	unavailable: () => {
		const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
			encoding: 'utf8',
		})
		if (result.error) return `docker is not installed (${result.error.message}). ${DOCKER_HINT}`
		if (result.status !== 0)
			return `the Docker daemon is not reachable (${result.stderr.trim().split('\n').at(-1)}). ${DOCKER_HINT}`
		return undefined
	},
	scan: (clone) => {
		if (!existsSync(join(clone, GITLEAKS_CONFIG)))
			return { error: `the tree of HEAD has no ${GITLEAKS_CONFIG}` }
		const reportDir = mkdtempSync(join(tmpdir(), 'publication-tree-report-'))
		try {
			const result = spawnSync('docker', gitleaksArgs(clone, reportDir), { encoding: 'utf8' })
			if (result.status === 0) return { findings: [] }
			if (result.status === 2)
				return {
					findings: parseGitleaksReport(
						readFileSync(join(reportDir, 'gitleaks.json'), 'utf8'),
					),
				}
			const tail = (result.stderr || result.stdout || String(result.error ?? ''))
				.trim()
				.split('\n')
				.slice(-5)
				.join('\n')
			return { error: `gitleaks exited with ${result.status ?? result.signal}: ${tail}` }
		} finally {
			rmSync(reportDir, { recursive: true, force: true })
		}
	},
}

// the identity gate of the published tree, run with cwd in the clone, scans the files of its one commit
function runIdentityGate(clone: string, denylistText: string, report: Report): boolean {
	if (!existsSync(join(clone, CHECK_IDENTITY))) {
		report.err(`check:publication-tree FAILED — the tree of HEAD has no ${CHECK_IDENTITY}.`)
		return false
	}
	const result = spawnSync(process.execPath, ['--experimental-strip-types', CHECK_IDENTITY], {
		cwd: clone,
		env: { ...process.env, [DENYLIST_ENV]: denylistText },
		encoding: 'utf8',
	})
	for (const line of result.stdout.split('\n')) if (line !== '') report.out(line)
	for (const line of result.stderr.split('\n')) if (line !== '') report.err(line)
	return result.status === 0
}

export function checkPublicationTree({
	repo,
	denylistText,
	scanner,
	report,
}: {
	repo: string
	denylistText: string
	scanner: SecretScanner
	report: Report
}): number {
	if (parseDenylist(denylistText).entries.length === 0) {
		report.err('check:publication-tree FAILED — the owner denylist is missing or empty.')
		report.err(MISSING_DENYLIST_HINT)
		return 1
	}
	const unavailable = scanner.unavailable()
	if (unavailable) {
		report.err(`check:publication-tree FAILED — ${unavailable}`)
		return 1
	}
	if (git(repo, ['status', '--porcelain']) !== '')
		report.err(
			'check:publication-tree: the working tree has uncommitted changes; only the tree of HEAD is checked.',
		)
	const scratch = mkdtempSync(join(tmpdir(), 'publication-tree-'))
	try {
		const { commit, tree } = buildOrphanClone(repo, join(scratch, 'tree'))
		const identityClean = runIdentityGate(join(scratch, 'tree'), denylistText, report)
		const scan = scanner.scan(join(scratch, 'tree'))
		if ('error' in scan) report.err(`check:publication-tree FAILED — ${scan.error}`)
		else if (scan.findings.length > 0) {
			report.err('check:publication-tree FAILED — gitleaks found secrets:')
			for (const { file, line, rule } of scan.findings)
				report.err(`  - ${file}:${line}: gitleaks rule ${rule}`)
		}
		const secretsClean = !('error' in scan) && scan.findings.length === 0
		if (!identityClean || !secretsClean) {
			if (!identityClean)
				report.err('check:publication-tree FAILED — the identity gate failed.')
			return 1
		}
		report.out(
			`check:publication-tree OK — tree ${tree} (orphan commit ${commit.slice(0, 12)} of HEAD): identity gate and gitleaks clean`,
		)
		return 0
	} finally {
		rmSync(scratch, { recursive: true, force: true })
	}
}

async function main(): Promise<void> {
	process.exitCode = checkPublicationTree({
		repo: git(process.cwd(), ['rev-parse', '--show-toplevel']),
		denylistText: await readDenylistText(),
		scanner: dockerGitleaks,
		report: { out: (line) => console.log(line), err: (line) => console.error(line) },
	})
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
