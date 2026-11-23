import { randomUUID } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'

import {
	computeConfigDigest,
	type ImageConfig,
	loadImageConfig,
} from '../../lib/images/build/config.ts'
import { serializeManifest } from '../../lib/images/manifest.ts'
import {
	buildReleaseDescriptor,
	loadManifestFile,
	loadReleaseDescriptor,
	parseReleaseDescriptor,
	RELEASE_DESCRIPTOR_RELATIVE_PATH,
	releaseDescriptorPath,
	releaseDirPath,
	releaseManifestPath,
	serializeReleaseDescriptor,
} from '../../lib/images/release.ts'
import { imagesCacheDir } from './cache-path.ts'
import { checkRelease as defaultCheckRelease, type CheckResult } from './check-derivatives.ts'
import { withLock } from './locking.ts'
import { validateCandidateRelease } from './validate-candidate.ts'

// journaled activation: switches the single tracked source of truth, the release descriptor, to a
// checked cache release with `active: true` under the owner-token lock. The switch is one atomic
// rename over a temp file, so any interruption leaves either the whole old or the whole new
// descriptor. The ignored journal `.cache/images/.activate-<token>/` keeps the descriptor's backup
// and the staged version for `recoverActivation`. It writes only the descriptor: copying files to
// the site or the bucket, committing and deploying are not its part

export const JOURNAL_PREFIX = '.activate-'

type Phase = 'staged' | 'committed'

type Journal = { token: string; releaseId: string; phase: Phase }

export type ActivateHooks = {
	afterStaged?: () => Promise<void>
	afterCommit?: () => Promise<void>
}

export type ReleaseChecker = (options: {
	releaseDir: string
	config: ImageConfig
	root: string
}) => Promise<CheckResult>

export type ActivateOptions = {
	hooks?: ActivateHooks
	checkRelease?: ReleaseChecker
}

// rename over an existing file is atomic on POSIX. The directory is not fsynced here: after a power
// loss the journal and `--recover` restore the state
async function atomicReplaceFile(target: string, bytes: string): Promise<void> {
	const tmp = `${target}.activate-tmp`
	const handle = await open(tmp, 'w')
	try {
		await handle.writeFile(bytes, 'utf8')
		await handle.sync()
	} finally {
		await handle.close()
	}
	await rename(tmp, target)
}

async function writeJournal(journalDir: string, journal: Journal): Promise<void> {
	await atomicReplaceFile(path.join(journalDir, 'journal.json'), JSON.stringify(journal))
}

// the journal must survive a power loss: a durable descriptor with a lost backup would leave a mixed
// state
async function writeDurable(filePath: string, bytes: string): Promise<void> {
	const handle = await open(filePath, 'w')
	try {
		await handle.writeFile(bytes, 'utf8')
		await handle.sync()
	} finally {
		await handle.close()
	}
}

// strict mode is the durability barrier before the journal is removed, so a real IO error is
// rethrown and only "unsupported on this platform" codes pass; non-strict mode is best effort
async function fsyncDir(dir: string, strict = false): Promise<void> {
	try {
		const handle = await open(dir, 'r')
		try {
			await handle.sync()
		} finally {
			await handle.close()
		}
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code
		const unsupported =
			code === 'EINVAL' || code === 'ENOTSUP' || code === 'EISDIR' || code === 'EPERM'
		if (strict && !unsupported) throw error
	}
}

// normally at most one, since activate refuses to start while a journal exists
export async function listActivationJournals(root: string): Promise<string[]> {
	let entries: string[]
	try {
		entries = await readdir(imagesCacheDir(root))
	} catch {
		return []
	}
	return entries
		.filter((name) => name.startsWith(JOURNAL_PREFIX))
		.sort()
		.map((name) => path.join(imagesCacheDir(root), name))
}

export type ActivateResult = { token: string }

