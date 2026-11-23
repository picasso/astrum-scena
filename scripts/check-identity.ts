import { execFileSync } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import {
	describeLeak,
	findDenylisted,
	findLeaks,
	inCi,
	loadDenylist,
	MISSING_DENYLIST_HINT,
} from './lib/identity.ts'
import { isBinary, readScannedFile } from './lib/local-paths.ts'

// gate: no reference-site identity in the repository (rules in lib/identity.ts). Tracked and new
// non-ignored files are scanned, so a leak is caught before it is committed. A report names the file,
// line and rule, never the matched text: CI logs must not repeat what the gate keeps out. Outside CI a
// missing owner list only warns, so a contributor of the public repository can run `pnpm check`; the
// generic patterns still apply, and CI, where the list is a secret, keeps failing without it.

function repositoryFiles(): string[] {
	const output = execFileSync(
		'git',
		['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
		{ encoding: 'utf8' },
	)
	return output.split('\0').filter((file) => file !== '')
}

async function main(): Promise<void> {
	const denylist = await loadDenylist()
	const skipped = denylist.entries.length === 0
	if (skipped) {
		if (inCi()) {
			console.error('check:identity FAILED — the owner denylist is missing or empty.')
			console.error(MISSING_DENYLIST_HINT)
			process.exitCode = 1
			return
		}
		console.error(
			'check:identity WARNING — the owner denylist is missing or empty, so only the generic patterns are checked; CI checks the list.',
		)
		console.error(MISSING_DENYLIST_HINT)
	}
	const offenders: string[] = []
	let withheld = 0
	for (const file of repositoryFiles()) {
		// a file deleted in the working tree is not published, whatever its name
		if (!(await lstat(file).catch(() => null))) continue
		// a file name is published like its content, so a leaking name is withheld from every report line,
		// a read error included
		const nameLeaks = findDenylisted(file, denylist)
		const label = nameLeaks.length > 0 ? `<file name withheld #${++withheld}>` : file
		for (const leak of nameLeaks) offenders.push(`${label}: file name, ${describeLeak(leak)}`)
		let buffer: Buffer | null
		try {
			buffer = await readScannedFile(file)
		} catch (error) {
			offenders.push(
				`${label}: unreadable (${(error as NodeJS.ErrnoException).code ?? 'error'})`,
			)
			continue
		}
		if (!buffer) continue
		const text = buffer.toString('utf8')
		if (isBinary(buffer)) {
			for (const leak of findDenylisted(text, denylist))
				offenders.push(`${label}: ${describeLeak(leak)}`)
			continue
		}
		text.split('\n').forEach((line, index) => {
			for (const leak of findLeaks(line, denylist))
				offenders.push(`${label}:${index + 1}:${leak.column}: ${describeLeak(leak)}`)
		})
	}
	if (offenders.length > 0) {
		console.error('check:identity FAILED — reference-site identity found:')
		for (const offender of offenders) console.error(`  - ${offender}`)
		if (withheld > 0)
			console.error(
				"Find a withheld file name locally: git ls-files --cached --others --exclude-standard | grep -iF -e '<entry>'.",
			)
		console.error(
			'Remove it. A public host that names nobody may be added to PUBLIC_HOSTS in scripts/lib/identity.ts.',
		)
		process.exitCode = 1
		return
	}
	console.log(
		skipped
			? 'check:identity OK without the owner denylist (no pattern leaks)'
			: `check:identity OK (${denylist.entries.length} denylist entries, ${denylist.allowed.length} allowed contexts, no pattern leaks)`,
	)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
