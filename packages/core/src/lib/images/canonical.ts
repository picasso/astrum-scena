// deterministic image-pipeline artifacts: keys sort recursively, array order stays significant

function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortValue)
	}
	if (value !== null && typeof value === 'object') {
		const source = value as Record<string, unknown>
		const sorted: Record<string, unknown> = {}
		for (const key of Object.keys(source).sort()) {
			sorted[key] = sortValue(source[key])
		}
		return sorted
	}
	return value
}

// input for the sha256 config digest
export function canonicalStringify(value: unknown): string {
	return JSON.stringify(sortValue(value))
}

// tabs match the project's Prettier; a rerun is byte-identical because nothing unstable is written
export function canonicalStringifyPretty(value: unknown): string {
	return `${JSON.stringify(sortValue(value), null, '\t')}\n`
}
