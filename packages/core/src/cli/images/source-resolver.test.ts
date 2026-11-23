import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { siteRoot } from '../../config/site-root.ts'
import { type ImageConfig, loadImageConfig } from '../../lib/images/build/config.ts'
import type { RegistryRow } from './masters.ts'
import {
	describeError,
	type MasterRequest,
	masterRequestFromSource,
	resolveMaster,
} from './source-resolver.ts'
import { masterBytes, sha256 } from './test-fixtures.ts'

// synthetic masters and archive copies in a temporary directory; the config is the demo's

let base: string
let mastersRoot: string
let archiveRoot: string
let config: ImageConfig
const rows: RegistryRow[] = []
const digests = new Map<string, string>()

async function master(filename: string, bytes: Buffer, copies: string[]): Promise<void> {
	await writeFile(path.join(mastersRoot, filename), bytes)
	for (const dir of copies) {
		await mkdir(path.join(archiveRoot, dir), { recursive: true })
		await writeFile(path.join(archiveRoot, dir, filename), bytes)
	}
	digests.set(filename, sha256(bytes))
}

beforeAll(async () => {
	base = await mkdtemp(path.join(tmpdir(), 'astrum-scena-resolver-'))
	mastersRoot = path.join(base, 'masters')
	archiveRoot = path.join(base, 'archive')
	await mkdir(path.join(mastersRoot, 'nested'), { recursive: true })
	await mkdir(archiveRoot, { recursive: true })
	config = { ...loadImageConfig(siteRoot), archive: { ignoreDirs: ['_exports'] } }

	await master('landscape.jpg', await masterBytes(2400, 1600), ['2019', '2019/2007'])
	await master('portrait.jpg', await masterBytes(1600, 2400), ['_ex/2021'])
	await master('tiny.jpg', await masterBytes(320, 200), ['2020'])
	await master('no-year.jpg', await masterBytes(300, 200), ['misc', '_exports/2018'])
	await master('two-years.jpg', await masterBytes(310, 200), ['2016', '2017'])
	const rotated = await sharp(await masterBytes(600, 400))
		.withMetadata({ orientation: 6 })
		.jpeg()
		.toBuffer()
	await master('rotated.jpg', rotated, ['2022'])
	await master('drift.jpg', await masterBytes(330, 200), ['2020'])
	await writeFile(path.join(mastersRoot, 'drift.jpg'), await masterBytes(340, 200))
	await writeFile(path.join(mastersRoot, 'nested', 'tiny.jpg'), Buffer.from('dup'))
	await writeFile(path.join(mastersRoot, 'tiny-copy.jpg'), Buffer.from('dup'))
	await symlink(path.join(base, 'outside.jpg'), path.join(mastersRoot, 'escape.jpg'))
	await writeFile(path.join(base, 'outside.jpg'), await masterBytes(200, 200))

	// landscape.jpg is a migrated master: a second row with its sha256 would make it ambiguous
	for (const [filename, digest] of digests)
		if (filename !== 'landscape.jpg')
			rows.push({
				id: filename.replace('.jpg', ''),
				masterFilename: filename,
				masterSha256: digest,
			})
	rows.push(
		{
			legacyId: 'wp:1',
			masterFilename: 'landscape.jpg',
			masterSha256: digests.get('landscape.jpg')!,
			status: 'auto',
		},
		{ legacyId: 'wp:2', masterFilename: null, masterSha256: null, status: 'excluded' },
		{ legacyId: 'wp:3', masterFilename: 'a.jpg', masterSha256: 'c'.repeat(64), status: 'auto' },
		{ legacyId: 'wp:3', masterFilename: 'b.jpg', masterSha256: 'd'.repeat(64), status: 'auto' },
		{
			id: 'escape',
			masterFilename: 'escape.jpg',
			masterSha256: sha256(await masterBytes(200, 200)),
		},
	)
})

afterAll(() => rm(base, { recursive: true, force: true }))

const options = () => ({ mastersRoot, archiveRoot, registry: rows, config })
const byFile = (filename: string): MasterRequest => ({
	photoId: 'photo',
	sha256: digests.get(filename)!,
})

const failure = async (request: MasterRequest): Promise<string> =>
	resolveMaster(request, options()).then(
		() => 'resolved',
		(error: unknown) => describeError(error),
	)

