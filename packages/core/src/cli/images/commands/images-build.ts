import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { KEBAB_CASE_PATTERN } from '../../../config/kebab-case.ts'
import { loadPlacesConfig } from '../../../lib/content/files.ts'
import { computeConfigDigest, loadImageConfig } from '../../../lib/images/build/config.ts'
import { buildPhotoLadder } from '../../../lib/images/build/engine.ts'
import { createWatermarkResolver } from '../../../lib/images/build/watermark-source.ts'
import { type Manifest, parseManifestV3, serializeManifest } from '../../../lib/images/manifest.ts'
import {
	IMAGE_RELEASES_RELATIVE_PATH,
	releaseDirPath,
	releaseManifestPath,
} from '../../../lib/images/release.ts'
import { type CliContext, stringOption } from '../../context.ts'
import { assertCacheWithinRoot, imagesCacheDir } from '../cache-path.ts'
import { contentPhotoIds, photoPlaceId, readContentPhoto } from '../content-photos.ts'
import { resolveExternalRoots } from '../external-roots.ts'
import { gpsPlaceWarning, proposePlaceId } from '../gps-place.ts'
import { withLock } from '../locking.ts'
import { loadMastersRegistry } from '../masters.ts'
import { createRightsWriter, readMasterGps } from '../metadata.ts'
import { loadPlaceGpsBounds } from '../place-gps-bounds.ts'
import { swapRelease } from '../release-fs.ts'
import { masterRequestFromSource, resolveMaster } from '../source-resolver.ts'
import { validateCandidateRelease } from '../validate-candidate.ts'
import { releaseOption, runImageCommand } from './image-command.ts'

// cuts a candidate release (the manifest and the derivatives with their XMP rights) into the ignored
// `.cache/images/releases/<id>/` and never touches the release descriptor; `images activate` does.
// Without `--photos` every photo of the content is built, without `--release` the id is the UTC time

const NAME = 'images build'

// `20261115-142600`: sortable and kebab-case
export const timestampReleaseId = (now: Date): string =>
	now
		.toISOString()
		.replace(/\.\d+Z$/, '')
		.replace(/[-:]/g, '')
		.replace('T', '-')

function photoIdsOption(context: CliContext): string[] | undefined {
	const value = stringOption(context, '--photos')
	if (value === undefined) return undefined
	const ids = value
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean)
	if (ids.length === 0) throw new Error('--photos names no photo')
	return ids
}

function assertPhotoIds(ids: readonly string[]): void {
	if (ids.length === 0) throw new Error('the site has no photos to build')
	const seen = new Set<string>()
	for (const id of ids) {
		if (!KEBAB_CASE_PATTERN.test(id))
			throw new Error(`invalid photo id "${id}" (expected a kebab-case id)`)
		if (seen.has(id)) throw new Error(`duplicate photo id "${id}"`)
		seen.add(id)
	}
}

export function imagesBuild(context: CliContext): Promise<number> {
	return runImageCommand(context, NAME, async () => {
		const { root } = context
		const roots = resolveExternalRoots(context)
		const releaseId = releaseOption(context) ?? timestampReleaseId(new Date())
		const photoIds = photoIdsOption(context) ?? contentPhotoIds(root)
		assertPhotoIds(photoIds)

		const config = loadImageConfig(root)
		const registry = await loadMastersRegistry(root)
		const bounds = await loadPlaceGpsBounds(root)
		const places = bounds === undefined ? [] : await loadPlacesConfig(root)
		const resolveWatermark = createWatermarkResolver({ config, siteRoot: root })

		const releaseDir = releaseDirPath(root, releaseId)
		const stagingDir = releaseDirPath(root, `.staging-${releaseId}`)
		const backupDir = releaseDirPath(root, `.backup-${releaseId}`)
		const photos: Manifest['photos'] = {}
		const warnings: string[] = []
		let derivativeCount = 0

		// a concurrent build or sync fails fast, and an abandoned lease is recoverable
		await withLock(imagesCacheDir(root), async () => {
			for (const dir of [releaseDir, stagingDir, backupDir])
				await assertCacheWithinRoot(dir, root)
			await rm(stagingDir, { recursive: true, force: true })
			await mkdir(stagingDir, { recursive: true })
			const writeRights = createRightsWriter(stagingDir)

			for (const photoId of photoIds) {
				const photo = readContentPhoto(root, photoId)
				const master = await resolveMaster(masterRequestFromSource(photoId, photo.data), {
					...roots,
					registry,
					config,
				})
				if (bounds !== undefined) {
					const gps = await readMasterGps(master.masterPath)
					const placeId = photoPlaceId(photo)
					const warning =
						gps &&
						gpsPlaceWarning(
							proposePlaceId(gps, bounds, places, { approvedPlaceId: placeId }),
							placeId,
						)
					if (warning) warnings.push(`${photoId}: ${warning}`)
				}
				const built = await buildPhotoLadder({
					photoId,
					masterBytes: await readFile(master.masterPath),
					config,
					resolveWatermark,
					writeRights,
				})
				for (const warning of built.warnings) warnings.push(`${photoId}: ${warning}`)
				for (const file of built.files) {
					const target = path.join(stagingDir, file.objectKey)
					await mkdir(path.dirname(target), { recursive: true })
					await writeFile(target, file.bytes)
				}
				photos[photoId] = built.entry
				derivativeCount += built.files.length
			}

			const manifest = parseManifestV3({
				schemaVersion: 3,
				configDigest: computeConfigDigest(config),
				photos,
			})
			// on the final manifest too, to catch drift between the input checks and the emitter
			validateCandidateRelease(manifest)
			await writeFile(releaseManifestPath(stagingDir), serializeManifest(manifest), 'utf8')
			// the previous release is restored from its backup if the swap fails
			await swapRelease(stagingDir, releaseDir, backupDir)
		})

		context.out(`${NAME} OK`)
		context.out(`  release:     ${releaseId}`)
		context.out(`  photos:      ${photoIds.length}`)
		context.out(`  derivatives: ${derivativeCount}`)
		context.out(`  output:      ${IMAGE_RELEASES_RELATIVE_PATH}/${releaseId}/`)
		for (const warning of warnings) context.out(`  warning:     ${warning}`)
		return 0
	})
}
