import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import path from 'node:path'

import sharp from 'sharp'

import { listMediaFiles, mediaDirectory } from '../../packages/core/src/cli/image-files.ts'
import {
	computeConfigDigest,
	loadImageConfig,
} from '../../packages/core/src/lib/images/build/config.ts'
import {
	buildPhotoLadder,
	type BuiltFile,
} from '../../packages/core/src/lib/images/build/engine.ts'
import { createWatermarkResolver } from '../../packages/core/src/lib/images/build/watermark-source.ts'
import {
	parseManifestV3,
	type PhotoManifestEntry,
} from '../../packages/core/src/lib/images/manifest.ts'
import {
	buildImagePublicConfig,
	IMAGES_PUBLIC_RELATIVE_PATH,
	serializeImagePublicConfig,
} from '../../packages/core/src/lib/images/public-config.ts'
import {
	buildReleaseDescriptor,
	RELEASE_DESCRIPTOR_RELATIVE_PATH,
	serializeReleaseDescriptor,
} from '../../packages/core/src/lib/images/release.ts'

// procedural masters of the demo photos, cut by the core's derivative engine. Masters are computed
// in memory and never stored. Their pixels come from integer arithmetic, products and square roots
// only (no trigonometry or powers, no text, whose fonts depend on the machine), so they are the same
// everywhere; the encoded master and its AVIF and WebP derivatives are deterministic for one sharp
// version and platform

export type Rgb = readonly [number, number, number]

// `gradient` is a sky over a ground with a soft sun, `geometry` overlapping flat shapes
export type MasterPattern = 'gradient' | 'geometry'

export type DemoMaster = {
	id: string
	width: number
	height: number
	pattern: MasterPattern
	palette: readonly [Rgb, Rgb, Rgb, Rgb]
}

export const DEMO_MASTERS: readonly DemoMaster[] = [
	{
		id: 'amber-dunes',
		width: 2400,
		height: 1600,
		pattern: 'gradient',
		palette: [
			[244, 196, 128],
			[226, 120, 72],
			[150, 86, 54],
			[64, 38, 30],
		],
	},
	{
		id: 'quiet-tower',
		width: 1600,
		height: 2400,
		pattern: 'geometry',
		palette: [
			[214, 226, 232],
			[46, 92, 128],
			[232, 178, 64],
			[30, 40, 52],
		],
	},
	{
		id: 'still-square',
		width: 2000,
		height: 2000,
		pattern: 'geometry',
		palette: [
			[238, 230, 214],
			[196, 74, 58],
			[62, 118, 96],
			[40, 36, 44],
		],
	},
	{
		id: 'long-horizon',
		width: 2400,
		height: 800,
		pattern: 'gradient',
		palette: [
			[150, 186, 224],
			[236, 212, 196],
			[88, 110, 132],
			[36, 48, 62],
		],
	},
	{
		id: 'wide-tide',
		width: 2400,
		height: 1350,
		pattern: 'gradient',
		palette: [
			[34, 58, 98],
			[222, 142, 120],
			[30, 92, 110],
			[12, 30, 44],
		],
	},
	{
		id: 'graphite-lines',
		width: 2100,
		height: 1400,
		pattern: 'geometry',
		palette: [
			[226, 226, 226],
			[40, 40, 40],
			[128, 128, 128],
			[12, 12, 12],
		],
	},
]

const CHANNELS = 3

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const square = (value: number): number => value * value

// a soft edge of about two pixels, so shapes are antialiased
const smoothstep = (edge0: number, edge1: number, value: number): number => {
	const t = clamp01((value - edge0) / (edge1 - edge0))
	return t * t * (3 - 2 * t)
}

const mix = (from: Rgb, to: Rgb, amount: number): Rgb => [
	from[0] + (to[0] - from[0]) * amount,
	from[1] + (to[1] - from[1]) * amount,
	from[2] + (to[2] - from[2]) * amount,
]

// a fixed integer hash of the pixel position: a faint grain that keeps smooth gradients from banding
const grain = (x: number, y: number): number => {
	let hash = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)
	hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d)
	return ((hash >>> 24) & 7) - 3.5
}

type PixelShader = (x: number, y: number) => Rgb

const SUNLIGHT: Rgb = [255, 246, 228]

function gradientShader(master: DemoMaster): PixelShader {
	const [sky, glow, land, deep] = master.palette
	const { width, height } = master
	const horizon = height * 0.62
	const sunX = width * 0.68
	const sunY = height * 0.5
	const sunRadius = Math.min(width, height) * 0.09
	const sun = mix(glow, SUNLIGHT, 0.45)
	const edge = 2
	return (x, y) => {
		if (y >= horizon) return mix(land, deep, (y - horizon) / (height - horizon))
		const depth = y / horizon
		const base = mix(sky, glow, depth * depth)
		const distance = Math.sqrt(square(x - sunX) + square(y - sunY))
		const halo = square(clamp01(1 - distance / (sunRadius * 4))) * 0.35
		const disc = 1 - smoothstep(sunRadius - edge, sunRadius + edge, distance)
		return mix(base, sun, Math.max(disc, halo) * smoothstep(horizon, horizon - edge, y))
	}
}