describe('resolveMaster', () => {
	it('resolves a migrated master by its legacyId, with the year of its archive copies and its ladder', async () => {
		const resolved = await resolveMaster({ photoId: 'other', legacyId: 'wp:1' }, options())
		expect(resolved.legacyId).toBe('wp:1')
		expect(resolved.masterFilename).toBe('landscape.jpg')
		expect(resolved.year).toBe('2019')
		expect(resolved.sourceWidth).toBe(2400)
		expect(resolved.ladderWidths).toEqual([200, 400, 800, 1200, 1600, 2000])
		expect(resolved.warnings).toEqual([])
	})

	it('resolves a new master by its sha256, taking the first year folder after a prefix', async () => {
		const resolved = await resolveMaster(byFile('portrait.jpg'), options())
		expect(resolved.year).toBe('2021')
		expect(resolved.ladderWidths).toEqual([200, 400, 800, 1200, 1333])
		expect(resolved.warnings).toContain(
			'long-side-cap: ladder capped to 1333px (source 1600px)',
		)
	})

	it('swaps the sides of an EXIF-rotated master', async () => {
		const resolved = await resolveMaster(byFile('rotated.jpg'), options())
		expect([resolved.sourceWidth, resolved.sourceHeight, resolved.orientation]).toEqual([
			400, 600, 6,
		])
	})

	it('names each failure by its code and the basename only', async () => {
		expect(await failure({ photoId: 'p', legacyId: 'wp:9' })).toBe(
			'[registry-miss] no registry row for legacyId "wp:9"',
		)
		expect(await failure({ photoId: 'p', legacyId: 'wp:2' })).toContain('[not-resolvable]')
		expect(await failure({ photoId: 'p', legacyId: 'wp:3' })).toContain('[ambiguous-master]')
		expect(await failure(byFile('drift.jpg'))).toBe(
			'[hash-drift] sha256 of "drift.jpg" does not match registry (hash drift)',
		)
		expect(await failure(byFile('no-year.jpg'))).toBe(
			'[archive-missing-year] no <YYYY>/ archive copy found for "no-year.jpg"',
		)
		expect(await failure(byFile('two-years.jpg'))).toBe(
			'[archive-year-conflict] archive copies of "two-years.jpg" span multiple years: 2016, 2017',
		)
		expect(await failure({ photoId: 'p', sha256: 'e'.repeat(64) })).toContain('[registry-miss]')
		const escape = rows.find((row) => row.masterFilename === 'escape.jpg')!
		expect(await failure({ photoId: 'p', sha256: escape.masterSha256! })).toBe(
			'[path-escape] resolved path for "escape.jpg" escapes its declared root',
		)
		for (const message of [await failure(byFile('drift.jpg'))])
			expect(message).not.toContain(base)
	})

	it('rejects a filename found twice under the masters root', async () => {
		const duplicated: RegistryRow = {
			id: 'dup',
			masterFilename: 'tiny.jpg',
			masterSha256: digests.get('tiny.jpg')!,
		}
		await writeFile(path.join(mastersRoot, 'nested', 'tiny.jpg'), Buffer.from('dup'))
		const message = await resolveMaster(
			{ photoId: 'p', sha256: duplicated.masterSha256 },
			{ ...options(), registry: [duplicated] },
		).then(
			() => 'resolved',
			(error: unknown) => describeError(error),
		)
		expect(message).toBe(
			'[ambiguous-master] master file "tiny.jpg" matches 2 locations under masters root',
		)
	})
})

describe('masterRequestFromSource', () => {
	it('reads either identity and rejects a mixed or missing one', () => {
		expect(masterRequestFromSource('p', { legacyId: 'wp:1', title: {} })).toEqual({
			photoId: 'p',
			legacyId: 'wp:1',
		})
		const sha = 'a'.repeat(64)
		expect(masterRequestFromSource('p', { sha256: sha, master: 'p.jpg' })).toEqual({
			photoId: 'p',
			sha256: sha,
		})
		for (const source of [
			{ legacyId: 'wp:1', sha256: sha, master: 'p.jpg' },
			{ sha256: sha },
			{},
		])
			expect(() => masterRequestFromSource('p', source)).toThrow(/content photo "p"/)
	})
})
