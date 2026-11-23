import {
	appendFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { JSONL_HEADER, parseJsonl, serializeJsonl } from './jsonl.ts'
import {
	type LedgerEntry,
	PUBLICATION_LEDGER_PATH,
	readLedger,
	recordPublication,
} from './ledger.ts'
import { loadMastersRegistry, MASTERS_REGISTRY_PATH, parseRegistry } from './masters.ts'
import { upgradeJsonl } from './test-fixtures.ts'

const scratch = mkdtempSync(path.join(tmpdir(), 'astrum-scena-jsonl-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const SHA = 'a'.repeat(64)
const LEGACY_ROW = { legacyId: 'wp:1', masterFilename: 'a.jpg', masterSha256: SHA, status: 'auto' }
const NEW_ROW = { id: 'b-photo', masterFilename: 'b.jpg', masterSha256: 'b'.repeat(64) }
// the registry as the image scripts wrote it before this release: rows only
const LEGACY_REGISTRY = `${JSON.stringify(LEGACY_ROW)}\n${JSON.stringify(NEW_ROW)}\n`

const site = (name: string): string => {
	const root = path.join(scratch, name)
	mkdirSync(path.join(root, 'data/images'), { recursive: true })
	return root
}

describe('parseJsonl', () => {
	it('reads the rows under the header with their line numbers, skipping blank lines', () => {
		expect(parseJsonl(`${JSON_HEADER_LINE}\n\n{"a":1}\n`, 'x.jsonl')).toEqual([
			{ line: 3, value: { a: 1 } },
		])
		expect(serializeJsonl([{ a: 1 }])).toBe(`${JSONL_HEADER}{"a":1}\n`)
	})

	it('fails without a header, naming the file and the supported versions', () => {
		expect(() => parseJsonl('{"a":1}\n', 'x.jsonl')).toThrow(
			'x.jsonl: missing schemaVersion; supported: 1',
		)
		expect(() => parseJsonl('', 'x.jsonl')).toThrow('x.jsonl: missing schemaVersion')
		expect(() => parseJsonl('{"schemaVersion":2}\n', 'x.jsonl')).toThrow(
			'x.jsonl: schemaVersion 2 is not supported; supported: 1',
		)
		expect(() => parseJsonl('{"schemaVersion":1,"a":1}\n', 'x.jsonl')).toThrow(
			'x.jsonl:1: the first line holds only the schemaVersion',
		)
		expect(() => parseJsonl(`${JSON_HEADER_LINE}\n{oops\n`, 'x.jsonl')).toThrow(
			'x.jsonl:2: invalid JSON',
		)
	})
})

const JSON_HEADER_LINE = JSONL_HEADER.trimEnd()

describe('the master registry', () => {
	it('fails on the old form and reads the same rows after the one-line upgrade', async () => {
		expect(() => parseRegistry(LEGACY_REGISTRY)).toThrow(
			`${MASTERS_REGISTRY_PATH}: missing schemaVersion; supported: 1`,
		)
		const root = site('registry')
		writeFileSync(path.join(root, MASTERS_REGISTRY_PATH), upgradeJsonl(LEGACY_REGISTRY))
		expect(await loadMastersRegistry(root)).toEqual([LEGACY_ROW, NEW_ROW])
		// a row appended at the end is read too
		const appended = { id: 'c-photo', masterFilename: 'c.jpg', masterSha256: 'c'.repeat(64) }
		appendFileSync(path.join(root, MASTERS_REGISTRY_PATH), `${JSON.stringify(appended)}\n`)
		expect(await loadMastersRegistry(root)).toEqual([LEGACY_ROW, NEW_ROW, appended])
	})

	it('names the line of an invalid or hybrid row and a missing file', async () => {
		const hybrid = { ...NEW_ROW, legacyId: 'wp:2' }
		expect(() => parseRegistry(upgradeJsonl(`${JSON.stringify(hybrid)}\n`))).toThrow(
			`${MASTERS_REGISTRY_PATH}:2: invalid registry row`,
		)
		await expect(loadMastersRegistry(site('no-registry'))).rejects.toThrow(
			`${MASTERS_REGISTRY_PATH}: missing`,
		)
	})
})

describe('the publication ledger', () => {
	const entry = (releaseId: string): LedgerEntry => ({
		releaseId,
		manifestDigest: SHA,
		photoIds: ['a-photo'],
		derivativeSha256: [SHA],
		objectKeys: ['a-photo/200w-x.avif'],
		publicOrigin: 'https://images.example.com',
		rightsUrl: 'https://example.com/rights/',
		watermarkProfiles: ['watermark'],
		publishedAt: '2026-11-15T12:00:00.000Z',
	})

	it('is empty without a file and writes the header with the first row', async () => {
		const root = site('ledger')
		expect(await readLedger(root)).toEqual([])
		expect(await recordPublication(root, entry('r1'))).toEqual({ appended: true })
		expect(await recordPublication(root, entry('r1'))).toEqual({ appended: false })
		expect(await recordPublication(root, entry('r2'))).toEqual({ appended: true })
		const raw = readFileSync(path.join(root, PUBLICATION_LEDGER_PATH), 'utf8')
		expect(raw.startsWith(JSONL_HEADER)).toBe(true)
		expect(raw.split('\n').filter(Boolean)).toHaveLength(3)
		expect((await readLedger(root)).map((row) => row.releaseId)).toEqual(['r1', 'r2'])
	})

	it('fails on the old form until its header is added', async () => {
		const root = site('legacy-ledger')
		const legacy = `${JSON.stringify(entry('r1'))}\n`
		writeFileSync(path.join(root, PUBLICATION_LEDGER_PATH), legacy)
		await expect(readLedger(root)).rejects.toThrow(
			`${PUBLICATION_LEDGER_PATH}: missing schemaVersion; supported: 1`,
		)
		writeFileSync(path.join(root, PUBLICATION_LEDGER_PATH), upgradeJsonl(legacy))
		expect(await readLedger(root)).toEqual([entry('r1')])
	})
})
