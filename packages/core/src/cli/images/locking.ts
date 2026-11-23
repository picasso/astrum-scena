import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

// the owner-token lock that build, activate and sync share. Acquiring is only an exclusive `wx`
// create, and no process ever removes or renames another's lock: without compare-and-swap, an
// auto-steal opens a window where a neighbour takes the path and the "recovery" wipes its lock. So a
// stale lease fails fast with manual-removal guidance instead. It guards against accidental parallel
// runs, not a malicious racer

const LOCK_FILENAME = '.owner.lock'
const DEFAULT_STALE_MS = 15 * 60 * 1000

export const LOCK_HELD = 'lock-held'

export type LockHandle = { lockPath: string; token: string }

type LockRecord = { token: string; pid: number; acquiredAt: number }

export type AcquireOptions = {
	staleMs?: number
	now?: () => number
}

const lockHeld = (message: string): Error => Object.assign(new Error(message), { code: LOCK_HELD })

// null means the lock file does not exist; an unparsable file still returns with a null record
async function readLockRaw(lockPath: string): Promise<{ record: LockRecord | null } | null> {
	let raw: string
	try {
		raw = await readFile(lockPath, 'utf8')
	} catch {
		return null
	}
	try {
		return { record: JSON.parse(raw) as LockRecord }
	} catch {
		return { record: null }
	}
}

export async function acquireLock(
	lockDir: string,
	options: AcquireOptions = {},
): Promise<LockHandle> {
	const now = options.now ?? Date.now
	const staleMs = options.staleMs ?? DEFAULT_STALE_MS
	const lockPath = path.join(lockDir, LOCK_FILENAME)
	await mkdir(lockDir, { recursive: true })

	const token = randomUUID()
	const payload = JSON.stringify({
		token,
		pid: process.pid,
		acquiredAt: now(),
	} satisfies LockRecord)

	try {
		await writeFile(lockPath, payload, { flag: 'wx' })
		return { lockPath, token }
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
	}

	const current = await readLockRaw(lockPath)
	if (!current) {
		// the lock vanished between wx and the read; the only safe retry
		try {
			await writeFile(lockPath, payload, { flag: 'wx' })
			return { lockPath, token }
		} catch {
			throw lockHeld('images lock is held (concurrent acquire)')
		}
	}

	const held = current.record
		? `pid ${current.record.pid} since ${new Date(current.record.acquiredAt).toISOString()}`
		: 'unreadable lock record'
	const stale = !current.record || now() - current.record.acquiredAt > staleMs
	if (stale) {
		throw lockHeld(
			`stale images lock detected (${held}). If no images command is running, ` +
				`remove it manually: rm ${lockPath}`,
		)
	}
	throw lockHeld(`images lock held by ${held}`)
}

// removes the lock only when its token is provably ours; an unreadable or foreign lock is left for
// manual removal, since ownership cannot be proven
export async function releaseLock(handle: LockHandle): Promise<void> {
	const current = await readLockRaw(handle.lockPath)
	if (current?.record?.token === handle.token) await rm(handle.lockPath, { force: true })
}

export async function withLock<T>(
	lockDir: string,
	fn: () => Promise<T>,
	options: AcquireOptions = {},
): Promise<T> {
	const handle = await acquireLock(lockDir, options)
	try {
		return await fn()
	} finally {
		await releaseLock(handle)
	}
}
