import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import {
	compareSnapshots,
	formatChange,
	parseSnapshot,
	readSnapshotDir,
	readSnapshotTexts,
	SNAPSHOT_DIR,
	snapshotDirArg,
	unannouncedBreaking,
	unnamedBreaking,
} from './lib/api-surface.ts'
import {
	removedEntries,
	sectionHeadings,
	UNRELEASED,
	UPGRADING_FILE,
	versionBumpErrors,
} from './lib/upgrading.ts'

// PR gate: compares the committed API snapshot with the one at the merge base with `--base <ref>`
// (`origin/main` by default). Every breaking change must be named in a `**Breaking:**` entry under
// `## [Unreleased]` of CHANGELOG.md (or of the section of the repository version this branch bumps to)
// and in an entry under `## [Unreleased]` of UPGRADING.md (or of the section of the version this branch
// bumps the core to); compatible changes are only listed. A surface
// the merge base has no snapshot of is new, not changed. A changed npm version of the core must follow
// the version policy against UPGRADING.md.

const CORE_PACKAGE = 'packages/core/package.json'
const REPO_PACKAGE = 'package.json'

function baseRef(argv: readonly string[] = process.argv.slice(2)): string {
	const index = argv.indexOf('--base')
	if (index === -1) return 'origin/main'
	const value = argv[index + 1]
	if (!value || value.startsWith('--')) throw new Error('--base needs a git ref')
	return value
}

const git = (...args: string[]): string =>
	execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

function showAt(commit: string, file: string): string | undefined {
	try {
		return git('show', `${commit}:${file}`)
	} catch {
		return undefined
	}
}

function readText(file: string): string | undefined {
	try {
		return readFileSync(file, 'utf8')
	} catch {
		return undefined
	}
}

const packageVersion = (packageJson: string | undefined): string | undefined =>
	packageJson === undefined
		? undefined
		: (JSON.parse(packageJson) as { version?: string }).version

function report(title: string, lines: readonly string[], hint: string): void {
	console.error(`check:api-breaking FAILED: ${title}:`)
	for (const line of lines) console.error(`  - ${line}`)
	console.error(hint)
	process.exitCode = 1
}

function main(): void {
	const ref = baseRef()
	const mergeBase = git('merge-base', 'HEAD', ref).trim()
	const before = parseSnapshot(
		readSnapshotTexts((file) => showAt(mergeBase, `${SNAPSHOT_DIR}/${file}`)),
	)
	const after = parseSnapshot(readSnapshotDir(snapshotDirArg()))
	const changes = compareSnapshots(before, after)
	const upgrading = readText(UPGRADING_FILE) ?? ''
	const baseUpgrading = showAt(mergeBase, UPGRADING_FILE) ?? ''
	const fromVersion = packageVersion(showAt(mergeBase, CORE_PACKAGE))
	const toVersion = packageVersion(readText(CORE_PACKAGE))
	// a release bump moves the [Unreleased] transitions into the section of its version
	const transitions = [
		...sectionHeadings(upgrading, UNRELEASED),
		...(toVersion !== undefined && toVersion !== fromVersion
			? sectionHeadings(upgrading, toVersion)
			: []),
	]

	console.log(`check:api-breaking against ${ref} (merge base ${mergeBase.slice(0, 12)})`)
	for (const change of changes) console.log(`  ${formatChange(change)}`)

	// a story release moves the [Unreleased] entries into the section of the repository version
	const fromRepoVersion = packageVersion(showAt(mergeBase, REPO_PACKAGE))
	const toRepoVersion = packageVersion(readText(REPO_PACKAGE))
	const changelogSections = [
		'Unreleased',
		...(toRepoVersion !== undefined && toRepoVersion !== fromRepoVersion
			? [toRepoVersion]
			: []),
	]
	const unannounced = unannouncedBreaking(
		changes,
		readFileSync('CHANGELOG.md', 'utf8'),
		changelogSections,
	)
	if (unannounced.length > 0)
		report(
			'breaking changes without a CHANGELOG entry',
			unannounced.map(formatChange),
			`Name each of them in a \`**Breaking:**\` entry under \`## [${changelogSections.at(-1)}]\` in CHANGELOG.md.`,
		)
	const untransitioned = unnamedBreaking(changes, transitions)
	if (untransitioned.length > 0)
		report(
			`breaking changes without an ${UPGRADING_FILE} entry`,
			untransitioned.map(formatChange),
			`Name each of them in a \`### <names>\` entry under \`## [${UNRELEASED}]\` in ${UPGRADING_FILE}.`,
		)
	const removed = removedEntries(baseUpgrading, upgrading)
	if (removed.length > 0)
		report(
			`${UPGRADING_FILE} entries of the merge base are gone`,
			removed,
			'Keep every transition; a release moves [Unreleased] entries into its section.',
		)
	const bump = versionBumpErrors(fromVersion, toVersion, upgrading, baseUpgrading)
	if (bump.length > 0)
		report(
			`the core version ${fromVersion} → ${toVersion}`,
			bump,
			'See the version policy in packages/core/README.md.',
		)
	if (!process.exitCode) console.log('check:api-breaking OK')
}

main()