// every check (pending journal, candidate, digest, integrity, descriptor schema) runs before the
// only write to the tracked descriptor
export async function activateRelease(
	root: string,
	releaseId: string,
	options: ActivateOptions = {},
): Promise<ActivateResult> {
	const hooks = options.hooks ?? {}
	const checkRelease = options.checkRelease ?? defaultCheckRelease
	return withLock(imagesCacheDir(root), async () => {
		const config = loadImageConfig(root)

		// journals left to pile up would make recovery nondeterministic
		if ((await listActivationJournals(root)).length > 0)
			throw new Error('unrecovered activation journal exists; recover it first')

		const releaseDir = releaseDirPath(root, releaseId)
		const { manifest: releaseManifest, raw: releaseRaw } = loadManifestFile(
			releaseManifestPath(releaseDir),
		)
		validateCandidateRelease(releaseManifest)
		if (serializeManifest(releaseManifest) !== releaseRaw)
			throw new Error('cache release manifest is not canonically serialized')
		if (releaseManifest.configDigest !== computeConfigDigest(config))
			throw new Error('cache release manifest configDigest does not match current config')

		// missing, corrupted or privacy-leaking derivatives block activation
		const integrity = await checkRelease({ releaseDir, config, root })
		if (!integrity.ok) {
			throw new Error(
				`cache release failed integrity check (${integrity.errors.length} problem(s)): ` +
					integrity.errors.slice(0, 5).join('; '),
			)
		}

		// the current bytes serve only as the journal's backup. buildReleaseDescriptor rejects an
		// active descriptor with an empty manifest before anything is replaced
		let currentRaw: string
		try {
			currentRaw = loadReleaseDescriptor(root).raw
		} catch (error) {
			throw new Error(
				`cannot load current image descriptor at ${RELEASE_DESCRIPTOR_RELATIVE_PATH} — ${(error as Error).message}`,
				{ cause: error },
			)
		}
		const stagedBytes = serializeReleaseDescriptor(
			buildReleaseDescriptor({ active: true, manifest: releaseManifest }),
		)

		const token = randomUUID()
		const journalDir = path.join(imagesCacheDir(root), `${JOURNAL_PREFIX}${token}`)
		await mkdir(journalDir, { recursive: true })

		// the backup and staged copies must survive a power loss, so recovery can go either way
		await writeDurable(path.join(journalDir, 'descriptor.bak'), currentRaw)
		await writeDurable(path.join(journalDir, 'descriptor.new'), stagedBytes)
		await writeJournal(journalDir, { token, releaseId, phase: 'staged' })
		await fsyncDir(journalDir, true)
		await fsyncDir(imagesCacheDir(root), true)

		if (hooks.afterStaged) await hooks.afterStaged()

		// the phase is written after the rename, so 'committed' means the descriptor is replaced
		await atomicReplaceFile(releaseDescriptorPath(root), stagedBytes)
		await writeJournal(journalDir, { token, releaseId, phase: 'committed' })

		if (hooks.afterCommit) await hooks.afterCommit()

		// the journal goes only after the replacement is durable; otherwise a power loss could keep
		// the removal but lose the rename, leaving a mixed state with no journal
		await fsyncDir(path.dirname(releaseDescriptorPath(root)), true)
		await rm(journalDir, { recursive: true, force: true })
		await fsyncDir(imagesCacheDir(root))
		return { token }
	})
}

export type RecoverAction = 'none' | 'roll-forward' | 'roll-back'

async function readOptional(filePath: string): Promise<string | null> {
	try {
		return await readFile(filePath, 'utf8')
	} catch {
		return null
	}
}

// parses and round-trips byte for byte, so recovery never overwrites an intact descriptor with a
// broken backup
function isCanonicalDescriptorRaw(raw: string | null): raw is string {
	if (raw === null) return false
	try {
		return serializeReleaseDescriptor(parseReleaseDescriptor(JSON.parse(raw))) === raw
	} catch {
		return false
	}
}

// decides by the actual tracked descriptor, not the recorded phase, which a damaged journal can get
// wrong. The single atomic rename keeps the descriptor either wholly old or wholly new
export async function recoverActivation(root: string): Promise<{ action: RecoverAction }> {
	return withLock(imagesCacheDir(root), async () => {
		const journals = await listActivationJournals(root)
		if (journals.length === 0) return { action: 'none' as const }
		if (journals.length > 1) {
			throw new Error(
				`multiple activation journals found (${journals.length}); manual intervention required`,
			)
		}
		const journalDir = journals[0]!
		const descriptorNew = await readOptional(path.join(journalDir, 'descriptor.new'))
		const descriptorBak = await readOptional(path.join(journalDir, 'descriptor.bak'))
		const tracked = await readOptional(releaseDescriptorPath(root))

		let action: RecoverAction
		if (descriptorNew === null || descriptorBak === null) {
			// an incomplete journal means a crash before the rename, so the tracked descriptor was
			// never replaced. A backup cut short by the crash must not overwrite it: restore only
			// when the tracked file is missing or non-canonical and the backup is canonical
			if (!isCanonicalDescriptorRaw(tracked) && isCanonicalDescriptorRaw(descriptorBak))
				await atomicReplaceFile(releaseDescriptorPath(root), descriptorBak)
			action = 'roll-back'
		} else if (tracked === descriptorNew) {
			action = 'roll-forward'
		} else if (tracked === descriptorBak) {
			action = 'roll-back'
		} else {
			throw new Error(
				'tracked descriptor matches neither backup nor staged — manual intervention required',
			)
		}

		// the same order as activate: the journal goes only after the replacement is durable
		await fsyncDir(path.dirname(releaseDescriptorPath(root)), true)
		await rm(journalDir, { recursive: true, force: true })
		await fsyncDir(imagesCacheDir(root))
		return { action }
	})
}
