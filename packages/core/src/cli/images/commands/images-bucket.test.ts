import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { editSiteConfig } from '../../../config/fixtures/site-files.ts'
import { computeConfigDigest, loadImageConfig } from '../../../lib/images/build/config.ts'
import {
	buildEmptyManifest,
	parseManifest,
	serializeManifest,
} from '../../../lib/images/manifest.ts'
import {
	buildReleaseDescriptor,
	releaseDescriptorPath,
	releaseDirPath,
	releaseManifestPath,
	serializeReleaseDescriptor,
} from '../../../lib/images/release.ts'
import { runAstrumScena, type RunOptions } from '../../test-fixtures.ts'
import { endExifTool } from '../exiftool.ts'
import { JSONL_HEADER } from '../jsonl.ts'
import { PUBLICATION_LEDGER_PATH } from '../ledger.ts'
import type { FetchLike } from '../public-domain-check.ts'
import { type BucketOptions, IMMUTABLE_CACHE_CONTROL } from '../r2-client.ts'
import { R2_ENV_VARS } from '../r2-env.ts'
import { openS3Bucket, S3_PACKAGE } from '../s3-client.ts'
import {
	addMaster,
	createFakeR2Client,
	type FakeR2Client,
	type ImageSite,
	makeImageSite,
	rootsOptions,
	sha256,
	syntheticManifest,
} from '../test-fixtures.ts'

// sync, prune and check-live on a temporary site whose derivatives a bucket serves, against an
// in-memory bucket and HTTP client: no test reaches the network

const scratch = mkdtempSync(path.join(tmpdir(), 'astrum-scena-images-bucket-'))
afterAll(async () => {
	await endExifTool()
	rmSync(scratch, { recursive: true, force: true })
})

const RELEASE = 'bucket-01'
const PHOTO = 'amber-dunes'
const ORIGIN = 'https://img.example.com'
const R2_ENV = Object.fromEntries(R2_ENV_VARS.map((name) => [name, `dummy-${name.toLowerCase()}`]))

let fixture: ImageSite
let bucket: FakeR2Client
let opened: BucketOptions[]

// the bucket every command of a test opens, and a public origin that serves whatever it holds
function remote(): RunOptions {
	const fetch: FetchLike = async (url) => {
		const object = bucket.objects.get(url.slice(ORIGIN.length + 1))
		const headers: Record<string, string> = object
			? {
					'content-type': object.contentType ?? '',
					'cache-control': object.cacheControl ?? '',
					'content-length': String(object.body.length),
				}
			: {}
		return {
			ok: object !== undefined,
			status: object ? 200 : 404,
			headers: { get: (name) => headers[name] ?? null },
		}
	}
	return {
		env: R2_ENV,
		openBucket: async (credentials, options) => {
			expect(credentials.bucket).toBe(R2_ENV.R2_IMAGES_BUCKET)
			opened.push(options)
			return bucket
		},
		fetch,
	}
}

const run = (argv: string[], options: RunOptions = remote()) =>
	runAstrumScena(fixture.site, argv, options)

const serveFromBucket = (site: string): string =>
	editSiteConfig(site, (source) =>
		source.replace(/^images:\n/m, `images:\n    publicOrigin: ${ORIGIN}\n`),
	)

beforeAll(async () => {
	fixture = makeImageSite(scratch)
	serveFromBucket(fixture.site)
	const resolved = await runAstrumScena(fixture.site, ['config', 'resolve'])
	expect(resolved.status, resolved.stderr).toBe(0)
	await addMaster(fixture, { photoId: PHOTO })
	const built = await runAstrumScena(fixture.site, [
		'images',
		'build',
		...rootsOptions(fixture),
		'--release',
		RELEASE,
		'--photos',
		PHOTO,
	])
	expect(built.status, built.stderr).toBe(0)
}, 120_000)

const releaseKeys = (): string[] =>
	parseManifest(
		JSON.parse(
			readFileSync(releaseManifestPath(releaseDirPath(fixture.site, RELEASE)), 'utf8'),
		),
	)
		.photos[PHOTO]!.derivatives.map((derivative) => derivative.objectKey)
		.sort()

