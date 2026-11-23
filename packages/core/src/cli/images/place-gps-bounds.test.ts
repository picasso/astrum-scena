import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import { runAstrumScena } from '../test-fixtures.ts'
import {
	loadPlaceGpsBounds,
	parsePlaceGpsBounds,
	PLACE_GPS_BOUNDS_PATH,
} from './place-gps-bounds.ts'
import { makeImageSite, upgradePlaceGpsBounds } from './test-fixtures.ts'

const scratch = mkdtempSync(path.join(tmpdir(), 'astrum-scena-gps-bounds-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const known = new Set(['coastland', 'amber-bay'])

const BOUNDS = `schemaVersion: 1
bounds:
    - placeId: coastland
      box: { south: 0, west: 0, north: 40, east: 40 }
`

// the file as the image scripts read it before this release
const LEGACY_BOUNDS = `# coarse zones
version: 1

bounds:
    - placeId: coastland
      box: { south: 0, west: 0, north: 40, east: 40 }
`

describe('parsePlaceGpsBounds', () => {
	it('reads the boxes of known places', () => {
		expect(parsePlaceGpsBounds(parseYaml(BOUNDS), known)).toEqual([
			{ placeId: 'coastland', box: { south: 0, west: 0, north: 40, east: 40 } },
		])
	})

	it('names the file and every unknown placeId', () => {
		const raw = parseYaml(
			`${BOUNDS}    - placeId: nowhere\n      box: { south: 1, west: 1, north: 2, east: 2 }\n`,
		)
		expect(() => parsePlaceGpsBounds(raw, known)).toThrow(
			`${PLACE_GPS_BOUNDS_PATH}: unknown placeId "nowhere"`,
		)
	})

	it('rejects the old version key, naming the supported schemaVersion', () => {
		expect(() => parsePlaceGpsBounds(parseYaml(LEGACY_BOUNDS), known)).toThrow(
			`${PLACE_GPS_BOUNDS_PATH}: missing schemaVersion; supported: 1`,
		)
		expect(() => parsePlaceGpsBounds({ schemaVersion: 2, bounds: [] }, known)).toThrow(
			`${PLACE_GPS_BOUNDS_PATH}: schemaVersion 2 is not supported; supported: 1`,
		)
	})

	it('rejects a wrapped or inverted box with its path', () => {
		const wrapped = {
			schemaVersion: 1,
			bounds: [{ placeId: 'coastland', box: { south: 0, west: 179, north: 1, east: -179 } }],
		}
		expect(() => parsePlaceGpsBounds(wrapped, known)).toThrow(
			'bounds.0.box.east: box.west must be strictly less than box.east',
		)
	})
})

describe('loadPlaceGpsBounds', () => {
	it('is undefined without the file and checks place ids through the places loader', async () => {
		const { site } = makeImageSite(scratch, 'load')
		expect(await loadPlaceGpsBounds(site)).toBeUndefined()
		writeFileSync(path.join(site, PLACE_GPS_BOUNDS_PATH), BOUNDS)
		expect(await loadPlaceGpsBounds(site)).toHaveLength(1)
	})
})

describe('check place-gps-bounds', () => {
	it('passes without the file and with valid zones', async () => {
		const { site } = makeImageSite(scratch, 'gate-ok')
		const absent = await runAstrumScena(site, ['check', 'place-gps-bounds'])
		expect(absent.status, absent.stderr).toBe(0)
		expect(absent.stdout).toContain('nothing to check')
		writeFileSync(path.join(site, PLACE_GPS_BOUNDS_PATH), BOUNDS)
		const present = await runAstrumScena(site, ['check', 'place-gps-bounds'])
		expect(present.status, present.stderr).toBe(0)
		expect(present.stdout).toContain('places: 1')
	})

	it('fails on an unknown placeId, naming the file and the id', async () => {
		const { site } = makeImageSite(scratch, 'gate-unknown')
		writeFileSync(
			path.join(site, PLACE_GPS_BOUNDS_PATH),
			`${BOUNDS}    - placeId: atlantis\n      box: { south: 1, west: 1, north: 2, east: 2 }\n`,
		)
		const result = await runAstrumScena(site, ['check', 'place-gps-bounds'])
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`${PLACE_GPS_BOUNDS_PATH}: unknown placeId "atlantis"`)
	})

	it('fails on the old form, naming the missing schemaVersion and the supported ones', async () => {
		const { site } = makeImageSite(scratch, 'gate-legacy')
		writeFileSync(path.join(site, PLACE_GPS_BOUNDS_PATH), LEGACY_BOUNDS)
		const result = await runAstrumScena(site, ['check', 'place-gps-bounds'])
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			`${PLACE_GPS_BOUNDS_PATH}: missing schemaVersion; supported: 1`,
		)
	})

	// the step of UPGRADING.md: move `config/place-gps-bounds.yaml` next to the places and rename
	// `version` to `schemaVersion`; the zones stay as they are
	it('passes on the file the upgrade step writes from the old one', async () => {
		const { site } = makeImageSite(scratch, 'gate-upgraded')
		const legacy = path.join(site, 'config/place-gps-bounds.yaml')
		mkdirSync(path.dirname(legacy), { recursive: true })
		writeFileSync(legacy, LEGACY_BOUNDS)
		upgradePlaceGpsBounds(site)
		const upgraded = readFileSync(path.join(site, PLACE_GPS_BOUNDS_PATH), 'utf8')
		expect(upgraded).toBe(LEGACY_BOUNDS.replace('version: 1', 'schemaVersion: 1'))
		const result = await runAstrumScena(site, ['check', 'place-gps-bounds'])
		expect(result.status, result.stderr).toBe(0)
	})
})
