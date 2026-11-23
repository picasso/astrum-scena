import { readFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { type ImageConfig, loadImageConfig } from '../../../lib/images/build/config.ts'
import { renderDerivative } from '../../../lib/images/build/engine.ts'
import { computeWatermarkLayout } from '../../../lib/images/build/watermark.ts'
import { createWatermarkResolver } from '../../../lib/images/build/watermark-source.ts'
import type { Manifest } from '../../../lib/images/manifest.ts'
import {
	loadManifestFile,
	readManifestJson,
	releaseDirPath,
	releaseManifestPath,
} from '../../../lib/images/release.ts'
import { type CliContext, flagOption, stringOption } from '../../context.ts'
import { readContentPhoto } from '../content-photos.ts'
import { resolveExternalRoots } from '../external-roots.ts'
import { validateLadderManifest } from '../ladder-policy.ts'
import { summarizeLadder, summarizeRelease } from '../ladder-report.ts'
import { loadMastersRegistry } from '../masters.ts'
import { masterRequestFromSource, resolveMaster } from '../source-resolver.ts'
import { assertReleaseId, releaseOption, runImageCommand } from './image-command.ts'

// the width ladder of a release: the policy check, its size, an optional comparison with another
// release, and with `--pixels` a replay of every derivative from its master (the roots come from the
// environment), which proves the pixels and the watermark

const NAME = 'images ladder-report'

const rawPixels = (bytes: Buffer): Promise<Buffer> => sharp(bytes).removeAlpha().raw().toBuffer()

async function verifyPixels(
	context: CliContext,
	releaseDir: string,
	manifest: Manifest,
	config: ImageConfig,
): Promise<number> {
	const { root } = context
	const roots = resolveExternalRoots({ ...context, options: {} })
	const registry = await loadMastersRegistry(root)
	const resolveWatermark = createWatermarkResolver({ config, siteRoot: root })
	const profile = config.watermark.profile
	const spec = {
		scale: profile.scale,
		minPx: profile.minPx,
		maxPx: profile.maxPx,
		position: profile.position,
		inset: profile.inset,
		opacity: profile.opacity,
	}
	const watermark = await resolveWatermark(profile.assetId)
	let verified = 0
	for (const [photoId, photo] of Object.entries(manifest.photos)) {
		const request = masterRequestFromSource(photoId, readContentPhoto(root, photoId).data)
		const master = await resolveMaster(request, { ...roots, registry, config })
		if (master.masterSha256 !== photo.masterSha256)
			throw new Error(`${photoId}: master hash drift`)
		const masterBytes = await readFile(master.masterPath)
		for (const derivative of photo.derivatives) {
			const band = config.ladder.quality.find(
				(value) => value.upTo === undefined || derivative.width <= value.upTo,
			)
			if (!band) throw new Error(`${photoId}: missing quality band`)
			const marked = derivative.width > config.watermark.aboveWidth
			const options = {
				masterBytes,
				targetWidth: derivative.width,
				format: derivative.format,
				quality: band[derivative.format],
			}
			const expected = await renderDerivative({
				...options,
				...(marked ? { watermark, watermarkSpec: spec } : {}),
			})
			const actual = await rawPixels(
				await readFile(path.join(releaseDir, derivative.objectKey)),
			)
			const where = `${photoId}/${derivative.width}/${derivative.format}`
			if (!(await rawPixels(expected.bytes)).equals(actual))
				throw new Error(`${where}: pixel replay differs`)
			if (marked) {
				const cleanPixels = await rawPixels((await renderDerivative(options)).bytes)
				const layout = computeWatermarkLayout(
					expected.width,
					expected.height,
					watermark.width,
					watermark.height,
					spec,
				)
				let changed = false
				for (let y = layout.top; y < layout.top + layout.height && !changed; y += 1) {
					for (let x = layout.left; x < layout.left + layout.width && !changed; x += 1) {
						const offset = (y * expected.width + x) * 3
						changed =
							actual[offset] !== cleanPixels[offset] ||
							actual[offset + 1] !== cleanPixels[offset + 1] ||
							actual[offset + 2] !== cleanPixels[offset + 2]
					}
				}
				if (!changed) throw new Error(`${where}: no watermark pixels`)
			}
			verified += 1
		}
	}
	return verified
}

export function imagesLadderReport(context: CliContext): Promise<number> {
	return runImageCommand(context, NAME, async () => {
		const releaseId = releaseOption(context)
		if (releaseId === undefined) throw new Error('--release <id> names the release to report')
		const compareOption = stringOption(context, '--compare')
		const compare =
			compareOption === undefined ? undefined : assertReleaseId(compareOption, '--compare')
		const config = loadImageConfig(context.root)
		const releaseDir = releaseDirPath(context.root, releaseId)
		const { manifest } = loadManifestFile(releaseManifestPath(releaseDir))
		const policyErrors = validateLadderManifest(manifest, config)
		if (policyErrors.length > 0) throw new Error(policyErrors.join('; '))
		const report = summarizeLadder(manifest, config)
		if (report.duplicates.length > 0)
			throw new Error(`duplicate width/format: ${report.duplicates.join(', ')}`)
		context.out(`${NAME} ${releaseId}`)
		context.out(`  photos: ${report.photos}; files: ${report.files}; bytes: ${report.bytes}`)
		context.out(`  no watermarked file: ${report.withoutWatermark.join(', ') || '(none)'}`)
		if (compare !== undefined) {
			const previous = readManifestJson(
				releaseManifestPath(releaseDirPath(context.root, compare)),
			)
			const old = summarizeRelease(previous.parsed)
			context.out(`  compare ${compare}: ${old.files} files, ${old.bytes} bytes`)
			context.out(
				`  delta: ${report.files - old.files} files, ${report.bytes - old.bytes} bytes`,
			)
		}
		if (flagOption(context, '--pixels')) {
			const verified = await verifyPixels(context, releaseDir, manifest, config)
			context.out(`  pixel replay: ${verified} files, diff 0`)
		}
		return 0
	})
}