describe('images sync', () => {
	it('names the missing R2_IMAGES_* variables and opens no bucket without secrets', async () => {
		bucket = createFakeR2Client()
		opened = []
		const result = await run(['images', 'sync', '--release', RELEASE], {
			...remote(),
			env: {},
		})
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`set ${R2_ENV_VARS.join(', ')} in the environment`)
		expect(opened).toEqual([])
	})

	it('asks to install the S3 SDK when the site has none', async () => {
		const notFound = Object.assign(new Error(`Cannot find package '${S3_PACKAGE}'`), {
			code: 'ERR_MODULE_NOT_FOUND',
		})
		const result = await run(['images', 'sync', '--release', RELEASE], {
			env: R2_ENV,
			openBucket: openS3Bucket(() => Promise.reject(notFound)),
		})
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`images sync FAIL: the bucket commands need ${S3_PACKAGE}`)
		expect(result.stderr).toContain(`pnpm add -D ${S3_PACKAGE}`)
	})

	it('plans on --dry-run, then uploads, verifies and records the release once', async () => {
		bucket = createFakeR2Client()
		opened = []
		const keys = releaseKeys()
		const dry = await run(['images', 'sync', '--release', RELEASE, '--dry-run'])
		expect(dry.status, dry.stderr).toBe(0)
		expect(dry.stdout).toContain(`would upload:    ${keys.length}`)
		expect(bucket.calls.put).toBe(0)
		expect(existsSync(path.join(fixture.site, PUBLICATION_LEDGER_PATH))).toBe(false)

		const synced = await run(['images', 'sync', '--release', RELEASE])
		expect(synced.status, synced.stderr).toBe(0)
		expect(synced.stdout).toContain(`uploaded: ${keys.length}`)
		expect(synced.stdout).toContain(`ledger:   ${PUBLICATION_LEDGER_PATH} (appended)`)
		expect([...bucket.objects.keys()].sort()).toEqual(keys)
		for (const object of bucket.objects.values())
			expect(object.cacheControl).toBe(IMMUTABLE_CACHE_CONTROL)
		const ledger = readFileSync(path.join(fixture.site, PUBLICATION_LEDGER_PATH), 'utf8')
		expect(ledger.startsWith(JSONL_HEADER)).toBe(true)
		expect(ledger.trim().split('\n')).toHaveLength(2)
		expect(JSON.parse(ledger.trim().split('\n')[1]!)).toMatchObject({
			releaseId: RELEASE,
			publicOrigin: ORIGIN,
		})

		const again = await run(['images', 'sync', '--release', RELEASE])
		expect(again.status, again.stderr).toBe(0)
		expect(again.stdout).toContain('uploaded: 0')
		expect(again.stdout).toContain('(unchanged)')
		expect(opened).toEqual([{ readOnly: false }, { readOnly: false }, { readOnly: false }])
	}, 60_000)

	it('needs --release, a bucket origin, and only its own options', async () => {
		const noRelease = await run(['images', 'sync'])
		expect(noRelease.status).toBe(1)
		expect(noRelease.stderr).toContain('--release <id> names the release to publish')

		const servedBySite = makeImageSite(scratch, 'public-path')
		const result = await runAstrumScena(
			servedBySite.site,
			['images', 'sync', '--release', RELEASE],
			remote(),
		)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('the bucket commands need publicOrigin')

		const foreign = await run(['images', 'sync', '--release', RELEASE, '--pixels'])
		expect(foreign.status).toBe(2)
		expect(foreign.stderr).toContain(
			'options of images sync: --root <dir>, --release <id>, --dry-run',
		)
	})
})

