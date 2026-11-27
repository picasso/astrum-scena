import { execFileSync, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findTaxonomyReaders, isScanned } from './check-taxonomy-readers.ts'

const CLI = fileURLToPath(new URL('./check-taxonomy-readers.ts', import.meta.url))
const READER = "await readFile(path.join(root, 'src/content/config/places.yaml'), 'utf8')\n"

let repo: string

beforeEach(async () => {
	repo = await mkdtemp(path.join(tmpdir(), 'taxonomy-readers-'))
	execFileSync('git', ['init', '--quiet'], { cwd: repo })
})

afterEach(async () => {
	await rm(repo, { recursive: true, force: true })
})

// untracked files are scanned too, so the temporary repository needs no commit
const runGate = () =>
	spawnSync(process.execPath, ['--experimental-strip-types', CLI], {
		cwd: repo,
		encoding: 'utf8',
	})

async function writeRepoFile(file: string, content: string): Promise<void> {
	await mkdir(path.dirname(path.join(repo, file)), { recursive: true })
	await writeFile(path.join(repo, file), content)
}

describe('findTaxonomyReaders', () => {
	it('names the line of every taxonomy file name', () => {
		expect(
			findTaxonomyReaders(
				'a.ts',
				"const a = 1\nread('categories.yaml', 'tags.yml')\r\nplaces.yaml",
			),
		).toEqual([
			{ file: 'a.ts', line: 2, name: 'categories.yaml' },
			{ file: 'a.ts', line: 2, name: 'tags.yml' },
			{ file: 'a.ts', line: 3, name: 'places.yaml' },
		])
	})

	it("names a path into src/content/config built from a dimension's id", () => {
		expect(
			findTaxonomyReaders('a.ts', "read(`src/content/config/${dimension}.yaml`, 'utf8')"),
		).toEqual([{ file: 'a.ts', line: 1, name: 'content/config/${dimension}' }])
	})

	it('ignores other files and words', () => {
		expect(
			findTaxonomyReaders(
				'a.ts',
				"'featured.yaml', 'subplaces.yaml', 'my-places.yaml', 'places.yaml.bak', places.json",
			),
		).toEqual([])
	})
})

describe('isScanned', () => {
	it.each([
		'packages/core/src/lib/portfolio/photo-page.ts',
		'packages/core/src/components/blocks/gallery.astro',
		'scripts/lib/images/place-gps-bounds.ts',
	])('scans %s', (file) => {
		expect(isScanned(file)).toBe(true)
	})

	it.each([
		'packages/core/src/lib/content/files.ts',
		'scripts/check-taxonomy-readers.ts',
		'packages/core/src/lib/content/files.test.ts',
		'scripts/lib/example.spec.tsx',
		'packages/core/src/lib/blocks/gallery/test-fixtures.ts',
		'packages/core/src/lib/test-fixtures/site.ts',
		'scripts/__fixtures__/site/src/content/config/places.ts',
		'packages/core/src/config/places.yaml',
	])('skips %s', (file) => {
		expect(isScanned(file)).toBe(false)
	})
})

describe('check:taxonomy-readers CLI', () => {
	it('passes when only the loader names the files', async () => {
		await writeRepoFile('packages/core/src/lib/content/files.ts', READER)
		await writeRepoFile('packages/core/src/lib/content/files.test.ts', READER)
		await writeRepoFile('packages/core/src/lib/test-fixtures/site.ts', READER)
		const result = runGate()
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('check:taxonomy-readers OK')
	}, 30_000)

	it.each(['packages/core/src/lib/images/place-bounds.ts', 'scripts/lib/images/gps-bounds.ts'])(
		'fails on a reader of its own in %s and names file and line',
		async (file) => {
			await writeRepoFile(file, `export const a = 1\n${READER}`)
			const result = runGate()
			expect(result.status).toBe(1)
			expect(result.stderr).toContain(`  - ${file}:2: places.yaml`)
		},
		30_000,
	)

	it('fails on a tracked reader, not only untracked ones', async () => {
		await writeRepoFile('scripts/a.ts', READER)
		execFileSync('git', ['add', 'scripts/a.ts'], { cwd: repo })
		const result = runGate()
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('  - scripts/a.ts:1: places.yaml')
	}, 30_000)

	it('scans only the core sources and scripts', async () => {
		await writeRepoFile('demo/astro.config.mjs', READER)
		await writeRepoFile('packages/migrate-wp/src/index.ts', READER)
		expect(runGate().status).toBe(0)
	}, 30_000)

	it('passes when a tracked file is deleted from the working tree', async () => {
		await writeRepoFile('scripts/a.ts', READER)
		execFileSync('git', ['add', 'scripts/a.ts'], { cwd: repo })
		await rm(path.join(repo, 'scripts/a.ts'))
		expect(runGate().status).toBe(0)
	}, 30_000)
})
