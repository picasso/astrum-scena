import { createHash } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import sharp, { type Metadata } from 'sharp'

import { sourceIdentitySchema } from '../../lib/content/schemas.ts'
import type { ImageConfig } from '../../lib/images/build/config.ts'
import { planLadderWidths } from '../../lib/images/build/ladder.ts'
import { isLegacyRegistryRow, type LegacyRegistryRow, type RegistryRow } from './masters.ts'

// the master of a photo and its preflight: the registry row, the one file under the masters root,
// its sha256, its format and size, and the year of its archive copies. It writes nothing and names
// files by basename only, never by absolute path

const SUPPORTED_SOURCE_FORMATS = new Set(['jpeg', 'png', 'webp', 'tiff', 'avif', 'gif', 'heif'])

const YEAR_SEGMENT_PATTERN = /^\d{4}$/

export type SourceResolveErrorCode =
	| 'registry-miss'
	| 'not-resolvable'
	| 'missing-master'
	| 'ambiguous-master'
	| 'path-escape'
	| 'hash-drift'
	| 'unsupported-format'
	| 'undecodable'
	| 'archive-missing-year'
	| 'archive-year-conflict'

export type SourceResolveError = Error & { code: SourceResolveErrorCode }

const SOURCE_ERROR_CODES = new Set<string>([
	'registry-miss',
	'not-resolvable',
	'missing-master',
	'ambiguous-master',
	'path-escape',
	'hash-drift',
	'unsupported-format',
	'undecodable',
	'archive-missing-year',
	'archive-year-conflict',
])

export const sourceResolveError = (
	code: SourceResolveErrorCode,
	message: string,
): SourceResolveError => Object.assign(new Error(message), { code })

export const isSourceResolveError = (error: unknown): error is SourceResolveError =>
	error instanceof Error && SOURCE_ERROR_CODES.has(String((error as { code?: unknown }).code))

// a resolver error reads `[code] message`
export const describeError = (error: unknown): string =>
	isSourceResolveError(error)
		? `[${error.code}] ${error.message}`
		: error instanceof Error
			? error.message
			: String(error)

// a migrated photo is addressed by `legacyId`, a new one by the sha256 of its bytes
export type MasterRequest =
	{ photoId: string; legacyId: string } | { photoId: string; sha256: string }

// the request from a photo's flat identity: `legacyId` for a migrated photo, `sha256` with `master`
// for a new one. A mixed or unpaired identity is rejected, not silently prioritized, since the
// commands read the YAML directly, past the content collection's validation
export function masterRequestFromSource(photoId: string, source: unknown): MasterRequest {
	const parsed = sourceIdentitySchema.safeParse(source)
	if (!parsed.success) {
		throw sourceResolveError(
			'not-resolvable',
			`content photo "${photoId}" has an invalid source (expected {legacyId} or {sha256, master})`,
		)
	}
	if (parsed.data.legacyId !== undefined) return { photoId, legacyId: parsed.data.legacyId }
	if (parsed.data.sha256 !== undefined && parsed.data.master !== undefined)
		return { photoId, sha256: parsed.data.sha256 }
	throw sourceResolveError(
		'not-resolvable',
		`content photo "${photoId}" has no pixel-master identity (expected {legacyId} or {sha256, master})`,
	)
}

export type ResolvedMaster = {
	photoId: string
	// only for a migrated master; a new master is identified by masterSha256
	legacyId?: string
	masterFilename: string
	masterPath: string
	masterSha256: string
	// after auto-orient (EXIF orientation 5–8 swaps width and height), so planning and the manifest
	// see the displayed size and a rotated source cannot be upscaled
	sourceWidth: number
	sourceHeight: number
	orientation: number
	year: string
	yearEvidence: 'archive-folder'
	warnings: string[]
	ladderWidths: number[]
}

export type ResolveMasterOptions = {
	// the found master must stay inside it after realpath
	mastersRoot: string
	// the year-organized archive that gives the folder year
	archiveRoot: string
	registry: readonly RegistryRow[]
	config: ImageConfig
}

