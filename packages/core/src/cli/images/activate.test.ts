import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { computeConfigDigest, loadImageConfig } from '../../lib/images/build/config.ts'
import { buildEmptyManifest, type Manifest, serializeManifest } from '../../lib/images/manifest.ts'
import {
	buildReleaseDescriptor,
	descriptorManifestBytes,
	parseReleaseDescriptor,
	RELEASE_DESCRIPTOR_RELATIVE_PATH,
	releaseDirPath,
	releaseManifestPath,
	serializeReleaseDescriptor,
} from '../../lib/images/release.ts'
import { runAstrumScena } from '../test-fixtures.ts'
import { activateRelease, listActivationJournals, recoverActivation } from './activate.ts'
import type { CheckResult } from './check-derivatives.ts'
import { makeImageSite } from './test-fixtures.ts'

// the release here has no derivative files, so the integrity check is stubbed; the command tests run
// the real one

const RELEASE_ID = 'candidate'
const PHOTO = 'amber-dunes'
const okCheck = async (): Promise<CheckResult> => ({ ok: true, errors: [], derivativeCount: 0 })

const scratch = await mkdtemp(path.join(tmpdir(), 'astrum-scena-activate-'))
afterAll(() => rm(scratch, { recursive: true, force: true }))

let root: string
let count = 0

beforeEach(async () => {
	root = makeImageSite(scratch, `site-${(count += 1)}`).site
	const digest = computeConfigDigest(loadImageConfig(root))
	await writeFile(
		path.join(root, RELEASE_DESCRIPTOR_RELATIVE_PATH),
		serializeReleaseDescriptor(
			buildReleaseDescriptor({ active: false, manifest: buildEmptyManifest(digest) }),
		),
	)
	const sha = 'a'.repeat(64)
	const manifest: Manifest = {
		schemaVersion: 3,
		configDigest: digest,
		photos: {
			[PHOTO]: {
				masterSha256: sha,
				sourceWidth: 100,
				sourceHeight: 80,
				orientation: 1,
				dominantColor: '#647888',
				rightsId: 'astrum-scena-demo',
				derivatives: [
					{
						width: 100,
						height: 80,
						format: 'avif',
						objectKey: `${PHOTO}/100w-${sha}.avif`,
						sha256: sha,
						byteSize: 1,
						rightsEmbedded: true,
						privacyChecked: true,
						watermarkProfile: 'none',
					},
				],
			},
		},
	}
	const releaseDir = releaseDirPath(root, RELEASE_ID)
	await mkdir(releaseDir, { recursive: true })
	await writeFile(releaseManifestPath(releaseDir), serializeManifest(manifest))
})

const trackedRaw = () => readFile(path.join(root, RELEASE_DESCRIPTOR_RELATIVE_PATH), 'utf8')
const tracked = async () => parseReleaseDescriptor(JSON.parse(await trackedRaw()))
const releaseBytes = () => readFile(releaseManifestPath(releaseDirPath(root, RELEASE_ID)), 'utf8')
const journals = () => listActivationJournals(root)

describe('activateRelease', () => {
	it('switches the descriptor to the release and cleans the journal', async () => {
		await activateRelease(root, RELEASE_ID, { checkRelease: okCheck })
		const descriptor = await tracked()
		expect(descriptor.active).toBe(true)
		expect(descriptorManifestBytes(descriptor)).toBe(await releaseBytes())
		expect(await journals()).toEqual([])
	})

	it('refuses to start over a journal and changes nothing on a failed check', async () => {
		const before = await trackedRaw()
		await expect(
			activateRelease(root, RELEASE_ID, {
				checkRelease: async () => ({ ok: false, errors: ['x'], derivativeCount: 0 }),
			}),
		).rejects.toThrow(/integrity check/)
		expect(await trackedRaw()).toBe(before)
		await mkdir(path.join(root, '.cache/images/.activate-stale'), { recursive: true })
		await expect(activateRelease(root, RELEASE_ID, { checkRelease: okCheck })).rejects.toThrow(
			/unrecovered activation journal/,
		)
	})

	it('rolls forward after a crash past the commit', async () => {
		await expect(
			activateRelease(root, RELEASE_ID, {
				checkRelease: okCheck,
				hooks: {
					afterCommit: async () => {
						throw new Error('injected crash after commit')
					},
				},
			}),
		).rejects.toThrow(/injected crash/)
		expect(await journals()).toHaveLength(1)
		expect((await recoverActivation(root)).action).toBe('roll-forward')
		expect((await tracked()).active).toBe(true)
		expect(await journals()).toEqual([])
	})

	it('never overwrites an intact descriptor with a partial backup, and restores a corrupt one', async () => {
		const intact = await trackedRaw()
		const partial = path.join(root, '.cache/images/.activate-partial')
		await mkdir(partial, { recursive: true })
		await writeFile(path.join(partial, 'descriptor.bak'), '{ "cut', 'utf8')
		expect((await recoverActivation(root)).action).toBe('roll-back')
		expect(await trackedRaw()).toBe(intact)

		await mkdir(partial, { recursive: true })
		await writeFile(path.join(partial, 'descriptor.bak'), intact, 'utf8')
		await writeFile(path.join(root, RELEASE_DESCRIPTOR_RELATIVE_PATH), 'CORRUPT', 'utf8')
		expect((await recoverActivation(root)).action).toBe('roll-back')
		expect(await trackedRaw()).toBe(intact)
		expect((await recoverActivation(root)).action).toBe('none')
	})
})

describe('images activate', () => {
	it('recovers an interrupted activation with --recover, and the gate names the journal until then', async () => {
		const before = await trackedRaw()
		await expect(
			activateRelease(root, RELEASE_ID, {
				checkRelease: okCheck,
				hooks: {
					afterStaged: async () => {
						throw new Error('injected crash at staged')
					},
				},
			}),
		).rejects.toThrow(/injected crash/)

		const gate = await runAstrumScena(root, ['check', 'images-policy'])
		expect(gate.status).toBe(1)
		expect(gate.stderr).toContain('unfinished activation journal')
		expect(gate.stderr).toContain('astrum-scena images activate --recover')
		const blocked = await runAstrumScena(root, ['images', 'activate', '--release', RELEASE_ID])
		expect(blocked.status).toBe(1)
		expect(blocked.stderr).toContain('run: astrum-scena images activate --recover')

		const recovered = await runAstrumScena(root, ['images', 'activate', '--recover'])
		expect(recovered.status, recovered.stderr).toBe(0)
		expect(recovered.stdout).toContain('images activate --recover OK (roll-back)')
		expect(await trackedRaw()).toBe(before)
		expect(await journals()).toEqual([])
	})

	it('needs --release or --recover', async () => {
		const result = await runAstrumScena(root, ['images', 'activate'])
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('--release <id> names the release to activate')
	})
})
