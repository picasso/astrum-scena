import { z } from 'astro/zod'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { assertSchemaVersion, supportedSchemaVersions } from './schema-version.ts'

const FILE = 'src/config/example.yaml'
const schema = z.object({ schemaVersion: z.literal([1, 2]), title: z.string() })

const check = (value: unknown) => () => assertSchemaVersion(value, FILE, schema)

describe('assertSchemaVersion', () => {
	it('lists the versions of the schema literal', () => {
		expect(supportedSchemaVersions(schema)).toEqual([1, 2])
	})

	it('passes a supported version and leaves the rest to the schema', () => {
		expect(check({ schemaVersion: 2 })).not.toThrow()
	})

	it('names the file and the supported versions when the version is missing', () => {
		const missing = `${FILE}: missing schemaVersion; supported: 1, 2`
		for (const value of [{ title: 'x' }, { version: 2 }, null, undefined, 'text', [1]])
			expect(check(value)).toThrow(missing)
	})

	it('names the value it found when the version is not supported', () => {
		expect(check({ schemaVersion: 3 })).toThrow(
			`${FILE}: schemaVersion 3 is not supported; supported: 1, 2`,
		)
		expect(check({ schemaVersion: '1' })).toThrow(
			`${FILE}: schemaVersion "1" is not supported; supported: 1, 2`,
		)
		expect(check({ schemaVersion: null })).toThrow(
			`${FILE}: schemaVersion null is not supported; supported: 1, 2`,
		)
	})

	it('appends the hint to an older version only', () => {
		const versioned = z.object({ schemaVersion: z.literal(2) })
		const hint = 'see UPGRADING.md'
		const older = () => assertSchemaVersion({ schemaVersion: 1 }, FILE, versioned, hint)
		const newer = () => assertSchemaVersion({ schemaVersion: 3 }, FILE, versioned, hint)
		expect(older).toThrow(
			`${FILE}: schemaVersion 1 is not supported; supported: 2; see UPGRADING.md`,
		)
		expect(newer).toThrow(`${FILE}: schemaVersion 3 is not supported; supported: 2`)
		expect(newer).not.toThrow('UPGRADING.md')
	})

	it('names a cyclic alias or a non-finite number without failing to print it', () => {
		expect(check(parse('schemaVersion: &v [*v]\n'))).toThrow(
			`${FILE}: schemaVersion an array is not supported; supported: 1, 2`,
		)
		expect(check(parse('schemaVersion: .nan\n'))).toThrow(
			`${FILE}: schemaVersion NaN is not supported; supported: 1, 2`,
		)
		expect(check(parse('schemaVersion: .inf\n'))).toThrow(
			`${FILE}: schemaVersion Infinity is not supported; supported: 1, 2`,
		)
		expect(check({ schemaVersion: { major: 1 } })).toThrow('schemaVersion an object is not')
	})
})