describe('images check-live', () => {
	it('verifies a candidate release in the bucket and at the public origin', async () => {
		bucket = createFakeR2Client()
		opened = []
		expect((await run(['images', 'sync', '--release', RELEASE])).status).toBe(0)
		const live = await run(['images', 'check-live', '--release', RELEASE])
		expect(live.status, live.stderr).toBe(0)
		const count = releaseKeys().length
		expect(live.stdout).toContain(`bucket:        ${count}/${count} verified`)
		expect(live.stdout).toContain(`public origin: ${count}/${count} verified`)
		expect(opened.at(-1)).toEqual({ readOnly: true })

		const [first] = releaseKeys()
		bucket.objects.delete(first!)
		const missing = await run(['images', 'check-live', '--release', RELEASE])
		expect(missing.status).toBe(1)
		expect(missing.stderr).toContain(`remote object "${first}" is missing`)
	}, 60_000)

	it('fails on a public origin that serves the objects with mutable caching', async () => {
		bucket = createFakeR2Client()
		opened = []
		expect((await run(['images', 'sync', '--release', RELEASE])).status).toBe(0)
		for (const object of bucket.objects.values()) object.cacheControl = 'no-store'
		const result = await run(['images', 'check-live', '--release', RELEASE])
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('public origin verification')
		expect(result.stderr).toContain('is not immutable')
	}, 60_000)

	it('checks the active descriptor after activation', async () => {
		bucket = createFakeR2Client()
		opened = []
		expect((await run(['images', 'sync', '--release', RELEASE])).status).toBe(0)
		const activated = await run(['images', 'activate', '--release', RELEASE])
		expect(activated.status, activated.stderr).toBe(0)
		const live = await run(['images', 'check-live'])
		expect(live.status, live.stderr).toBe(0)
		expect(live.stdout).toContain('the active release descriptor')
	}, 60_000)

	it('passes an inactive empty descriptor without secrets or a bucket', async () => {
		const site = makeImageSite(scratch, 'inactive')
		serveFromBucket(site.site)
		expect((await runAstrumScena(site.site, ['config', 'resolve'])).status).toBe(0)
		const manifest = buildEmptyManifest(computeConfigDigest(loadImageConfig(site.site)))
		writeFileSync(
			releaseDescriptorPath(site.site),
			serializeReleaseDescriptor(buildReleaseDescriptor({ active: false, manifest })),
		)
		opened = []
		const live = await runAstrumScena(site.site, ['images', 'check-live'], {
			...remote(),
			env: {},
		})
		expect(live.status, live.stderr).toBe(0)
		expect(live.stdout).toContain('the bucket is not contacted')
		expect(opened).toEqual([])
	})

	it('rejects a descriptor with a stale configDigest before opening the bucket', async () => {
		const site = makeImageSite(scratch, 'stale-digest')
		serveFromBucket(site.site)
		expect((await runAstrumScena(site.site, ['config', 'resolve'])).status).toBe(0)
		const stale = 'f'.repeat(64)
		writeFileSync(
			releaseDescriptorPath(site.site),
			serializeReleaseDescriptor(
				buildReleaseDescriptor({ active: false, manifest: buildEmptyManifest(stale) }),
			),
		)
		opened = []
		const live = await runAstrumScena(site.site, ['images', 'check-live'], remote())
		expect(live.status).toBe(1)
		expect(live.stderr).toContain(`manifest.configDigest ${stale} != config digest`)
		expect(opened).toEqual([])
	})
})

describe('images prune', () => {
	it('reports the orphans of the bucket read-only and deletes nothing', async () => {
		bucket = createFakeR2Client()
		opened = []
		expect((await run(['images', 'sync', '--release', RELEASE])).status).toBe(0)
		bucket.seed('old-photo/512w-0.avif', Buffer.from('old'), 'e'.repeat(64))
		const before = bucket.objects.size
		const report = await run(['images', 'prune', '--release', RELEASE])
		expect(report.status, report.stderr).toBe(0)
		expect(report.stdout).toContain('orphans:          1')
		expect(report.stdout).toContain('? old-photo/512w-0.avif')
		expect(report.stdout).toContain('missing remotely: 0')
		expect(bucket.objects.size).toBe(before)
		expect(bucket.calls.put).toBe(releaseKeys().length)
		expect(opened.at(-1)).toEqual({ readOnly: true })
	}, 60_000)

	it('never reports a key of the active release descriptor as an orphan of a candidate', async () => {
		bucket = createFakeR2Client()
		opened = []
		expect((await run(['images', 'sync', '--release', RELEASE])).status).toBe(0)
		const activated = await run(['images', 'activate', '--release', RELEASE])
		expect(activated.status, activated.stderr).toBe(0)
		const bytes = Buffer.from('candidate-bytes')
		const candidate = syntheticManifest({ 'wide-tide': bytes })
		const candidateDir = releaseDirPath(fixture.site, 'candidate-02')
		mkdirSync(candidateDir, { recursive: true })
		writeFileSync(releaseManifestPath(candidateDir), serializeManifest(candidate))
		const candidateKey = candidate.photos['wide-tide']!.derivatives[0]!.objectKey
		bucket.seed(candidateKey, bytes, sha256(bytes))
		const report = await run(['images', 'prune', '--release', 'candidate-02'])
		expect(report.status, report.stderr).toBe(0)
		expect(report.stdout).toContain('orphans:          0')
		for (const key of releaseKeys()) expect(report.stdout).not.toContain(key)
	}, 60_000)

	it('names the credentials by their variables in an error of the bucket client', async () => {
		bucket = createFakeR2Client()
		const accountId = R2_ENV.R2_IMAGES_ACCOUNT_ID!
		bucket.list = async () => {
			throw new Error(`getaddrinfo ENOTFOUND ${accountId}.r2.cloudflarestorage.com`)
		}
		const result = await run(['images', 'prune'])
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('ENOTFOUND R2_IMAGES_ACCOUNT_ID.r2.cloudflarestorage.com')
		expect(`${result.stdout}${result.stderr}`).not.toContain(accountId)
	})
})
