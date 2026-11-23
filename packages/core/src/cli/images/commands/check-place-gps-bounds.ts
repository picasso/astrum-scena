import path from 'node:path'

import { type CliContext, label } from '../../context.ts'
import { loadPlaceGpsBounds, PLACE_GPS_BOUNDS_PATH } from '../place-gps-bounds.ts'

// the optional place zones parse, carry a supported schemaVersion and name only existing places
export async function checkPlaceGpsBounds(context: CliContext): Promise<number> {
	const file = label(context, path.join(context.root, PLACE_GPS_BOUNDS_PATH))
	let bounds
	try {
		bounds = await loadPlaceGpsBounds(context.root)
	} catch (error) {
		context.err(`check place-gps-bounds FAIL: ${(error as Error).message}`)
		return 1
	}
	if (bounds === undefined) {
		context.out(`check place-gps-bounds OK (no ${file}; nothing to check)`)
		return 0
	}
	context.out('check place-gps-bounds OK')
	context.out(`  path:   ${file}`)
	context.out(`  places: ${new Set(bounds.map((bound) => bound.placeId)).size}`)
	return 0
}
