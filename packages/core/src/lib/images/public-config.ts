import { readFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'astro/zod'

import {
	type ImageLocation,
	imageLocationShape,
	refineImageLocation,
} from '../../config/image-location.ts'
import { assertSchemaVersion } from '../../config/schema-version.ts'
import { canonicalStringifyPretty } from './canonical.ts'

// the non-secret projection of the image config that presentation needs; release state lives in
// the release descriptor, and private fields (rights internals, quality, watermark) never land here

const imageFormatSchema = z.enum(['avif', 'webp'])

const publicRoleContractSchema = z
	.object({
		widths: z.array(z.number().int().positive()).min(1),
		formats: z.array(imageFormatSchema).min(1),
	})
	.strict()

export const imagePublicConfigSchemaV2 = z
	.object({
		schemaVersion: z.literal(1),
		...imageLocationShape,
		copyright: z.string().min(1),
		credit: z.string().min(1),
		ladder: publicRoleContractSchema,
	})
	.strict()
	.superRefine(refineImageLocation)

export const imagePublicConfigSchema = imagePublicConfigSchemaV2

export type ImagePublicConfig = z.infer<typeof imagePublicConfigSchema>

export const IMAGES_PUBLIC_RELATIVE_PATH = 'src/generated/images-public.json'

// the base that derivative object keys are appended to: an origin or a root-relative path
export function imageUrlBase(location: ImageLocation): string {
	const base = location.publicOrigin ?? location.publicPath
	if (base === undefined) throw new Error('image config sets neither publicOrigin nor publicPath')
	return base
}

// the host the browser fetches images from besides the site itself, for CSP and preconnect
export function externalImageOrigin(location: ImageLocation): string | undefined {
	return location.publicOrigin
}

export type ImagePublicSource = ImageLocation & {
	formats: readonly ImagePublicConfig['ladder']['formats'][number][]
	rights: { copyright: string; credit: string }
	ladder: { widths: readonly number[] }
}

// the only writer of the projection from the `images` section of `site.yaml`; canonical stringify sorts only keys,
// so formats are sorted here (the config schema already keeps widths ascending)
export function buildImagePublicConfig(source: ImagePublicSource): ImagePublicConfig {
	return imagePublicConfigSchema.parse({
		schemaVersion: 1,
		...(source.publicOrigin === undefined ? {} : { publicOrigin: source.publicOrigin }),
		...(source.publicPath === undefined ? {} : { publicPath: source.publicPath }),
		copyright: source.rights.copyright,
		credit: source.rights.credit,
		ladder: { widths: [...source.ladder.widths], formats: [...source.formats].sort() },
	})
}

export function parseImagePublicConfig(
	raw: string,
	filePath = IMAGES_PUBLIC_RELATIVE_PATH,
): ImagePublicConfig {
	const value: unknown = JSON.parse(raw)
	assertSchemaVersion(value, filePath, imagePublicConfigSchema)
	return imagePublicConfigSchema.parse(value)
}

export function serializeImagePublicConfig(config: ImagePublicConfig): string {
	return canonicalStringifyPretty(config)
}

export type LoadedImagePublicConfig = {
	config: ImagePublicConfig
	raw: string
}

// server-only; the raw bytes let a caller check canonical form via serialize(config) === raw
export function loadImagePublicConfig(root: string): LoadedImagePublicConfig {
	const filePath = path.join(root, IMAGES_PUBLIC_RELATIVE_PATH)
	const raw = readFileSync(filePath, 'utf8')
	return { config: parseImagePublicConfig(raw), raw }
}
