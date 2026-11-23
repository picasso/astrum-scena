import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ImageConfig } from '../../lib/images/build/config.ts'
import type { RightsWriter } from '../../lib/images/build/engine.ts'
import { readNamespacedTags, readTags, writeTags } from './exiftool.ts'
import type { GpsPoint } from './gps-place.ts'

// the rights metadata of the derivatives and the GPS of a master. Exact GPS stays in memory: it only
// feeds the place proposal and never reaches a report or any output

type RightsConfig = ImageConfig['rights']

// explicit XMP namespaces, not flat tags: exiftool writes flat `Credit`/`Source` to IPTC-IIM, which
// AVIF and WebP containers do not carry, so those fields would not survive. These groups round-trip
// in both formats; the copyright is mirrored to Exif IFD0
const RIGHTS_TAG_KEYS = {
	creator: 'XMP-dc:Creator',
	rights: 'XMP-dc:Rights',
	copyrightExif: 'IFD0:Copyright',
	credit: 'XMP-photoshop:Credit',
	source: 'XMP-photoshop:Source',
	webStatement: 'XMP-xmpRights:WebStatement',
	marked: 'XMP-xmpRights:Marked',
	licensor: 'XMP-plus:LicensorName',
	identifier: 'XMP-dc:Identifier',
} as const

// namespaced keys are outside the closed WriteTags type, but exiftool-vendored passes them through as
// `-Group:Tag=value`
type RightsWriteTags = Record<
	Exclude<(typeof RIGHTS_TAG_KEYS)[keyof typeof RIGHTS_TAG_KEYS], typeof RIGHTS_TAG_KEYS.marked>,
	string
> & { [RIGHTS_TAG_KEYS.marked]: boolean }

export function buildRightsTags(rights: RightsConfig): RightsWriteTags {
	return {
		[RIGHTS_TAG_KEYS.creator]: rights.credit,
		[RIGHTS_TAG_KEYS.rights]: rights.copyright,
		[RIGHTS_TAG_KEYS.copyrightExif]: rights.copyright,
		[RIGHTS_TAG_KEYS.credit]: rights.credit,
		[RIGHTS_TAG_KEYS.source]: rights.source,
		[RIGHTS_TAG_KEYS.webStatement]: rights.webStatement,
		[RIGHTS_TAG_KEYS.marked]: true,
		[RIGHTS_TAG_KEYS.licensor]: rights.licensor,
		[RIGHTS_TAG_KEYS.identifier]: rights.imageId,
	}
}

// sharp strips all source metadata on encode, so the rights fields are the only metadata written
export async function writeRightsXmp(filePath: string, rights: RightsConfig): Promise<void> {
	await writeTags(filePath, buildRightsTags(rights))
}

export type InspectRightsOptions = {
	rights: RightsConfig
	deniedFields: readonly string[]
}

export type RightsInspection = {
	// true only when the whole package reads back equal to buildRightsTags(rights); a format that
	// round-trips part of it gets false, since a single WebStatement signal would mislead
	rightsEmbedded: boolean
	// must be empty after processing
	deniedFieldsPresent: string[]
}

export type RightsInspector = (
	filePath: string,
	options: InspectRightsOptions,
) => Promise<RightsInspection>

// drops the family-1 group: `XMP-photoshop:Credit` → `Credit`
function baseTagName(key: string): string {
	const colon = key.lastIndexOf(':')
	return colon === -1 ? key : key.slice(colon + 1)
}

// the group-aware read proves the rights come back from the exact namespaces they were written to,
// and that no denied field survived in any group (matched by base name)
export const inspectRights: RightsInspector = async (filePath, options) => {
	const record = await readNamespacedTags(filePath)
	const expected = buildRightsTags(options.rights)
	const rightsEmbedded = Object.entries(expected).every(([key, want]) => {
		const got = record[key]
		if (typeof want === 'boolean') return got === want || got === 'True'
		return typeof got === 'string' && got === want
	})
	const present = new Set(Object.keys(record).map(baseTagName))
	return {
		rightsEmbedded,
		deniedFieldsPresent: options.deniedFields.filter((field) => present.has(field)),
	}
}

// the engine's rights writer: exiftool works on files, so each derivative passes through a temporary
// file in `tempDir` that is removed afterwards
export function createRightsWriter(tempDir: string): RightsWriter {
	return async (bytes, { format, rights, deniedFields }) => {
		const file = path.join(tempDir, `.tmp-rights-${randomUUID()}.${format}`)
		try {
			await writeFile(file, bytes)
			await writeRightsXmp(file, rights)
			const inspection = await inspectRights(file, { rights, deniedFields })
			return { bytes: await readFile(file), ...inspection }
		} finally {
			await rm(file, { force: true })
		}
	}
}

const isCoordinate = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value)

export async function readMasterGps(filePath: string): Promise<GpsPoint | undefined> {
	const record = (await readTags(filePath)) as unknown as Record<string, unknown>
	const { GPSLatitude: latitude, GPSLongitude: longitude } = record
	return isCoordinate(latitude) && isCoordinate(longitude) ? { latitude, longitude } : undefined
}
