import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'astro/zod'

import { sha256HexSchema } from '../../config/sha256-schema.ts'
import { jsonlFileSchema, parseJsonl, serializeJsonl } from './jsonl.ts'

// the publication ledger of a site, one row per published release, written only after a fully
// successful sync. Keyed by release id and manifest digest, so a repeated sync of the same release
// adds no duplicate

export const PUBLICATION_LEDGER_PATH = 'data/images/publication-ledger.jsonl'

const nonempty = z.string().min(1)

export const ledgerEntrySchema = z
	.object({
		releaseId: nonempty,
		manifestDigest: sha256HexSchema,
		photoIds: z.array(nonempty),
		derivativeSha256: z.array(sha256HexSchema),
		objectKeys: z.array(nonempty),
		publicOrigin: z.url(),
		rightsUrl: z.url(),
		watermarkProfiles: z.array(nonempty),
		publishedAt: z.iso.datetime(),
	})
	.strict()

export const publicationLedgerFileSchema = jsonlFileSchema(ledgerEntrySchema)

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>

function parseEntry(value: unknown, location: string): LedgerEntry {
	const result = ledgerEntrySchema.safeParse(value)
	if (!result.success) throw new Error(`${location}: ${result.error.message}`)
	return result.data
}

export const ledgerKey = (entry: Pick<LedgerEntry, 'releaseId' | 'manifestDigest'>): string =>
	`${entry.releaseId}:${entry.manifestDigest}`

export const ledgerPath = (root: string): string => path.join(root, PUBLICATION_LEDGER_PATH)

export async function readLedger(root: string): Promise<LedgerEntry[]> {
	let raw: string
	try {
		raw = await readFile(ledgerPath(root), 'utf8')
	} catch (error) {
		// only a missing file is an empty ledger; any other error read as empty would let
		// recordPublication overwrite the publication history with a single line
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
		throw error
	}
	return parseJsonl(raw, PUBLICATION_LEDGER_PATH).map(({ line, value }) =>
		parseEntry(value, `${PUBLICATION_LEDGER_PATH}:${line}: invalid publication ledger entry`),
	)
}

// rewrites the whole file via temp and rename, so an interruption never leaves a half-written line
export async function recordPublication(
	root: string,
	input: LedgerEntry,
): Promise<{ appended: boolean }> {
	const entries = await readLedger(root)
	const entry = parseEntry(input, `${PUBLICATION_LEDGER_PATH}: invalid append input`)
	const key = ledgerKey(entry)
	if (entries.some((existing) => ledgerKey(existing) === key)) return { appended: false }
	const file = ledgerPath(root)
	await mkdir(path.dirname(file), { recursive: true })
	const tmp = `${file}.tmp-${randomUUID()}`
	await writeFile(tmp, serializeJsonl([...entries, entry]), 'utf8')
	await rename(tmp, file)
	return { appended: true }
}
