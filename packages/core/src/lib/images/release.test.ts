import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { sha256HexSchema } from '../../config/sha256-schema.ts'
import { buildEmptyManifest, parseManifest, serializeManifest } from './manifest.ts'
import {
	buildReleaseDescriptor,
	descriptorManifestBytes,
	loadManifestFile,
	parseReleaseDescriptor,
	RELEASE_DESCRIPTOR_RELATIVE_PATH,
	releaseDescriptorSchema,
	releaseDirPath,
	releaseManifestPath,
	serializeReleaseDescriptor,
} from './release.ts'

const digest = 'a'.repeat(64)
const manifest = parseManifest(
	JSON.parse(
		readFileSync(new URL('./__fixtures__/s9-ladder-manifest.json', import.meta.url), 'utf8'),
	),
)

describe('release descriptor v3', () => {
	it('round trips the active manifest with canonical bytes', () => {
		const descriptor = buildReleaseDescriptor({ active: true, manifest })
		const raw = serializeReleaseDescriptor(descriptor)
		expect(parseReleaseDescriptor(JSON.parse(raw))).toEqual(descriptor)
		expect(descriptorManifestBytes(descriptor)).toContain('"schemaVersion": 3')
	})

	it('allows an inactive empty manifest', () => {
		const descriptor = buildReleaseDescriptor({
			active: false,
			manifest: buildEmptyManifest(digest),
		})
		expect(releaseDescriptorSchema.parse(descriptor).active).toBe(false)
	})

	it('rejects mismatched digest and activity', () => {
		const descriptor = buildReleaseDescriptor({ active: true, manifest })
		expect(() => parseReleaseDescriptor({ ...descriptor, configDigest: digest })).toThrow()
		expect(() => parseReleaseDescriptor({ ...descriptor, active: false })).toThrow()
	})

	it('rejects old manifest versions and unknown fields', () => {
		const descriptor = buildReleaseDescriptor({ active: true, manifest })
		expect(() =>
			parseReleaseDescriptor({
				...descriptor,
				manifest: { ...manifest, schemaVersion: 2 },
			}),
		).toThrow()
		expect(() => parseReleaseDescriptor({ ...descriptor, phase: 'legacy' })).toThrow()
	})

	it('rejects an embedded manifest of another version, naming the file', () => {
		const descriptor = buildReleaseDescriptor({ active: true, manifest })
		expect(() =>
			parseReleaseDescriptor({ ...descriptor, manifest: { ...manifest, schemaVersion: 2 } }),
		).toThrow(
			`${RELEASE_DESCRIPTOR_RELATIVE_PATH} (manifest): schemaVersion 2 is not supported; supported: 3`,
		)
	})

	it('writes the descriptor schemaVersion at the top level', () => {
		const descriptor = buildReleaseDescriptor({ active: true, manifest })
		expect(JSON.parse(serializeReleaseDescriptor(descriptor)).schemaVersion).toBe(1)
	})

	it('rejects a descriptor without a top-level schemaVersion, naming the file', () => {
		const unversioned: Record<string, unknown> = {
			...buildReleaseDescriptor({ active: true, manifest }),
		}
		delete unversioned.schemaVersion
		expect(() => parseReleaseDescriptor(unversioned)).toThrow(
			`${RELEASE_DESCRIPTOR_RELATIVE_PATH}: missing schemaVersion; supported: 1`,
		)
	})
})

describe('loadManifestFile', () => {
	const roots: string[] = []
	afterEach(() => {
		for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
	})

	function releaseFile(contents?: string): string {
		const root = mkdtempSync(path.join(tmpdir(), 'release-manifest-'))
		roots.push(root)
		const releaseDir = releaseDirPath(root, 'test-release')
		mkdirSync(releaseDir, { recursive: true })
		const file = releaseManifestPath(releaseDir)
		if (contents !== undefined) writeFileSync(file, contents, 'utf8')
		return file
	}

	function loadError(file: string): Error {
		try {
			loadManifestFile(file)
		} catch (error) {
			return error as Error
		}
		throw new Error('expected loadManifestFile to throw')
	}

	it('returns the parsed manifest and the exact file bytes', () => {
		const raw = serializeManifest(buildEmptyManifest(digest))
		const loaded = loadManifestFile(releaseFile(raw))
		expect(loaded.raw).toBe(raw)
		expect(loaded.manifest).toEqual(buildEmptyManifest(digest))
	})

	it('returns the file bytes verbatim for valid but noncanonical JSON', () => {
		const raw = `{ "photos": {},\r\n  "configDigest": "${digest}", "schemaVersion": 3 }`
		const loaded = loadManifestFile(releaseFile(raw))
		expect(loaded.raw).toBe(raw)
		expect(loaded.manifest).toEqual(buildEmptyManifest(digest))
	})

	it('names the file and keeps the filesystem error as the cause when it is missing', () => {
		const file = releaseFile()
		const error = loadError(file)
		expect(error.message).toContain(file)
		expect((error.cause as NodeJS.ErrnoException).code).toBe('ENOENT')
	})

	it('names the file and keeps the parse error as the cause for broken JSON or schema', () => {
		const broken = releaseFile('not json')
		const brokenError = loadError(broken)
		expect(brokenError.message).toContain(broken)
		expect(brokenError.cause).toBeInstanceOf(SyntaxError)

		const invalid = releaseFile(
			JSON.stringify({ schemaVersion: 3, configDigest: 'x', photos: {} }),
		)
		const invalidError = loadError(invalid)
		expect(invalidError.message).toContain(invalid)
		expect((invalidError.cause as Error).name).toBe('ZodError')
	})

	it('rejects a non-numeric schemaVersion with the file and the supported versions', () => {
		const file = releaseFile('{"schemaVersion":"3","configDigest":"x","photos":{}}')
		expect(loadError(file).message).toBe(
			`${file}: schemaVersion "3" is not supported; supported: 3`,
		)
	})

	it('rejects a manifest without schemaVersion with the file and the supported versions', () => {
		const file = releaseFile(`{"configDigest":"${digest}","photos":{}}`)
		expect(loadError(file).message).toBe(`${file}: missing schemaVersion; supported: 3`)
	})

	it('rejects a pre-v3 release with the file and the supported versions', () => {
		const file = releaseFile('{"schemaVersion":2}')
		expect(loadError(file).message).toBe(
			`${file}: schemaVersion 2 is not supported; supported: 3`,
		)
	})
})

describe('sha256HexSchema', () => {
	it('rejects uppercase and short digests', () => {
		for (const value of ['A'.repeat(64), 'a'.repeat(63)]) {
			const result = sha256HexSchema.safeParse(value)
			expect(result.success).toBe(false)
			expect(result.error?.issues[0]?.message).toBe('Expected lowercase 64-hex sha256')
		}
		expect(sha256HexSchema.safeParse(digest).success).toBe(true)
	})
})
