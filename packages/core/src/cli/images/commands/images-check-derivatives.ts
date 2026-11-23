import { loadImageConfig } from '../../../lib/images/build/config.ts'
import { loadReleaseDescriptor, releaseDirPath } from '../../../lib/images/release.ts'
import type { CliContext } from '../../context.ts'
import { checkRelease, findReleaseOfManifest } from '../check-derivatives.ts'
import { releaseOption, runImageCommand, siteRelative } from './image-command.ts'

// the offline gate of a cache release: its manifest and its files match in both directions, and the
// rights and privacy metadata read back with the real exiftool; the bucket is never contacted.
// Without `--release` it checks the release the active descriptor was taken from: the cache release
// whose manifest is the descriptor's, byte for byte

const NAME = 'images check-derivatives'

async function subjectRelease(context: CliContext): Promise<string | undefined> {
	const releaseId = releaseOption(context)
	if (releaseId !== undefined) return releaseId
	const { descriptor } = loadReleaseDescriptor(context.root)
	if (!descriptor.active) return undefined
	const found = await findReleaseOfManifest(context.root, descriptor.manifest)
	if (found === undefined)
		throw new Error(
			'no cache release matches the active release descriptor; name one with --release <id>',
		)
	return found
}

export function imagesCheckDerivatives(context: CliContext): Promise<number> {
	return runImageCommand(context, NAME, async () => {
		const releaseId = await subjectRelease(context)
		if (releaseId === undefined) {
			context.out(`${NAME} OK (the release descriptor is inactive; nothing to check)`)
			return 0
		}
		const result = await checkRelease({
			releaseDir: releaseDirPath(context.root, releaseId),
			config: loadImageConfig(context.root),
			root: context.root,
		})
		if (!result.ok) {
			context.err(`${NAME} FAILED (${releaseId}, ${result.errors.length} problem(s)):`)
			for (const error of result.errors) context.err(`  - ${siteRelative(context, error)}`)
			return 1
		}
		context.out(`${NAME} OK`)
		context.out(`  release:     ${releaseId}`)
		context.out(`  derivatives: ${result.derivativeCount}`)
		return 0
	})
}
