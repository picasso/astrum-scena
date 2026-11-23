import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'astro/zod'
import { parse as parseYaml } from 'yaml'

import { KEBAB_CASE_PATTERN } from '../../config/kebab-case.ts'
import { assertSchemaVersion } from '../../config/schema-version.ts'
import { loadPlacesConfig } from '../../lib/content/files.ts'

// coarse place zones, read only by the image commands to propose a placeId from a master's GPS; never
// read by content, the build or public output. The file is optional: without it nothing is proposed.
// A zone crossing the antimeridian is two ordinary boxes (Fiji: [177..180] and [-180..-177]), since a
// wrapped west > east box is rejected

export const PLACE_GPS_BOUNDS_PATH = 'src/content/config/place-gps-bounds.yaml'

export type GpsBox = { south: number; west: number; north: number; east: number }

export type PlaceGpsBound = { placeId: string; box: GpsBox }

const boxSchema = z
	.object({
		south: z.number().min(-90).max(90),
		west: z.number().min(-180).max(180),
		north: z.number().min(-90).max(90),
		east: z.number().min(-180).max(180),
	})
	.strict()
	.superRefine((value, context) => {
		if (!(value.south < value.north)) {
			context.addIssue({
				code: 'custom',
				message: 'box.south must be strictly less than box.north',
				path: ['north'],
			})
		}
		if (!(value.west < value.east)) {
			context.addIssue({
				code: 'custom',
				message:
					'box.west must be strictly less than box.east; express an antimeridian zone as two boxes',
				path: ['east'],
			})
		}
	})

const boundSchema = z
	.object({ placeId: z.string().regex(KEBAB_CASE_PATTERN), box: boxSchema })
	.strict()

// a placeId may repeat (antimeridian zones); the cross-reference with the places is in the parser
export const placeGpsBoundsSchema = z
	.object({ schemaVersion: z.literal(1), bounds: z.array(boundSchema) })
	.strict()

export function parsePlaceGpsBounds(
	raw: unknown,
	knownPlaceIds: ReadonlySet<string>,
	filePath = PLACE_GPS_BOUNDS_PATH,
): PlaceGpsBound[] {
	assertSchemaVersion(raw, filePath, placeGpsBoundsSchema)
	const parsed = placeGpsBoundsSchema.safeParse(raw)
	if (!parsed.success) {
		const detail = parsed.error.issues
			.map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
			.join('; ')
		throw new Error(`${filePath}: ${detail}`)
	}
	const unknown = [
		...new Set(
			parsed.data.bounds.map((bound) => bound.placeId).filter((id) => !knownPlaceIds.has(id)),
		),
	]
	if (unknown.length > 0)
		throw new Error(`${filePath}: unknown placeId ${unknown.map((id) => `"${id}"`).join(', ')}`)
	return parsed.data.bounds
}

// undefined when the site has no bounds file
export async function loadPlaceGpsBounds(root: string): Promise<PlaceGpsBound[] | undefined> {
	let raw: string
	try {
		raw = await readFile(path.join(root, PLACE_GPS_BOUNDS_PATH), 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
		throw error
	}
	const places = await loadPlacesConfig(root)
	return parsePlaceGpsBounds(parseYaml(raw), new Set(places.map((place) => place.id)))
}
