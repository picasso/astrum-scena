import { readFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'astro/zod'

import { assertSchemaVersion } from '../../config/schema-version.ts'
import { sha256HexSchema } from '../../config/sha256-schema.ts'
import { canonicalStringifyPretty } from './canonical.ts'
import { type Manifest, manifestSchema, parseManifest, serializeManifest } from './manifest.ts'
import { evaluatePolicy } from './policy.ts'

// the single tracked active state: every reader of the active release reads only this descriptor,
// and the release's photo set is the manifest keys (ADR-0012)

export const releaseDescriptorSchema = z
	.object({
		schemaVersion: z.literal(1),
		active: z.boolean(),
		configDigest: sha256HexSchema,
		manifest: manifestSchema,
	})
	.strict()
	.superRefine((value, context) => {
		// the top-level digest duplicates the manifest's, so a mismatch must never pass silently
		if (value.configDigest !== value.manifest.configDigest) {
			context.addIssue({
				code: 'custom',
				message: `descriptor.configDigest (${value.configDigest}) does not match embedded manifest.configDigest (${value.manifest.configDigest})`,
				path: ['configDigest'],
			})
		}

		const evaluation = evaluatePolicy(value.active, value.manifest)
		if (!evaluation.ok) {
			context.addIssue({
				code: 'custom',
				message: evaluation.reason,
				path: ['manifest', 'photos'],
			})
		}
	})

export type ReleaseDescriptor = z.infer<typeof releaseDescriptorSchema>

export const RELEASE_DESCRIPTOR_RELATIVE_PATH = 'src/generated/images-release.json'
export const IMAGE_RELEASES_RELATIVE_PATH = '.cache/images/releases'
export const RELEASE_MANIFEST_FILENAME = 'images-manifest.json'

export function releaseDescriptorPath(root: string): string {
	return path.join(root, RELEASE_DESCRIPTOR_RELATIVE_PATH)
}

export function releaseDirPath(root: string, releaseId: string): string {
	return path.join(root, IMAGE_RELEASES_RELATIVE_PATH, releaseId)
}

export function releaseManifestPath(releaseDir: string): string {
	return path.join(releaseDir, RELEASE_MANIFEST_FILENAME)
}

export function parseReleaseDescriptor(
	raw: unknown,
	filePath = RELEASE_DESCRIPTOR_RELATIVE_PATH,
): ReleaseDescriptor {
	assertSchemaVersion(raw, filePath, releaseDescriptorSchema)
	assertSchemaVersion(
		(raw as Record<string, unknown>).manifest,
		`${filePath} (manifest)`,
		manifestSchema,
	)
	return releaseDescriptorSchema.parse(raw)
}

export function serializeReleaseDescriptor(descriptor: ReleaseDescriptor): string {
	return canonicalStringifyPretty(descriptor)
}

// configDigest comes from the manifest, its only source
export function buildReleaseDescriptor(input: {
	active: boolean
	manifest: Manifest
}): ReleaseDescriptor {
	return releaseDescriptorSchema.parse({
		schemaVersion: 1,
		active: input.active,
		configDigest: input.manifest.configDigest,
		manifest: input.manifest,
	})
}

export type LoadedReleaseDescriptor = {
	descriptor: ReleaseDescriptor
	raw: string
}

// the raw bytes let a caller check canonical form: serializeReleaseDescriptor(descriptor) === raw
export function loadReleaseDescriptor(root: string): LoadedReleaseDescriptor {
	const raw = readFileSync(releaseDescriptorPath(root), 'utf8')
	const descriptor = parseReleaseDescriptor(JSON.parse(raw))
	return { descriptor, raw }
}

// the embedded manifest in the same canonical bytes as a standalone release manifest file
export function descriptorManifestBytes(descriptor: ReleaseDescriptor): string {
	return serializeManifest(descriptor.manifest)
}

export type LoadedManifestFile = {
	manifest: Manifest
	raw: string
}

type ManifestJson = {
	parsed: unknown
	raw: string
}

// the only reader of a manifest file (a cache release or the local manifest named by env), before
// any schema: pre-v3 releases are read through it unvalidated
export function readManifestJson(file: string): ManifestJson {
	let raw: string
	try {
		raw = readFileSync(file, 'utf8')
	} catch (error) {
		throw new Error(`cannot read release manifest at ${file} — ${(error as Error).message}`, {
			cause: error,
		})
	}
	try {
		return { parsed: JSON.parse(raw), raw }
	} catch (error) {
		throw new Error(`invalid release manifest at ${file} — ${(error as Error).message}`, {
			cause: error,
		})
	}
}

// the validated v3 manifest; `raw` is the exact file bytes so callers can compare them with a
// canonical serialization
export function loadManifestFile(file: string): LoadedManifestFile {
	const { parsed, raw } = readManifestJson(file)
	assertSchemaVersion(parsed, file, manifestSchema)
	try {
		return { manifest: parseManifest(parsed), raw }
	} catch (error) {
		throw new Error(`invalid release manifest at ${file} — ${(error as Error).message}`, {
			cause: error,
		})
	}
}
