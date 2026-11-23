import { createHash } from 'node:crypto'

import type { ImageConfig } from '../../../config/images-schema.ts'
import { loadSiteSection } from '../../../config/loader.ts'
import { canonicalStringify } from '../canonical.ts'

// the schema is a section of site-schema.ts in config/, which lib depends on and never the reverse
export * from '../../../config/images-schema.ts'

// the only reader of the site's image config, a slice of the site.yaml tree; the site root is an
// argument, never cwd
export function loadImageConfig(siteRoot: string): ImageConfig {
	return loadSiteSection(siteRoot, 'images')
}

// the digest hashes a projection the core defines, not the config's shape, so moving or renaming a
// field or adding one outside the projection keeps every derivative. Changing the projection's
// fields or layout changes every digest: it needs a new IMAGE_DIGEST_VERSION, a breaking release
// and an entry in UPGRADING.md. Version 1 reproduces the bytes of the whole parsed config as it was
// in `config/images.yaml`, whose `version: 2` the projection keeps as a constant: it is part of the
// byte contract, not the version of `site.yaml`.
export const IMAGE_DIGEST_VERSION = 1

// a leaf is `true` for the config value of the same key or a number written as is; an array holds
// the projection of each element
type DigestProjection = { readonly [key: string]: DigestProjectionNode }
type DigestProjectionNode = true | number | DigestProjection | readonly [DigestProjection]

export const IMAGE_DIGEST_PROJECTION = {
	version: 2,
	publicOrigin: true,
	publicPath: true,
	formats: true,
	ladder: {
		widths: true,
		native: { enabled: true, maxLongSide: true },
		quality: [{ upTo: true, avif: true, webp: true }],
	},
	rights: {
		copyright: true,
		credit: true,
		licensor: true,
		source: true,
		webStatement: true,
		imageId: true,
	},
	privacy: { deniedFields: true },
	watermark: {
		aboveWidth: true,
		assets: [{ id: true, file: true, sha256: true }],
		profile: {
			id: true,
			assetId: true,
			scale: true,
			minPx: true,
			maxPx: true,
			position: true,
			inset: true,
			opacity: true,
		},
	},
	archive: { ignoreDirs: true },
} as const satisfies DigestProjection

// config fields that never reach the digest; each is listed by its dotted path, `[]` for an
// array element
export const IMAGE_DIGEST_EXCLUDED_FIELDS: readonly string[] = []

function project(source: Record<string, unknown>, projection: DigestProjection) {
	const result: Record<string, unknown> = {}
	for (const [key, node] of Object.entries(projection)) {
		if (typeof node === 'number') {
			result[key] = node
			continue
		}
		const value = source[key]
		if (value === undefined) continue
		if (node === true) result[key] = value
		else if (Array.isArray(node))
			result[key] = (value as Record<string, unknown>[]).map((item) => project(item, node[0]))
		else result[key] = project(value as Record<string, unknown>, node as DigestProjection)
	}
	return result
}

export function projectImageConfigDigest(config: ImageConfig): Record<string, unknown> {
	return project(config, IMAGE_DIGEST_PROJECTION)
}

// canonical serialization keeps the digest independent of key order
export function computeConfigDigest(config: ImageConfig): string {
	return createHash('sha256')
		.update(canonicalStringify(projectImageConfigDigest(config)))
		.digest('hex')
}
