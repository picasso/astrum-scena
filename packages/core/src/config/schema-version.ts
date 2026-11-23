// every site file the core reads declares the shape it is written in; the check runs before the
// file's schema, so an older shape or a missing version is named as such, with the versions the
// core reads, instead of surfacing as field errors

export const SCHEMA_VERSION_KEY = 'schemaVersion'

// a file schema whose `schemaVersion` is a `z.literal` of the versions it reads
export type VersionedSchema = {
	shape: { [SCHEMA_VERSION_KEY]: { values: ReadonlySet<unknown> } }
}

export const supportedSchemaVersions = (schema: VersionedSchema): number[] =>
	[...schema.shape[SCHEMA_VERSION_KEY].values].filter(
		(value): value is number => typeof value === 'number',
	)

// a YAML value may be a cyclic alias or a non-finite number, which JSON cannot show
const describeFound = (found: unknown): string => {
	if (typeof found === 'string') return JSON.stringify(found)
	if (found === null) return 'null'
	if (Array.isArray(found)) return 'an array'
	if (typeof found === 'object') return 'an object'
	return String(found)
}

export function assertSchemaVersion(
	value: unknown,
	filePath: string,
	schema: VersionedSchema,
	// appended for an older numeric version, for a file whose older shapes have a written upgrade;
	// a newer one needs a newer core instead
	olderHint?: string,
): void {
	const supported = supportedSchemaVersions(schema)
	const list = supported.join(', ')
	const found =
		value !== null && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)[SCHEMA_VERSION_KEY]
			: undefined
	if (found === undefined)
		throw new Error(`${filePath}: missing schemaVersion; supported: ${list}`)
	const older =
		typeof found === 'number' && Number.isInteger(found) && found < Math.min(...supported)
	assertSupportedVersion(
		found,
		`${filePath}: schemaVersion`,
		supported,
		older ? olderHint : undefined,
	)
}

// `subject` names the version, e.g. `site.lock.yaml: collections.albums: version`
export function assertSupportedVersion(
	found: unknown,
	subject: string,
	supported: readonly number[],
	hint?: string,
): void {
	if (typeof found === 'number' && supported.includes(found)) return
	throw new Error(
		`${subject} ${describeFound(found)} is not supported; supported: ${supported.join(', ')}${hint ? `; ${hint}` : ''}`,
	)
}