function geometryShader(master: DemoMaster): PixelShader {
	const [paper, primary, secondary, ink] = master.palette
	const { width, height } = master
	const unit = Math.min(width, height)
	const circleX = width * 0.38
	const circleY = height * 0.42
	const circleRadius = unit * 0.28
	// a band along the direction (0.8, 0.6), a 3-4-5 rotation that needs no trigonometry
	const bandOffset = width * 0.5 * 0.6 - height * 0.55 * 0.8
	const bandHalf = unit * 0.07
	const rectLeft = width * 0.56
	const rectTop = height * 0.18
	const rectRight = width * 0.86
	const rectBottom = height * 0.74
	const edge = 2
	return (x, y) => {
		let color: Rgb = mix(paper, primary, (y / height) * 0.12)
		const rect =
			smoothstep(rectLeft - edge, rectLeft + edge, x) *
			smoothstep(rectRight + edge, rectRight - edge, x) *
			smoothstep(rectTop - edge, rectTop + edge, y) *
			smoothstep(rectBottom + edge, rectBottom - edge, y)
		color = mix(color, secondary, rect)
		const distance = Math.sqrt(square(x - circleX) + square(y - circleY))
		color = mix(
			color,
			primary,
			1 - smoothstep(circleRadius - edge, circleRadius + edge, distance),
		)
		const band = Math.abs(x * 0.6 - y * 0.8 - bandOffset)
		return mix(color, ink, (1 - smoothstep(bandHalf - edge, bandHalf + edge, band)) * 0.85)
	}
}

const SHADERS: Record<MasterPattern, (master: DemoMaster) => PixelShader> = {
	gradient: gradientShader,
	geometry: geometryShader,
}

export function renderMasterPixels(master: DemoMaster): Buffer {
	const shade = SHADERS[master.pattern](master)
	const pixels = Buffer.alloc(master.width * master.height * CHANNELS)
	for (let y = 0; y < master.height; y += 1) {
		for (let x = 0; x < master.width; x += 1) {
			const color = shade(x + 0.5, y + 0.5)
			const noise = grain(x, y)
			const offset = (y * master.width + x) * CHANNELS
			for (let channel = 0; channel < CHANNELS; channel += 1)
				pixels[offset + channel] = Math.round(
					Math.min(255, Math.max(0, color[channel]! + noise)),
				)
		}
	}
	return pixels
}

// the master is a lossless PNG, the input the engine takes from a real archive
export function renderMaster(master: DemoMaster): Promise<Buffer> {
	return sharp(renderMasterPixels(master), {
		raw: { width: master.width, height: master.height, channels: CHANNELS },
	})
		.png()
		.toBuffer()
}

export type DemoImages = {
	publicPath: string
	files: BuiltFile[]
	releaseJson: string
	publicJson: string
	warnings: string[]
}

// reads only the site's image config and its watermark; writes nothing
export async function buildDemoImages(
	siteRoot: string,
	masters: readonly DemoMaster[] = DEMO_MASTERS,
): Promise<DemoImages> {
	const config = loadImageConfig(siteRoot)
	if (config.publicPath === undefined)
		throw new Error(
			'site.yaml: images.publicOrigin is set; the demo serves its images from publicPath',
		)
	const resolveWatermark = createWatermarkResolver({ config, siteRoot })
	const photos: Record<string, PhotoManifestEntry> = {}
	const files: BuiltFile[] = []
	const warnings: string[] = []
	for (const master of masters) {
		const ladder = await buildPhotoLadder({
			photoId: master.id,
			masterBytes: await renderMaster(master),
			config,
			resolveWatermark,
		})
		photos[master.id] = ladder.entry
		files.push(...ladder.files)
		warnings.push(...ladder.warnings.map((warning) => `${master.id}: ${warning}`))
	}
	const manifest = parseManifestV3({
		schemaVersion: 3,
		configDigest: computeConfigDigest(config),
		photos,
	})
	return {
		publicPath: config.publicPath,
		files,
		releaseJson: serializeReleaseDescriptor(buildReleaseDescriptor({ active: true, manifest })),
		publicJson: serializeImagePublicConfig(buildImagePublicConfig(config)),
		warnings,
	}
}

function readIfExists(file: string): Buffer | undefined {
	try {
		return readFileSync(file)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
		throw error
	}
}

// a temp file and a rename, so a reader never sees a half-written file; equal bytes are left alone
function writeAtomic(file: string, bytes: Buffer | string): boolean {
	const existing = readIfExists(file)
	if (existing?.equals(Buffer.from(bytes))) return false
	mkdirSync(path.dirname(file), { recursive: true })
	const temp = `${file}.tmp`
	writeFileSync(temp, bytes)
	renameSync(temp, file)
	return true
}

function removeEmptyDirectories(directory: string, root: string): void {
	for (const entry of readdirSync(directory, { withFileTypes: true }))
		if (entry.isDirectory()) removeEmptyDirectories(path.join(directory, entry.name), root)
	if (directory !== root && readdirSync(directory).length === 0) rmdirSync(directory)
}

export type WrittenDemoImages = {
	directory: string
	written: number
	removed: string[]
}

// derivatives first, then the release that names them, then the files no release names any more
export function writeDemoImages(siteRoot: string, images: DemoImages): WrittenDemoImages {
	const directory = mediaDirectory(siteRoot, images.publicPath)
	let written = 0
	for (const file of images.files)
		if (writeAtomic(path.join(directory, file.objectKey), file.bytes)) written += 1
	if (writeAtomic(path.join(siteRoot, RELEASE_DESCRIPTOR_RELATIVE_PATH), images.releaseJson))
		written += 1
	if (writeAtomic(path.join(siteRoot, IMAGES_PUBLIC_RELATIVE_PATH), images.publicJson))
		written += 1
	const expected = new Set(images.files.map((file) => file.objectKey))
	const removed = listMediaFiles(directory).filter((file) => !expected.has(file))
	for (const file of removed) rmSync(path.join(directory, file))
	if (existsSync(directory)) removeEmptyDirectories(directory, directory)
	return { directory, written, removed }
}
