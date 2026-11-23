import sharp, { type Sharp } from 'sharp'

import { KEBAB_CASE_PATTERN } from '../../../config/kebab-case.ts'
import type { PhotoManifestEntry } from '../manifest.ts'
import type { ImageConfig, ImageFormat } from './config.ts'
import { ladderObjectKey, sha256Bytes } from './hashing.ts'
import { planLadderWidths } from './ladder.ts'
import { loadOriented } from './transform.ts'
import {
	composeWatermark,
	computeWatermarkLayout,
	type NormalizedWatermark,
	type WatermarkComposeSpec,
} from './watermark.ts'
import type { WatermarkResolver } from './watermark-source.ts'

// the derivative engine: one master buffer in, the manifest entry and the encoded files out. It
// writes nothing; staging, file names on disk and upload belong to the caller

export type RightsEmbedding = {
	bytes: Buffer
	rightsEmbedded: boolean
	deniedFieldsPresent: readonly string[]
}

// embeds rights metadata into an encoded derivative and reports what the result carries
export type RightsWriter = (
	bytes: Buffer,
	options: {
		format: ImageFormat
		rights: ImageConfig['rights']
		deniedFields: readonly string[]
	},
) => Promise<RightsEmbedding>

export type BuiltFile = {
	objectKey: string
	bytes: Buffer
	sha256: string
	byteSize: number
}

export type BuiltPhotoLadder = {
	entry: PhotoManifestEntry
	files: BuiltFile[]
	warnings: string[]
}

function encodeTo(image: Sharp, format: ImageFormat, quality: number): Promise<Buffer> {
	return format === 'avif'
		? image.avif({ quality }).toBuffer()
		: image.webp({ quality }).toBuffer()
}

function hex2(value: number): string {
	return Math.max(0, Math.min(255, Math.round(value)))
		.toString(16)
		.padStart(2, '0')
}

// sampled before the watermark so the placeholder reflects the photo, not the mark
export async function computeDominantColor(masterBytes: Buffer): Promise<string> {
	const { dominant } = await sharp(masterBytes, { failOn: 'none' })
		.rotate()
		.toColourspace('srgb')
		.stats()
	return `#${hex2(dominant.r)}${hex2(dominant.g)}${hex2(dominant.b)}`
}

// every width resizes from the full master, not a smaller rung, so quality does not degrade step by
// step; sharp drops the master's metadata on output
export async function renderDerivative(options: {
	masterBytes: Buffer
	targetWidth: number
	format: ImageFormat
	quality: number
	watermark?: NormalizedWatermark
	watermarkSpec?: WatermarkComposeSpec
}): Promise<{ bytes: Buffer; width: number; height: number }> {
	const resized = await sharp(options.masterBytes, { failOn: 'none' })
		.rotate()
		.toColourspace('srgb')
		// a backstop: ladder widths already never exceed the source width
		.resize({ width: options.targetWidth, withoutEnlargement: true })
		.png()
		.toBuffer({ resolveWithObject: true })

	const width = resized.info.width
	const height = resized.info.height

	let pixels: Buffer = resized.data
	if (options.watermark && options.watermarkSpec) {
		const layout = computeWatermarkLayout(
			width,
			height,
			options.watermark.width,
			options.watermark.height,
			options.watermarkSpec,
		)
		pixels = await composeWatermark(
			pixels,
			options.watermark,
			layout,
			options.watermarkSpec.opacity,
		)
	}

	const bytes = await encodeTo(sharp(pixels, { failOn: 'none' }), options.format, options.quality)
	return { bytes, width, height }
}

// without a rights writer nothing is embedded, so the privacy check is that the file carries no
// metadata block at all
async function withoutRights(bytes: Buffer, label: string): Promise<RightsEmbedding> {
	const meta = await sharp(bytes).metadata()
	const blocks = (['exif', 'xmp', 'iptc'] as const).filter((block) => meta[block] !== undefined)
	if (blocks.length > 0) {
		throw new Error(
			`derivative ${label} carries ${blocks.join(', ')} metadata with no rights writer`,
		)
	}
	return { bytes, rightsEmbedded: false, deniedFieldsPresent: [] }
}

export async function buildPhotoLadder(input: {
	photoId: string
	masterBytes: Buffer
	config: ImageConfig
	resolveWatermark: WatermarkResolver
	writeRights?: RightsWriter
}): Promise<BuiltPhotoLadder> {
	const { photoId, masterBytes, config } = input
	if (!KEBAB_CASE_PATTERN.test(photoId))
		throw new Error(`photo id "${photoId}" is not kebab-case`)
	const masterSha256 = sha256Bytes(masterBytes)
	const source = await loadOriented(masterBytes)
	const plan = planLadderWidths(config, source.width, source.height)
	const dominantColor = await computeDominantColor(masterBytes)
	const profile = config.watermark.profile
	const watermark = await input.resolveWatermark(profile.assetId)
	const watermarkSpec: WatermarkComposeSpec = {
		scale: profile.scale,
		minPx: profile.minPx,
		maxPx: profile.maxPx,
		position: profile.position,
		inset: profile.inset,
		opacity: profile.opacity,
	}
	const derivatives: PhotoManifestEntry['derivatives'] = []
	const files: BuiltFile[] = []
	for (const width of plan.widths) {
		const band = config.ladder.quality.find(
			(candidate) => candidate.upTo === undefined || width <= candidate.upTo,
		)
		if (!band) throw new Error(`no quality band for ${width}px`)
		const marked = width > config.watermark.aboveWidth
		for (const format of [...config.formats].sort()) {
			const rendered = await renderDerivative({
				masterBytes,
				targetWidth: width,
				format,
				quality: band[format],
				...(marked ? { watermark, watermarkSpec } : {}),
			})
			const embedding = input.writeRights
				? await input.writeRights(rendered.bytes, {
						format,
						rights: config.rights,
						deniedFields: config.privacy.deniedFields,
					})
				: await withoutRights(rendered.bytes, `${width}/${format}`)
			if (embedding.deniedFieldsPresent.length > 0) {
				throw new Error(
					`derivative ${width}/${format} retains denied fields: ${embedding.deniedFieldsPresent.join(', ')}`,
				)
			}
			const finalBytes = embedding.bytes
			const meta = await sharp(finalBytes).metadata()
			const validFormat = format === 'avif' ? meta.format === 'heif' : meta.format === 'webp'
			if (!validFormat || meta.width !== rendered.width || meta.height !== rendered.height) {
				throw new Error(`derivative ${width}/${format} changed after rights metadata`)
			}
			const hash = sha256Bytes(finalBytes)
			if (hash === masterSha256) {
				throw new Error(`derivative ${width}/${format} equals the master`)
			}
			const objectKey = ladderObjectKey(photoId, rendered.width, format, hash)
			derivatives.push({
				width: rendered.width,
				height: rendered.height,
				format,
				objectKey,
				sha256: hash,
				byteSize: finalBytes.length,
				rightsEmbedded: embedding.rightsEmbedded,
				privacyChecked: true,
				watermarkProfile: marked ? profile.id : 'none',
			})
			files.push({ objectKey, bytes: finalBytes, sha256: hash, byteSize: finalBytes.length })
		}
	}
	return {
		entry: {
			masterSha256,
			sourceWidth: source.width,
			sourceHeight: source.height,
			orientation: source.orientation,
			dominantColor,
			rightsId: config.rights.imageId,
			derivatives,
		},
		files,
		warnings: plan.warnings,
	}
}
