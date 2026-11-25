import { isMap, isScalar, parseDocument } from 'yaml'

import { SUPPORTED_LOCALES } from '../../config/locale-schema.ts'
import { photoSchemaFor } from '../../lib/content/schemas.ts'
import type { ColorMode } from './colormode.ts'

// the key order does not depend on the locales
const PHOTO_KEY_ORDER = Object.keys(photoSchemaFor(SUPPORTED_LOCALES).shape)
const COLOR_MODE_INDEX = PHOTO_KEY_ORDER.indexOf('colorMode')

export type SetColorModeResult = { output: string; previous: ColorMode | undefined }

// an existing value is never replaced: authored and detected colorMode look the same in the YAML,
// and ADR-0010 keeps the owner's override (toned black-and-white) authoritative. The line goes in
// the schema's key order, and the rest of the file keeps its bytes
export function setPhotoColorMode(raw: string, mode: ColorMode, label: string): SetColorModeResult {
	const doc = parseDocument(raw)
	if (doc.errors.length > 0) throw new Error(`${label}: ${doc.errors[0]!.message}`)
	if (!isMap(doc.contents)) throw new Error(`${label}: photo YAML is not a mapping`)

	const previous = doc.get('colorMode')
	if (previous !== undefined) {
		if (previous !== 'color' && previous !== 'black-and-white')
			throw new Error(`${label}: invalid colorMode ${JSON.stringify(previous)}`)
		return { output: raw, previous }
	}

	const items = doc.contents.items
	let insertAt = 0
	items.forEach((pair, index) => {
		const key = isScalar(pair.key) ? pair.key.value : pair.key
		const keyIndex = PHOTO_KEY_ORDER.indexOf(String(key))
		if (keyIndex >= 0 && keyIndex < COLOR_MODE_INDEX) insertAt = index + 1
	})
	const line = `colorMode: ${mode}\n`
	const next = items[insertAt]?.key
	if (next === undefined) {
		const base = raw.length === 0 || raw.endsWith('\n') ? raw : `${raw}\n`
		return { output: base + line, previous: undefined }
	}
	const offset = isScalar(next) ? next.range?.[0] : undefined
	if (offset === undefined) throw new Error(`${label}: cannot locate top-level key offset`)
	return { output: raw.slice(0, offset) + line + raw.slice(offset), previous: undefined }
}
