import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { siteRoot } from '../../../config/site-root.ts'
import { parseManifestV3 } from '../manifest.ts'
import { buildReleaseDescriptor } from '../release.ts'
import { computeConfigDigest, loadImageConfig } from './config.ts'
import {
	buildPhotoLadder,
	type BuiltPhotoLadder,
	computeDominantColor,
	renderDerivative,
	type RightsWriter,
} from './engine.ts'
import { sha256Bytes } from './hashing.ts'
import { computeWatermarkLayout } from './watermark.ts'
import { createWatermarkResolver } from './watermark-source.ts'

const config = loadImageConfig(siteRoot)
const resolveWatermark = createWatermarkResolver({ config, siteRoot })
const profile = config.watermark.profile

const syntheticMaster = (width: number, height: number): Promise<Buffer> =>
	sharp({ create: { width, height, channels: 3, background: { r: 30, g: 110, b: 180 } } })
		.jpeg()
		.toBuffer()

type Region = { left: number; top: number; width: number; height: number }

const pixels = async (bytes: Buffer, region: Region): Promise<Buffer> =>
	sharp(bytes).extract(region).removeAlpha().raw().toBuffer()

// the largest channel difference between a region and the image's top-left pixel
const deviation = async (bytes: Buffer, region: Region): Promise<number> => {
	const corner = await pixels(bytes, { left: 0, top: 0, width: 1, height: 1 })
	const data = await pixels(bytes, region)
	let max = 0
	for (let index = 0; index < data.length; index += 1)
		max = Math.max(max, Math.abs(data[index]! - corner[index % 3]!))
	return max
}

const metadataBlocks = async (bytes: Buffer) => {
	const meta = await sharp(bytes).metadata()
	return (['exif', 'xmp', 'iptc'] as const).filter((block) => meta[block] !== undefined)
}

describe('renderDerivative', () => {
	it('encodes the requested format and width without upscale', async () => {
		const master = await syntheticMaster(400, 300)
		const avif = await renderDerivative({
			masterBytes: master,
			targetWidth: 300,
			format: 'avif',
			quality: 50,
		})
		// sharp reports the AVIF container as heif
		expect((await sharp(avif.bytes).metadata()).format).toBe('heif')
		expect([avif.width, avif.height]).toEqual([300, 225])
		const capped = await renderDerivative({
			masterBytes: master,
			targetWidth: 4000,
			format: 'webp',
			quality: 72,
		})
		expect(capped.width).toBe(400)
	})

	it('changes the bytes when a watermark is applied', async () => {
		const options = {
			masterBytes: await syntheticMaster(1000, 600),
			targetWidth: 1000,
			format: 'webp' as const,
			quality: 72,
		}
		const bare = await renderDerivative(options)
		const marked = await renderDerivative({
			...options,
			watermark: await resolveWatermark(profile.assetId),
			watermarkSpec: profile,
		})
		expect(marked.bytes.equals(bare.bytes)).toBe(false)
		expect(marked.width).toBe(1000)
	})
})