// symlinks are yielded as files, not followed, so the realpath guard can reject them
async function* walkFiles(dir: string): AsyncGenerator<string> {
	let entries: Dirent[]
	try {
		entries = await readdir(dir, { withFileTypes: true })
	} catch {
		return
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) yield* walkFiles(full)
		else yield full
	}
}

async function sha256File(filePath: string): Promise<string> {
	return createHash('sha256')
		.update(await readFile(filePath))
		.digest('hex')
}

// real paths, so callers never rely on lexical ones: a symlink inside the root must not fake the
// directory structure, such as the folder year
async function assertInsideRoot(
	candidate: string,
	root: string,
): Promise<{ realCandidate: string; realRoot: string }> {
	const [realCandidate, realRoot] = await Promise.all([realpath(candidate), realpath(root)])
	if (realCandidate !== realRoot && !realCandidate.startsWith(realRoot + path.sep)) {
		throw sourceResolveError(
			'path-escape',
			`resolved path for "${path.basename(candidate)}" escapes its declared root`,
		)
	}
	return { realCandidate, realRoot }
}

async function findMastersByFilename(mastersRoot: string, filename: string): Promise<string[]> {
	const matches: string[] = []
	for await (const file of walkFiles(mastersRoot))
		if (path.basename(file) === filename) matches.push(file)
	return matches
}

// the folder year comes from byte-identical copies under archiveRoot; `ignoreDirs` holds
// non-authoritative export and cache folders, which are skipped entirely
async function resolveArchiveYear(
	archiveRoot: string,
	masterSha256: string,
	masterSize: number,
	filename: string,
	ignoreDirs: ReadonlySet<string>,
): Promise<string> {
	const years = new Set<string>()
	for await (const file of walkFiles(archiveRoot)) {
		// checked on the lexical path before any stat, escape check or hash: an ignored folder is
		// never looked into, so a symlink inside it cannot abort the resolve with a path escape. The
		// basename is left out because ignoreDirs names folders, not files
		const lexicalDirs = path.relative(archiveRoot, file).split(path.sep).slice(0, -1)
		if (lexicalDirs.some((segment) => ignoreDirs.has(segment))) continue

		let size: number
		try {
			size = (await stat(file)).size
		} catch {
			continue
		}
		if (size !== masterSize) continue
		// a symlink whose realpath leaves archiveRoot is rejected before its bytes are read
		const { realCandidate, realRoot } = await assertInsideRoot(file, archiveRoot)
		if ((await sha256File(file)) !== masterSha256) continue

		// the real path, not the lexical one: a symlink `2099/ → 2018/real.jpg` would fake the year
		const realDirs = path.relative(realRoot, realCandidate).split(path.sep).slice(0, -1)
		// the reverse of the lexical check: a symlink into an ignored folder brings no year
		if (realDirs.some((segment) => ignoreDirs.has(segment))) continue
		// the first `<YYYY>` folder, not necessarily the first segment: prefix folders before the
		// year tree are allowed, while deeper date-like segments do not change the choice. A copy
		// with no year folder does not vote
		const yearSegment = realDirs.find((segment) => YEAR_SEGMENT_PATTERN.test(segment))
		if (yearSegment) years.add(yearSegment)
	}

	if (years.size === 0) {
		throw sourceResolveError(
			'archive-missing-year',
			`no <YYYY>/ archive copy found for "${filename}"`,
		)
	}
	if (years.size > 1) {
		throw sourceResolveError(
			'archive-year-conflict',
			`archive copies of "${filename}" span multiple years: ${[...years].sort().join(', ')}`,
		)
	}
	return [...years][0]!
}

type RegistryMaster = { masterFilename: string; masterSha256: string; legacyId?: string }

