import type { Manifest } from '../../../lib/images/manifest.ts'
import {
	loadManifestFile,
	loadReleaseDescriptor,
	releaseDirPath,
	releaseManifestPath,
} from '../../../lib/images/release.ts'
import type { CliContext } from '../../context.ts'
import { openBucket } from '../bucket.ts'
import { planPrune } from '../prune.ts'
import { releaseOption, runImageCommand } from './image-command.ts'

// report-only: lists the bucket read-only and prints the objects no manifest references, deleting
// nothing. The release descriptor's manifest is always referenced, since the site serves it; with
// `--release` the manifest of that cache release is referenced too

const NAME = 'images prune'

function subjectManifests(context: CliContext): { subject: string; manifests: Manifest[] } {
	const served = loadReleaseDescriptor(context.root).descriptor.manifest
	const releaseId = releaseOption(context)
	if (releaseId === undefined) return { subject: 'the release descriptor', manifests: [served] }
	return {
		subject: `release ${releaseId} and the release descriptor`,
		manifests: [
			loadManifestFile(releaseManifestPath(releaseDirPath(context.root, releaseId))).manifest,
			served,
		],
	}
}

export function imagesPrune(context: CliContext): Promise<number> {
	return runImageCommand(context, NAME, async () => {
		const { subject, manifests } = subjectManifests(context)
		const client = await openBucket(context, { readOnly: true })
		const report = await planPrune({ manifests, client })
		context.out(`${NAME} REPORT (nothing is deleted)`)
		context.out(`  manifests:        ${subject}`)
		context.out(`  referenced keys:  ${report.referencedCount}`)
		context.out(`  remote objects:   ${report.remoteCount}`)
		context.out(`  orphans:          ${report.orphans.length}`)
		for (const key of report.orphans) context.out(`      ? ${key}`)
		context.out(`  missing remotely: ${report.missing.length}`)
		for (const key of report.missing) context.out(`      - ${key}`)
		return 0
	})
}
