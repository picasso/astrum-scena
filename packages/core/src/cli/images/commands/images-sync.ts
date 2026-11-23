import { loadImageConfig } from '../../../lib/images/build/config.ts'
import { releaseDirPath } from '../../../lib/images/release.ts'
import { type CliContext, flagOption, label } from '../../context.ts'
import { bucketOrigin, openBucket } from '../bucket.ts'
import { imagesCacheDir } from '../cache-path.ts'
import { ledgerPath } from '../ledger.ts'
import { withLock } from '../locking.ts'
import { syncRelease } from '../sync.ts'
import { releaseOption, runImageCommand } from './image-command.ts'

// publishes a checked cache release to the site's bucket and appends it to the tracked publication
// ledger; `--dry-run` stops at the upload plan. The lock is the one build and activate take

const NAME = 'images sync'

export function imagesSync(context: CliContext): Promise<number> {
	return runImageCommand(context, NAME, async () => {
		const releaseId = releaseOption(context)
		if (releaseId === undefined) throw new Error('--release <id> names the release to publish')
		const config = loadImageConfig(context.root)
		const publicOrigin = bucketOrigin(config)
		const client = await openBucket(context, { readOnly: false })
		const summary = await withLock(imagesCacheDir(context.root), () =>
			syncRelease({
				releaseId,
				releaseDir: releaseDirPath(context.root, releaseId),
				config,
				root: context.root,
				client,
				publicOrigin,
				dryRun: flagOption(context, '--dry-run'),
			}),
		)
		if (summary.dryRun) {
			context.out(`${NAME} --dry-run OK (local integrity passed)`)
			context.out(`  release:         ${releaseId}`)
			context.out(`  total objects:   ${summary.total}`)
			context.out(`  already present: ${summary.alreadyPresent}`)
			context.out(`  would upload:    ${summary.plannedUploads.length}`)
			for (const key of summary.plannedUploads) context.out(`      + ${key}`)
			return 0
		}
		context.out(`${NAME} OK`)
		context.out(`  release:  ${releaseId}`)
		context.out(`  uploaded: ${summary.uploaded}`)
		context.out(`  verified: ${summary.verified}`)
		context.out(
			`  ledger:   ${label(context, ledgerPath(context.root))} (${summary.ledgerAppended ? 'appended' : 'unchanged'})`,
		)
		return 0
	})
}