// a duplicate legacyId is an integrity error, never the first match. A sha256 addresses bytes
// uniquely, so two rows with one sha256, legacy and new rows included, are ambiguous
function resolveRegistryMaster(
	request: MasterRequest,
	registry: readonly RegistryRow[],
): RegistryMaster {
	if ('legacyId' in request) {
		const rows = registry.filter(
			(candidate) =>
				isLegacyRegistryRow(candidate) && candidate.legacyId === request.legacyId,
		)
		if (rows.length === 0) {
			throw sourceResolveError(
				'registry-miss',
				`no registry row for legacyId "${request.legacyId}"`,
			)
		}
		if (rows.length > 1) {
			throw sourceResolveError(
				'ambiguous-master',
				`registry has ${rows.length} rows for legacyId "${request.legacyId}" (ambiguous)`,
			)
		}
		const row = rows[0] as LegacyRegistryRow
		if (row.status === 'excluded' || !row.masterSha256 || !row.masterFilename) {
			throw sourceResolveError(
				'not-resolvable',
				`registry row for legacyId "${request.legacyId}" is not resolvable (status/sha/filename)`,
			)
		}
		return {
			masterFilename: row.masterFilename,
			masterSha256: row.masterSha256,
			legacyId: request.legacyId,
		}
	}

	const rows = registry.filter((candidate) => candidate.masterSha256 === request.sha256)
	if (rows.length === 0) {
		throw sourceResolveError('registry-miss', `no registry row for sha256 "${request.sha256}"`)
	}
	if (rows.length > 1) {
		throw sourceResolveError(
			'ambiguous-master',
			`registry has ${rows.length} rows for sha256 "${request.sha256}" (ambiguous)`,
		)
	}
	const row = rows[0]!
	if (!row.masterFilename) {
		throw sourceResolveError(
			'not-resolvable',
			`registry row for sha256 "${request.sha256}" has no master filename`,
		)
	}
	return { masterFilename: row.masterFilename, masterSha256: request.sha256 }
}

export async function resolveMaster(
	request: MasterRequest,
	options: ResolveMasterOptions,
): Promise<ResolvedMaster> {
	const { mastersRoot, archiveRoot, registry, config } = options
	const { masterFilename, masterSha256, legacyId } = resolveRegistryMaster(request, registry)

	const matches = await findMastersByFilename(mastersRoot, masterFilename)
	if (matches.length === 0) {
		throw sourceResolveError('missing-master', `master file "${masterFilename}" not found`)
	}
	if (matches.length > 1) {
		throw sourceResolveError(
			'ambiguous-master',
			`master file "${masterFilename}" matches ${matches.length} locations under masters root`,
		)
	}

	const masterPath = matches[0]!
	await assertInsideRoot(masterPath, mastersRoot)

	if ((await sha256File(masterPath)) !== masterSha256) {
		throw sourceResolveError(
			'hash-drift',
			`sha256 of "${masterFilename}" does not match registry (hash drift)`,
		)
	}

	let metadata: Metadata
	try {
		metadata = await sharp(masterPath).metadata()
	} catch {
		throw sourceResolveError('undecodable', `source "${masterFilename}" could not be decoded`)
	}
	if (!metadata.format || !SUPPORTED_SOURCE_FORMATS.has(metadata.format)) {
		throw sourceResolveError(
			'unsupported-format',
			`source "${masterFilename}" has unsupported format`,
		)
	}
	if (!metadata.width || !metadata.height) {
		throw sourceResolveError(
			'undecodable',
			`source "${masterFilename}" has no readable dimensions`,
		)
	}

	const year = await resolveArchiveYear(
		archiveRoot,
		masterSha256,
		(await stat(masterPath)).size,
		masterFilename,
		new Set(config.archive.ignoreDirs),
	)

	// EXIF orientation 5–8 rotates by 90°; planning and the manifest use the displayed size
	const orientation = metadata.orientation ?? 1
	const swapAxes = orientation >= 5 && orientation <= 8
	const sourceWidth = swapAxes ? metadata.height : metadata.width
	const sourceHeight = swapAxes ? metadata.width : metadata.height
	const plan = planLadderWidths(config, sourceWidth, sourceHeight)

	return {
		photoId: request.photoId,
		...(legacyId !== undefined ? { legacyId } : {}),
		masterFilename,
		masterPath,
		masterSha256,
		sourceWidth,
		sourceHeight,
		orientation,
		year,
		yearEvidence: 'archive-folder',
		warnings: plan.warnings,
		ladderWidths: plan.widths,
	}
}
