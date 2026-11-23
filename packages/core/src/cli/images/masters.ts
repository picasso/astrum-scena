import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'astro/zod'

import { sha256HexSchema } from '../../config/sha256-schema.ts'
import { jsonlFileSchema, parseJsonl } from './jsonl.ts'

// the master registry of a site, one row per master. Only the fields the resolver needs are read; the
// rest pass through the loose schemas. A migrated row is anchored by its `legacyId` (its filename and
// sha256 may be null for an excluded row); a new master's row by the sha256 of its bytes, with `id`
// (the photo id) and the required filename and sha256. The variants are told apart by their keys, so
// a hybrid row that a key-presence guard would misclassify is rejected

export const MASTERS_REGISTRY_PATH = 'data/images/masters.jsonl'

export const legacyRegistryRowSchema = z
	.looseObject({
		legacyId: z.string().min(1),
		masterFilename: z.string().min(1).nullable(),
		masterSha256: sha256HexSchema.nullable(),
		status: z.string().min(1),
	})
	.refine((row) => !('id' in row), {
		message: 'legacy registry row must not carry an `id` field',
	})

export const newRegistryRowSchema = z
	.looseObject({
		id: z.string().min(1),
		masterFilename: z.string().min(1),
		masterSha256: sha256HexSchema,
	})
	.refine((row) => !('legacyId' in row) && !('status' in row), {
		message: 'new registry row must not carry `legacyId`/`status` fields',
	})

export const registryRowSchema = z.union([legacyRegistryRowSchema, newRegistryRowSchema])

export const mastersRegistryFileSchema = jsonlFileSchema(registryRowSchema)

export type RegistryRow = z.infer<typeof registryRowSchema>
export type LegacyRegistryRow = z.infer<typeof legacyRegistryRowSchema>

export const isLegacyRegistryRow = (row: RegistryRow): row is LegacyRegistryRow => 'legacyId' in row

export function parseRegistry(raw: string, filePath = MASTERS_REGISTRY_PATH): RegistryRow[] {
	return parseJsonl(raw, filePath).map(({ line, value }) => {
		const parsed = registryRowSchema.safeParse(value)
		if (!parsed.success)
			throw new Error(`${filePath}:${line}: invalid registry row: ${parsed.error.message}`)
		return parsed.data
	})
}

export async function loadMastersRegistry(root: string): Promise<RegistryRow[]> {
	let raw: string
	try {
		raw = await readFile(path.join(root, MASTERS_REGISTRY_PATH), 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			throw new Error(`${MASTERS_REGISTRY_PATH}: missing; the master registry is required`)
		throw error
	}
	return parseRegistry(raw)
}
