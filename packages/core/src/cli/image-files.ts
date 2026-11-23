import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { computeConfigDigest, loadImageConfig } from '../lib/images/build/config.ts'
import { loadImagePublicConfig } from '../lib/images/public-config.ts'
import { loadReleaseDescriptor } from '../lib/images/release.ts'

// a site that serves its images itself keeps the derivatives under `public/<publicPath>/<objectKey>`,
// where Astro copies them into the build as they are

export const PUBLIC_DIR = 'public'

export function mediaDirectory(siteRoot: string, publicPath: string): string {
	return path.join(siteRoot, PUBLIC_DIR, ...publicPath.split('/').filter(Boolean))
}

// every file under the directory as a `/`-separated path relative to it, sorted
export function listMediaFiles(directory: string): string[] {
	if (!existsSync(directory)) return []
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => !entry.isDirectory())
		.map((entry) =>
			path
				.relative(directory, path.join(entry.parentPath, entry.name))
				.split(path.sep)
				.join('/'),
		)
		.sort()
}

export type ImageFilesReport =
	| { kind: 'external'; origin: string }
	| {
			kind: 'site'
			directory: string
			// the release was cut with another `images` section of `site.yaml`
			stale: boolean
			checked: number
			missing: string[]
			changed: string[]
			extra: string[]
	  }

// compares the files on disk with the derivatives of the tracked release; it never regenerates them,
// since AVIF and WebP bytes may differ between platforms
export function verifyImageFiles(siteRoot: string): ImageFilesReport {
	const { config } = loadImagePublicConfig(siteRoot)
	if (config.publicOrigin !== undefined) return { kind: 'external', origin: config.publicOrigin }
	const directory = mediaDirectory(siteRoot, config.publicPath!)
	const { descriptor } = loadReleaseDescriptor(siteRoot)
	const { manifest } = descriptor
	const stale = descriptor.configDigest !== computeConfigDigest(loadImageConfig(siteRoot))
	const derivatives = Object.values(manifest.photos).flatMap((photo) => photo.derivatives)
	const expected = new Set(derivatives.map((derivative) => derivative.objectKey))
	const missing: string[] = []
	const changed: string[] = []
	for (const derivative of derivatives) {
		const file = path.join(directory, derivative.objectKey)
		if (!existsSync(file)) {
			missing.push(derivative.objectKey)
			continue
		}
		const bytes = readFileSync(file)
		const sha256 = createHash('sha256').update(bytes).digest('hex')
		if (bytes.length !== derivative.byteSize || sha256 !== derivative.sha256)
			changed.push(derivative.objectKey)
	}
	const extra = listMediaFiles(directory).filter((file) => !expected.has(file))
	return {
		kind: 'site',
		directory,
		stale,
		checked: derivatives.length,
		missing: missing.sort(),
		changed: changed.sort(),
		extra,
	}
}
