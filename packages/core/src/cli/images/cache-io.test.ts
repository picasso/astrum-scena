import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertCacheWithinRoot, nearestExisting } from './cache-path.ts'
import { acquireLock, LOCK_HELD, releaseLock, withLock } from './locking.ts'
import { swapRelease } from './release-fs.ts'

// the guards of the image cache, on real directories and symlinks

describe('locking', () => {
	let dir: string
	const lockPath = (): string => path.join(dir, '.owner.lock')

	beforeEach(async () => {
		dir = await mkdtemp(path.join(tmpdir(), 'img-lock-'))
	})
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true })
	})

	it('fails fast when a fresh lock is held', async () => {
		const held = await acquireLock(dir)
		await expect(acquireLock(dir)).rejects.toMatchObject({ code: LOCK_HELD })
		await releaseLock(held)
		expect((await acquireLock(dir)).token).toBeTruthy()
	})

	it('fails fast on a stale or corrupt lease with guidance, never stealing it', async () => {
		let clock = 1_000_000
		const now = (): number => clock
		await acquireLock(dir, { now, staleMs: 1000 })
		clock += 5000
		await expect(acquireLock(dir, { now, staleMs: 1000 })).rejects.toThrow(/stale.*rm /)
		await writeFile(lockPath(), 'not-json', 'utf8')
		await expect(acquireLock(dir)).rejects.toThrow(/stale/)
		await rm(lockPath(), { force: true })
		expect((await acquireLock(dir, { now, staleMs: 1000 })).token).toBeTruthy()
	})

	it('releases only its own lock, and releases it when the body throws', async () => {
		const held = await acquireLock(dir)
		await releaseLock({ lockPath: lockPath(), token: 'someone-else' })
		expect(await readFile(lockPath(), 'utf8')).toContain(held.token)
		await releaseLock(held)
		await expect(
			withLock(dir, async () => {
				throw new Error('boom')
			}),
		).rejects.toThrow('boom')
		expect((await acquireLock(dir)).token).toBeTruthy()
	})
})

describe('swapRelease', () => {
	let base: string
	let releaseDir: string
	let stagingDir: string
	let backupDir: string

	beforeEach(async () => {
		base = await mkdtemp(path.join(tmpdir(), 'release-swap-'))
		releaseDir = path.join(base, 'release')
		stagingDir = path.join(base, '.staging-release')
		backupDir = path.join(base, '.backup-release')
		await mkdir(stagingDir, { recursive: true })
		await writeFile(path.join(stagingDir, 'marker.txt'), 'new')
	})
	afterEach(async () => {
		await rm(base, { recursive: true, force: true })
	})

	it('installs staging as the release, replacing an existing one and dropping the backup', async () => {
		await swapRelease(stagingDir, releaseDir, backupDir)
		expect(await readFile(path.join(releaseDir, 'marker.txt'), 'utf8')).toBe('new')
		await mkdir(stagingDir, { recursive: true })
		await writeFile(path.join(stagingDir, 'marker.txt'), 'newer')
		await swapRelease(stagingDir, releaseDir, backupDir)
		expect(await readFile(path.join(releaseDir, 'marker.txt'), 'utf8')).toBe('newer')
		await expect(readFile(path.join(backupDir, 'marker.txt'), 'utf8')).rejects.toThrow()
	})

	it('restores a previous release a crash left only in the backup before swapping', async () => {
		await mkdir(backupDir, { recursive: true })
		await writeFile(path.join(backupDir, 'marker.txt'), 'old')
		const failingRename = async (source: string, destination: string): Promise<void> => {
			if (source === stagingDir) throw new Error('injected swap failure')
			await rename(source, destination)
		}
		await expect(
			swapRelease(stagingDir, releaseDir, backupDir, { rename: failingRename }),
		).rejects.toThrow('injected swap failure')
		expect(await readFile(path.join(releaseDir, 'marker.txt'), 'utf8')).toBe('old')
		await swapRelease(stagingDir, releaseDir, backupDir)
		expect(await readFile(path.join(releaseDir, 'marker.txt'), 'utf8')).toBe('new')
	})

	it('restores the previous release when the final rename fails', async () => {
		await mkdir(releaseDir, { recursive: true })
		await writeFile(path.join(releaseDir, 'marker.txt'), 'old')
		const failingRename = async (source: string, destination: string): Promise<void> => {
			if (source === stagingDir) throw new Error('injected swap failure')
			await rename(source, destination)
		}
		await expect(
			swapRelease(stagingDir, releaseDir, backupDir, { rename: failingRename }),
		).rejects.toThrow('injected swap failure')
		expect(await readFile(path.join(releaseDir, 'marker.txt'), 'utf8')).toBe('old')
	})
})

describe('assertCacheWithinRoot', () => {
	let base: string
	let root: string
	let outside: string
	const target = (r: string): string => path.join(r, '.cache', 'images', 'releases')

	beforeAll(async () => {
		base = await mkdtemp(path.join(tmpdir(), 'cache-guard-'))
		root = path.join(base, 'site')
		outside = path.join(base, 'outside')
		await mkdir(path.join(root, 'src'), { recursive: true })
		await mkdir(outside, { recursive: true })
	})
	afterAll(async () => {
		await rm(base, { recursive: true, force: true })
	})

	it('accepts a real cache path, existing or not', async () => {
		await expect(assertCacheWithinRoot(target(root), root)).resolves.toBeUndefined()
		await mkdir(target(root), { recursive: true })
		await expect(assertCacheWithinRoot(target(root), root)).resolves.toBeUndefined()
	})

	it('rejects a .cache symlink outside the site or into a tracked folder of it', async () => {
		const out = path.join(base, 'site-out')
		await mkdir(out, { recursive: true })
		await symlink(outside, path.join(out, '.cache'), 'dir')
		await expect(assertCacheWithinRoot(target(out), out)).rejects.toThrow(/symlink/)
		const inside = path.join(base, 'site-in')
		await mkdir(path.join(inside, 'src'), { recursive: true })
		await symlink(path.join(inside, 'src'), path.join(inside, '.cache'), 'dir')
		await expect(assertCacheWithinRoot(target(inside), inside)).rejects.toThrow(/symlink/)
	})

	it('rejects a target lexically outside the root', async () => {
		await expect(assertCacheWithinRoot(outside, root)).rejects.toThrow(/outside/)
		await expect(assertCacheWithinRoot(path.join(root, '..', 'x'), root)).rejects.toThrow(
			/outside/,
		)
	})

	it('finds the nearest existing ancestor', async () => {
		const deep = path.join(base, 'a', 'b', 'c')
		expect(await nearestExisting(deep)).toBe(base)
		await mkdir(path.join(base, 'a'), { recursive: true })
		expect(await nearestExisting(deep)).toBe(path.join(base, 'a'))
	})
})
