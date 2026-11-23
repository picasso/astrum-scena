import { z } from 'astro/zod'

import { assertSchemaVersion } from '../../config/schema-version.ts'

// the image data files of a site (`data/images/*.jsonl`) hold one JSON value per line under a first
// line that only declares the version, so a row is appended without rewriting the file

export const jsonlHeaderSchema = z.object({ schemaVersion: z.literal(1) }).strict()

// a whole file as one value, for the API snapshot: the version of its first line and its rows
export const jsonlFileSchema = <Row extends z.ZodType>(row: Row) =>
	jsonlHeaderSchema.extend({ rows: z.array(row) })

export const JSONL_HEADER = `${JSON.stringify({ schemaVersion: 1 })}\n`

export type JsonlRow = { line: number; value: unknown }

// the rows after the header with their 1-based line numbers; blank lines are skipped
export function parseJsonl(raw: string, filePath: string): JsonlRow[] {
	const lines = raw
		.split('\n')
		.map((text, index) => ({ text: text.trim(), line: index + 1 }))
		.filter(({ text }) => text !== '')
	const parse = ({ text, line }: { text: string; line: number }): unknown => {
		try {
			return JSON.parse(text)
		} catch {
			throw new Error(`${filePath}:${line}: invalid JSON`)
		}
	}
	const [header, ...rows] = lines
	const headerValue = header === undefined ? undefined : parse(header)
	assertSchemaVersion(headerValue, filePath, jsonlHeaderSchema)
	const parsed = jsonlHeaderSchema.safeParse(headerValue)
	if (!parsed.success)
		throw new Error(`${filePath}:${header!.line}: the first line holds only the schemaVersion`)
	return rows.map((row) => ({ line: row.line, value: parse(row) }))
}

export function serializeJsonl(rows: readonly unknown[]): string {
	return JSONL_HEADER + rows.map((row) => `${JSON.stringify(row)}\n`).join('')
}
