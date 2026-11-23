import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { siteRoot } from '../../../config/site-root.ts'
import { IMAGE_SETS_CONFIG_PATH, loadImageSets, parseImageSetsConfig } from './image-sets.ts'

describe('parseImageSetsConfig', () => {
	it('accepts a set with albums, direct photos, priority and order', () => {
		const config = parseImageSetsConfig({
			schemaVersion: 1,
			'about-intro': {
				albumIds: ['sunrises', 'northland'],
				photoIds: ['still-symmetry', 'quiet-light'],
				priorityPhotoIds: ['quiet-light'],
				order: 'favorites-first',
			},
		})
		expect(config['about-intro']?.albumIds).toEqual(['sunrises', 'northland'])
	})

	it('accepts a file with no sets (image sets are optional)', () => {
		expect(parseImageSetsConfig({ schemaVersion: 1 })).toEqual({})
	})

	it('rejects an empty file or a missing schemaVersion, naming the file', () => {
		const missing = `${IMAGE_SETS_CONFIG_PATH}: missing schemaVersion; supported: 1`
		expect(() => parseImageSetsConfig(undefined)).toThrow(missing)
		expect(() => parseImageSetsConfig(null)).toThrow(missing)
		expect(() => parseImageSetsConfig({ s: { photoIds: ['a'] } })).toThrow(missing)
	})

	it('accepts every order value', () => {
		for (const order of [
			'source',
			'favorites-first',
			'published-newest',
			'published-oldest',
			'captured-newest',
			'captured-oldest',
		] as const) {
			expect(() =>
				parseImageSetsConfig({ schemaVersion: 1, s: { photoIds: ['a'], order } }),
			).not.toThrow()
		}
	})

	it('rejects an unknown order value', () => {
		expect(() =>
			parseImageSetsConfig({ schemaVersion: 1, s: { photoIds: ['a'], order: 'random' } }),
		).toThrow()
	})

	it('rejects a set without any album or photo', () => {
		expect(() => parseImageSetsConfig({ schemaVersion: 1, s: {} })).toThrow(
			/albumIds or photoIds/,
		)
		expect(() =>
			parseImageSetsConfig({ schemaVersion: 1, s: { albumIds: [], photoIds: [] } }),
		).toThrow(/albumIds or photoIds/)
	})

	it('rejects a non-kebab set key', () => {
		expect(() =>
			parseImageSetsConfig({ schemaVersion: 1, Not_Kebab: { photoIds: ['a'] } }),
		).toThrow(/kebab-case/)
	})

	it('rejects duplicate IDs inside a list', () => {
		expect(() =>
			parseImageSetsConfig({ schemaVersion: 1, s: { photoIds: ['a', 'a'] } }),
		).toThrow(/unique/)
		expect(() =>
			parseImageSetsConfig({
				schemaVersion: 1,
				s: { albumIds: ['x', 'x'], photoIds: ['a'] },
			}),
		).toThrow(/unique/)
		expect(() =>
			parseImageSetsConfig({
				schemaVersion: 1,
				s: { photoIds: ['a'], priorityPhotoIds: ['a', 'a'] },
			}),
		).toThrow(/unique/)
	})

	it('rejects unknown keys via .strict()', () => {
		expect(() =>
			parseImageSetsConfig({ schemaVersion: 1, s: { photoIds: ['a'], label: 'x' } }),
		).toThrow()
	})
})

describe('loadImageSets', () => {
	it('loads image-sets.yaml from the site root', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'image-sets-'))
		mkdirSync(path.join(root, 'src/content/config'), { recursive: true })
		writeFileSync(
			path.join(root, 'src/content/config/image-sets.yaml'),
			'schemaVersion: 1\nabout-intro:\n  photoIds: [quiet-light]\n  order: favorites-first\n',
		)
		try {
			const config = await loadImageSets(root)
			expect(config['about-intro']?.order).toBe('favorites-first')
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	})

	it('gives no sets to a site without image-sets.yaml', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'image-sets-'))
		try {
			expect(await loadImageSets(root)).toEqual({})
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	})

	it('rejects an empty image-sets.yaml as missing its schemaVersion', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'image-sets-'))
		mkdirSync(path.join(root, 'src/content/config'), { recursive: true })
		writeFileSync(path.join(root, IMAGE_SETS_CONFIG_PATH), '')
		try {
			await expect(loadImageSets(root)).rejects.toThrow(
				`${IMAGE_SETS_CONFIG_PATH}: missing schemaVersion; supported: 1`,
			)
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	})

	// the demo's `blocks` page draws its dynamic Gallery from a set
	it('loads the demo site sets, each with a non-empty source', async () => {
		const sets = Object.values(await loadImageSets(siteRoot))
		expect(sets.length).toBeGreaterThan(0)
		for (const set of sets)
			expect((set.albumIds?.length ?? 0) + (set.photoIds?.length ?? 0)).toBeGreaterThan(0)
	})
})
