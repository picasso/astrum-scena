import { rename as fsRename, rm as fsRm, stat as fsStat } from 'node:fs/promises'

// `rename` cannot overwrite a non-empty directory (ENOTEMPTY) and Node has no portable atomic
// directory swap, so the old release moves to a backup first and is restored if the final rename
// fails; `rm` then `rename` would leave a window with no valid candidate at all

export type SwapReleaseDeps = {
	rename?: (source: string, destination: string) => Promise<void>
	rm?: (target: string) => Promise<void>
	exists?: (target: string) => Promise<boolean>
}

async function defaultExists(target: string): Promise<boolean> {
	try {
		await fsStat(target)
		return true
	} catch {
		return false
	}
}

export async function swapRelease(
	stagingDir: string,
	releaseDir: string,
	backupDir: string,
	deps: SwapReleaseDeps = {},
): Promise<void> {
	const rename = deps.rename ?? fsRename
	const rm = deps.rm ?? ((target: string) => fsRm(target, { recursive: true, force: true }))
	const exists = deps.exists ?? defaultExists

	// a crash between the two renames left the previous release only in the backup
	if (!(await exists(releaseDir)) && (await exists(backupDir)))
		await rename(backupDir, releaseDir)
	await rm(backupDir)
	const hadPrevious = await exists(releaseDir)
	if (hadPrevious) await rename(releaseDir, backupDir)

	try {
		await rename(stagingDir, releaseDir)
	} catch (error) {
		if (hadPrevious) await rename(backupDir, releaseDir)
		throw error
	}

	if (hadPrevious) await rm(backupDir)
}
