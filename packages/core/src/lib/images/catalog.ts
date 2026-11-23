import type { Manifest } from './manifest.ts'
import { imageUrlBase, loadImagePublicConfig } from './public-config.ts'
import { loadManifestFile, loadReleaseDescriptor } from './release.ts'

// presentation hands this to the media helpers; only buildPictureModel builds URLs from it, so
// there is no second resolver
export type ImageCatalog = {
	manifest: Manifest
	// an external origin or a root-relative path on the site itself
	originBase: string
	copyright: string
	credit: string
}

// server-only: it reads tracked JSON from disk, so importing it into a client island would ship the
// manifest and public config to the browser
export function loadProductionImageCatalog(root: string): ImageCatalog {
	const { descriptor } = loadReleaseDescriptor(root)
	const { config } = loadImagePublicConfig(root)
	return {
		manifest: descriptor.manifest,
		originBase: imageUrlBase(config),
		copyright: config.copyright,
		credit: config.credit,
	}
}

// a partial env or local mode outside dev throws instead of silently falling back to production
export type CatalogEnv =
	{ mode: 'production' } | { mode: 'local'; manifestPath: string; origin: string }

export function resolveCatalogEnv(
	env: NodeJS.ProcessEnv = process.env,
	options: { dev?: boolean } = {},
): CatalogEnv {
	const localManifestPath = env.IMAGES_LOCAL_MANIFEST
	const localOrigin = env.IMAGES_LOCAL_ORIGIN
	if (localManifestPath === undefined && localOrigin === undefined) return { mode: 'production' }
	const dev = options.dev ?? import.meta.env?.DEV === true
	if (!dev) throw new Error('local image mode is dev-only')
	if (!localManifestPath || !localOrigin) {
		throw new Error('local image mode requires IMAGES_LOCAL_MANIFEST and IMAGES_LOCAL_ORIGIN')
	}
	let url: URL
	try {
		url = new URL(localOrigin)
	} catch {
		throw new Error('IMAGES_LOCAL_ORIGIN must use local HTTP on 127.0.0.1')
	}
	if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
		throw new Error('IMAGES_LOCAL_ORIGIN must use local HTTP on 127.0.0.1')
	}
	return { mode: 'local', manifestPath: localManifestPath, origin: localOrigin }
}

// server-only; local mode swaps the manifest and origin but keeps copyright and credit from the
// public config, which is deterministic and not secret
export function loadImageCatalog(
	root: string,
	env: NodeJS.ProcessEnv = process.env,
	options: { dev?: boolean } = {},
): ImageCatalog {
	const resolved = resolveCatalogEnv(env, options)
	if (resolved.mode === 'production') return loadProductionImageCatalog(root)

	const { manifest } = loadManifestFile(resolved.manifestPath)
	const { config } = loadImagePublicConfig(root)
	return {
		manifest,
		originBase: resolved.origin,
		copyright: config.copyright,
		credit: config.credit,
	}
}