describe('computeDominantColor', () => {
	// sharp picks the dominant colour from a 16-level-per-channel histogram, hence the tolerance
	it.each([
		[30, 110, 180],
		[200, 40, 90],
		[250, 250, 250],
		[5, 5, 5],
	])('returns rgb(%i, %i, %i) of a solid master', async (r, g, b) => {
		const master = await sharp({
			create: { width: 64, height: 64, channels: 3, background: { r, g, b } },
		})
			.png()
			.toBuffer()
		const hex = await computeDominantColor(master)
		expect(hex).toMatch(/^#[0-9a-f]{6}$/)
		const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
		channels.forEach((value, index) =>
			expect(Math.abs(value - [r, g, b][index]!)).toBeLessThanOrEqual(8),
		)
	})
})

describe('buildPhotoLadder', () => {
	let master: Buffer
	let built: BuiltPhotoLadder
	beforeAll(async () => {
		master = await syntheticMaster(3000, 2000)
		built = await buildPhotoLadder({
			photoId: 'synthetic-dawn',
			masterBytes: master,
			config,
			resolveWatermark,
		})
	}, 120_000)

	it('builds a manifest entry that the manifest and the active release accept', () => {
		const manifest = parseManifestV3({
			schemaVersion: 3,
			configDigest: computeConfigDigest(config),
			photos: { 'synthetic-dawn': built.entry },
		})
		const descriptor = buildReleaseDescriptor({ active: true, manifest })
		expect(descriptor.manifest.photos['synthetic-dawn']).toEqual(built.entry)
	})

	it('renders both formats on every planned width, capped by the long side', () => {
		const widths = [200, 400, 800, 1200, 1600, 2000]
		expect(built.entry.derivatives.map((item) => [item.width, item.format])).toEqual(
			widths.flatMap((width) => [
				[width, 'avif'],
				[width, 'webp'],
			]),
		)
		expect(built.entry).toMatchObject({
			masterSha256: sha256Bytes(master),
			sourceWidth: 3000,
			sourceHeight: 2000,
			orientation: 1,
			rightsId: config.rights.imageId,
		})
	})

	it('marks only files above the threshold and embeds no rights without a writer', () => {
		for (const item of built.entry.derivatives) {
			expect(item.watermarkProfile).toBe(
				item.width > config.watermark.aboveWidth ? profile.id : 'none',
			)
			expect(item.rightsEmbedded).toBe(false)
			expect(item.privacyChecked).toBe(true)
		}
	})

	it('draws the mark into files above the threshold and leaves the others untouched', async () => {
		const mark = await resolveWatermark(profile.assetId)
		for (const [index, item] of built.entry.derivatives.entries()) {
			const region = computeWatermarkLayout(
				item.width,
				item.height,
				mark.width,
				mark.height,
				profile,
			)
			const difference = await deviation(built.files[index]!.bytes, region)
			const label = `${item.width}/${item.format}`
			if (item.width > config.watermark.aboveWidth)
				expect(difference, label).toBeGreaterThan(40)
			else expect(difference, label).toBeLessThanOrEqual(8)
		}
	})

	it('returns each file under its object key with the hashed bytes', () => {
		expect(built.files.map((file) => file.objectKey)).toEqual(
			built.entry.derivatives.map((item) => item.objectKey),
		)
		for (const file of built.files) {
			expect(sha256Bytes(file.bytes)).toBe(file.sha256)
			expect(file.byteSize).toBe(file.bytes.length)
		}
	})

	it('renders the same bytes for the same inputs', async () => {
		const small = await syntheticMaster(1000, 700)
		const build = () =>
			buildPhotoLadder({ photoId: 'repeat', masterBytes: small, config, resolveWatermark })
		const [first, second] = [await build(), await build()]
		expect(second.entry).toEqual(first.entry)
	}, 60_000)

	it('never upscales a small master', async () => {
		const small = await buildPhotoLadder({
			photoId: 'small',
			masterBytes: await syntheticMaster(300, 200),
			config,
			resolveWatermark,
		})
		expect(small.entry.derivatives.map((item) => item.width)).toEqual([200, 200, 300, 300])
		expect(small.entry.derivatives.every((item) => item.watermarkProfile === 'none')).toBe(true)
		expect(small.warnings).toContain(
			'no-watermarked-file: no derivative exceeds the watermark threshold',
		)
	})

	it('records what an injected rights writer embeds and fails on denied fields', async () => {
		const masterBytes = await syntheticMaster(300, 200)
		const embedding: RightsWriter = async (bytes) => ({
			bytes,
			rightsEmbedded: true,
			deniedFieldsPresent: [],
		})
		const embedded = await buildPhotoLadder({
			photoId: 'rights',
			masterBytes,
			config,
			resolveWatermark,
			writeRights: embedding,
		})
		expect(embedded.entry.derivatives.every((item) => item.rightsEmbedded)).toBe(true)
		const leaking: RightsWriter = async (bytes) => ({
			bytes,
			rightsEmbedded: true,
			deniedFieldsPresent: ['GPSLatitude'],
		})
		await expect(
			buildPhotoLadder({
				photoId: 'rights',
				masterBytes,
				config,
				resolveWatermark,
				writeRights: leaking,
			}),
		).rejects.toThrow(/retains denied fields: GPSLatitude/)
	})

	it('keeps the bytes a rights writer returns, hashed and keyed as written', async () => {
		const written: { input: Buffer; output: Buffer }[] = []
		const reencoding: RightsWriter = async (bytes, { format }) => {
			const image = sharp(bytes)
			const output = await (
				format === 'avif' ? image.avif({ quality: 20 }) : image.webp({ quality: 20 })
			).toBuffer()
			written.push({ input: bytes, output })
			return { bytes: output, rightsEmbedded: true, deniedFieldsPresent: [] }
		}
		const result = await buildPhotoLadder({
			photoId: 'rewritten',
			masterBytes: await syntheticMaster(1000, 700),
			config,
			resolveWatermark,
			writeRights: reencoding,
		})
		expect(written).toHaveLength(result.files.length)
		for (const [index, file] of result.files.entries()) {
			const { input, output } = written[index]!
			const item = result.entry.derivatives[index]!
			expect(output.equals(input)).toBe(false)
			expect(file.bytes.equals(output)).toBe(true)
			expect(file.sha256).toBe(sha256Bytes(output))
			expect(file.byteSize).toBe(output.length)
			expect(item).toMatchObject({ sha256: file.sha256, byteSize: output.length })
			expect(file.objectKey).toBe(
				`rewritten/${item.width}w-${sha256Bytes(output)}.${item.format}`,
			)
			expect(item.objectKey).toBe(file.objectKey)
		}
	})

	it('bakes EXIF orientation into the pixels and the recorded size', async () => {
		// the left half is red and the right blue; orientation 6 turns the left edge to the top
		const red = { r: 220, g: 20, b: 20 }
		const blue = { r: 20, g: 20, b: 220 }
		const masterBytes = await sharp({
			create: { width: 400, height: 200, channels: 3, background: red },
		})
			.composite([
				{
					input: { create: { width: 200, height: 200, channels: 3, background: blue } },
					left: 200,
					top: 0,
				},
			])
			.withMetadata({ orientation: 6 })
			.jpeg()
			.toBuffer()
		const result = await buildPhotoLadder({
			photoId: 'oriented',
			masterBytes,
			config,
			resolveWatermark,
		})
		expect(result.entry).toMatchObject({ sourceWidth: 200, sourceHeight: 400, orientation: 6 })
		parseManifestV3({
			schemaVersion: 3,
			configDigest: computeConfigDigest(config),
			photos: { oriented: result.entry },
		})
		for (const [index, item] of result.entry.derivatives.entries()) {
			expect([item.width, item.height]).toEqual([200, 400])
			const bytes = result.files[index]!.bytes
			const top = await pixels(bytes, { left: 100, top: 50, width: 1, height: 1 })
			const bottom = await pixels(bytes, { left: 100, top: 350, width: 1, height: 1 })
			expect(top[0]!).toBeGreaterThan(top[2]! + 100)
			expect(bottom[2]!).toBeGreaterThan(bottom[0]! + 100)
		}
	})

	it('drops the master metadata from every file without a rights writer', async () => {
		const masterBytes = await sharp({
			create: { width: 300, height: 200, channels: 3, background: { r: 90, g: 90, b: 90 } },
		})
			.withExif({ IFD0: { Copyright: 'private owner', Artist: 'private owner' } })
			.withXmp(
				'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="private owner"/></rdf:RDF></x:xmpmeta>',
			)
			.jpeg()
			.toBuffer()
		expect(await metadataBlocks(masterBytes)).toEqual(['exif', 'xmp'])
		const result = await buildPhotoLadder({
			photoId: 'sanitized',
			masterBytes,
			config,
			resolveWatermark,
		})
		expect(result.entry.derivatives.map((item) => item.format)).toEqual([
			'avif',
			'webp',
			'avif',
			'webp',
		])
		for (const file of result.files) expect(await metadataBlocks(file.bytes)).toEqual([])
	})

	it('rejects a photo id the manifest would not accept', async () => {
		await expect(
			buildPhotoLadder({
				photoId: 'Not Kebab',
				masterBytes: await syntheticMaster(300, 200),
				config,
				resolveWatermark,
			}),
		).rejects.toThrow(/kebab-case/)
	})
})
