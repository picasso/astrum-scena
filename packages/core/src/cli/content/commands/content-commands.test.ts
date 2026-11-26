import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'

import { writeSiteFiles } from '../../../config/fixtures/site-files.ts'
import { loadSiteConfig, loadSiteSection } from '../../../config/loader.ts'
import { siteRoot as demoRoot } from '../../../config/site-root.ts'
import { lockedModules } from '../../../lib/content/files.ts'
import { digestTranslationSource } from '../../../lib/content/translation-freshness.ts'
import { buildDocumentPairs, parseDocumentFile } from '../../../lib/content/translation-marker.ts'
import {
	COURSES_COLLECTION,
	COURSES_MODULE_ID,
	COURSES_SEGMENT,
} from '../../../modules/courses/manifest.ts'
import { runAstrumScena } from '../../test-fixtures.ts'
import { loadDocumentFiles } from '../documents.ts'
import { PRETTIER_PACKAGE } from '../prettier.ts'

// the content gate and the translation-marker commands on copies of the demo

const scratch = mkdtempSync(path.join(tmpdir(), 'astrum-scena-content-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let copies = 0
function makeSite(): string {
	const site = path.join(scratch, `site-${++copies}`)
	cpSync(demoRoot, site, {
		recursive: true,
		filter: (source) => !/(?:^|[\\/])(?:node_modules|dist|\.astro|\.cache)$/.test(source),
	})
	return site
}

const edit = (file: string, change: (source: string) => string) =>
	writeFileSync(file, change(readFileSync(file, 'utf8')))

// every document of the site by its path, to tell which bytes a command changed
function snapshot(site: string): Map<string, string> {
	const content = path.join(site, 'src/content')
	return new Map(
		readdirSync(content, { recursive: true, encoding: 'utf8' })
			.filter((file) => /\.mdx?$/.test(file))
			.map((file) => [file, readFileSync(path.join(content, file), 'utf8')]),
	)
}

async function sitePairs(site: string) {
	const { files, pathOf } = await loadDocumentFiles(site, lockedModules(site))
	return buildDocumentPairs(files, loadSiteSection(site, 'content')).map((pair) => ({
		pair,
		selector: `${pair.collection}/${pair.translationKey}`,
		label: `${pair.collection}/${pair.translationKey} (${pair.translation.locale})`,
		referencePath: pathOf(pair.reference),
		translationPath: pathOf(pair.translation),
	}))
}

const firstPair = async (site: string) => (await sitePairs(site))[0]!

// the status `check` prints for a pair, on the line of its label
const statusOf = (stdout: string, label: string) =>
	stdout
		.split('\n')
		.find((line) => line.includes(` ${label}`))
		?.trim()
		.split(' ')[0]

const bodyOf = (text: string) => text.slice(text.indexOf('\n---\n', 4) + 5)
const withoutMarker = (text: string) => text.replace(/^translatedFromDigest: .*\n/m, '')

const missingPrettier = () =>
	Promise.reject(
		Object.assign(new Error(`Cannot find package '${PRETTIER_PACKAGE}' imported from x.js`), {
			code: 'ERR_MODULE_NOT_FOUND',
		}),
	)

describe('check content', () => {
	it('passes on the demo with the counts of its collections', async () => {
		const result = await runAstrumScena(makeSite(), ['check', 'content'])
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toMatch(
			/^check content OK \(\d+ albums, \d+ photos, \d+ articles, \d+ pages, \d+ courses\)$/m,
		)
	})

	it('fails on a broken reference with its code and the path of the entry', async () => {
		const site = makeSite()
		edit(path.join(site, 'src/content/photos/amber-dunes.yaml'), (source) =>
			source.replace(/^placeId: .*$/m, 'placeId: nowhere'),
		)
		const result = await runAstrumScena(site, ['check', 'content'])
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('check content FAIL: Content integrity failed:')
		expect(result.stderr).toContain(
			'[unknown-reference] photos.amber-dunes.placeId: Unknown place "nowhere"',
		)
	})

	it('names the file of an entry that breaks its schema', async () => {
		const site = makeSite()
		edit(path.join(site, 'src/content/albums/coastal-light.yaml'), (source) =>
			source.replace(/^layout: .*$/m, 'layout: spiral'),
		)
		const result = await runAstrumScena(site, ['check', 'content'])
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('src/content/albums/coastal-light.yaml: layout: ')
	})

	it("checks the albums against the site's own categories", async () => {
		const site = makeSite()
		const config = loadSiteConfig(site)
		writeSiteFiles(site, {
			...config,
			content: {
				...config.content,
				taxonomy: { ...config.content.taxonomy, categories: ['journeys', 'studies'] },
			},
		})
		const label = (text: string) =>
			Object.fromEntries(config.content.locales.map((locale) => [locale, text]))
		writeFileSync(
			path.join(site, 'src/content/config/categories.yaml'),
			stringify({
				schemaVersion: 2,
				categories: [
					{ id: 'journeys', label: label('Journeys') },
					{ id: 'studies', label: label('Studies') },
				],
			}),
		)
		const setCategory = (album: string, category: string) =>
			edit(path.join(site, `src/content/albums/${album}.yaml`), (source) =>
				source.replace(/^category: .*$/m, `category: ${category}`),
			)
		setCategory('coastal-light', 'studies')
		setCategory('geometry-studies', 'journeys')
		const passed = await runAstrumScena(site, ['check', 'content'])
		expect(passed.status, passed.stderr).toBe(0)

		setCategory('geometry-studies', 'series')
		const failed = await runAstrumScena(site, ['check', 'content'])
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain(
			'src/content/albums/geometry-studies.yaml: category: "series" is not one of content.taxonomy.categories [journeys, studies]',
		)
	})

	it('fails on content of a module the lock leaves disabled, as the build does', async () => {
		const site = makeSite()
		const config = loadSiteConfig(site)
		const { [COURSES_MODULE_ID]: _courses, ...modules } = config.modules
		void _courses
		writeSiteFiles(site, {
			...config,
			modules,
			menu: {
				...config.menu,
				items: config.menu.items.filter((item) => item.segment !== COURSES_SEGMENT),
			},
		})
		const result = await runAstrumScena(site, ['check', 'content'])
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			`content of module "${COURSES_MODULE_ID}", which is not enabled in site.yaml`,
		)
	})
})

describe('content translation-marker check', () => {
	it('reports every pair current on the demo', async () => {
		const result = await runAstrumScena(makeSite(), ['content', 'translation-marker', 'check'])
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toMatch(/— \d+ pairs, 0 need review \(advisory\)/)
		expect(result.stdout).not.toContain('needs-review')
		const course = readdirSync(path.join(demoRoot, 'src/content', COURSES_COLLECTION))[0]!
		expect(statusOf(result.stdout, `${COURSES_COLLECTION}/${course.split('.')[0]} (`)).toBe(
			'current',
		)
	})

	it('reports a translation of an edited reference body as needs-review and exits 0', async () => {
		const site = makeSite()
		const { label, referencePath } = await firstPair(site)
		edit(referencePath, (source) => `${source}\nA new paragraph.\n`)
		const result = await runAstrumScena(site, ['content', 'translation-marker', 'check'])
		expect(result.status, result.stderr).toBe(0)
		expect(statusOf(result.stdout, label)).toBe('needs-review')
		expect(result.stdout).toMatch(/— \d+ pairs, 1 need review \(advisory\)/)
	})

	it('leaves out a draft in the reference locale only, which check content passes', async () => {
		const site = makeSite()
		const before = await sitePairs(site)
		const { referenceLocale } = loadSiteSection(site, 'content')
		writeFileSync(
			path.join(site, 'src/content/articles', `draft-only.${referenceLocale}.md`),
			`---\ntranslationKey: draft-only\nlocale: ${referenceLocale}\nslug: draft-only\ntitle: Draft\nstatus: draft\n---\n\nNot translated yet.\n`,
		)
		expect((await runAstrumScena(site, ['check', 'content'])).status).toBe(0)
		const result = await runAstrumScena(site, ['content', 'translation-marker', 'check'])
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain(`— ${before.length} pairs, 0 need review (advisory)`)
		expect(result.stdout).not.toContain('draft-only')
	})

	it('runs without prettier', async () => {
		const result = await runAstrumScena(
			makeSite(),
			['content', 'translation-marker', 'check'],
			{
				importPrettier: missingPrettier,
			},
		)
		expect(result.status, result.stderr).toBe(0)
	})
})

describe('content translation-marker confirm', () => {
	it('needs --document or --all, naming both', async () => {
		const result = await runAstrumScena(makeSite(), [
			'content',
			'translation-marker',
			'confirm',
		])
		expect(result.status).not.toBe(0)
		expect(result.stderr).toContain('confirm requires --document <collection>/<key> or --all')
	})

	it('refuses --all with --document, a duplicate and an unknown selector', async () => {
		const site = makeSite()
		const { selector } = await firstPair(site)
		const confirm = (...args: string[]) =>
			runAstrumScena(site, ['content', 'translation-marker', 'confirm', ...args])
		expect((await confirm('--all', '--document', selector)).stderr).toContain(
			'--all and --document cannot be combined',
		)
		expect((await confirm('--document', selector, `--document=${selector}`)).stderr).toContain(
			'duplicate --document selector',
		)
		const unknown = await confirm('--document', 'articles/nope')
		expect(unknown.status).toBe(1)
		expect(unknown.stderr).toContain('no document pair for selector "articles/nope"')
	})

	it('plans without --write and changes no file, even without prettier', async () => {
		const site = makeSite()
		const { label, translationPath } = await firstPair(site)
		edit(translationPath, withoutMarker)
		const before = snapshot(site)
		const result = await runAstrumScena(
			site,
			['content', 'translation-marker', 'confirm', '--all'],
			{ importPrettier: missingPrettier },
		)
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('1 to confirm')
		expect(result.stdout).toContain('(dry-run)')
		expect(result.stdout).toContain(`  · ${label} (insert)`)
		expect(result.stdout).toContain('run with --write')
		expect(snapshot(site)).toEqual(before)
	})

	it('writes the marker into the selected translation only, its body byte for byte', async () => {
		const site = makeSite()
		const { pair, selector, label, translationPath } = await firstPair(site)
		edit(translationPath, withoutMarker)
		const before = snapshot(site)
		const result = await runAstrumScena(site, [
			'content',
			'translation-marker',
			'confirm',
			'--document',
			selector,
			'--write',
		])
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain(`  + ${label} (insert)`)
		expect(result.stdout).toContain('confirm OK (1 written)')

		const after = snapshot(site)
		const written = path.relative(path.join(site, 'src/content'), translationPath)
		const raw = after.get(written)!
		expect(bodyOf(raw)).toBe(bodyOf(before.get(written)!))
		const parsed = parseDocumentFile({
			collection: pair.collection,
			filename: path.basename(translationPath),
			raw,
		})
		expect(parsed.marker).toBe(digestTranslationSource(pair.reference.body))
		for (const [file, source] of before)
			if (file !== written) expect(after.get(file), file).toBe(source)

		const check = await runAstrumScena(site, ['content', 'translation-marker', 'check'])
		expect(statusOf(check.stdout, label)).toBe('current')
		expect(check.stdout).toMatch(/— \d+ pairs, 0 need review/)
		const again = await runAstrumScena(site, [
			'content',
			'translation-marker',
			'confirm',
			'--document',
			selector,
			'--write',
		])
		expect(again.stdout).toContain(`  = ${label} (current)`)
		expect(snapshot(site)).toEqual(after)
	})

	it('writes the marker into every translation of repeated --document selectors', async () => {
		const site = makeSite()
		const pairs = await sitePairs(site)
		const chosen = [pairs[0]!, pairs.at(-1)!]
		expect(chosen[0]!.pair.collection).not.toBe(chosen[1]!.pair.collection)
		for (const { translationPath } of chosen) edit(translationPath, withoutMarker)
		const result = await runAstrumScena(site, [
			'content',
			'translation-marker',
			'confirm',
			...chosen.flatMap(({ selector }) => ['--document', selector]),
			'--write',
		])
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('confirm OK (2 written)')
		for (const { pair, translationPath } of chosen) {
			const parsed = parseDocumentFile({
				collection: pair.collection,
				filename: path.basename(translationPath),
				raw: readFileSync(translationPath, 'utf8'),
			})
			expect(parsed.marker, translationPath).toBe(
				digestTranslationSource(pair.reference.body),
			)
		}
	})

	it('fails with --write without prettier, asking to install it, and writes nothing', async () => {
		const site = makeSite()
		const { translationPath } = await firstPair(site)
		edit(translationPath, withoutMarker)
		const before = snapshot(site)
		const result = await runAstrumScena(
			site,
			['content', 'translation-marker', 'confirm', '--all', '--write'],
			{ importPrettier: missingPrettier },
		)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('pnpm add -D prettier')
		expect(snapshot(site)).toEqual(before)
	})
})

describe('content translation-marker compute', () => {
	it('prints the digest of the reference body of a key', async () => {
		const site = makeSite()
		const { pair } = await firstPair(site)
		const result = await runAstrumScena(site, [
			'content',
			'translation-marker',
			'compute',
			'--key',
			pair.translationKey,
		])
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toBe(`${digestTranslationSource(pair.reference.body)}\n`)
	})

	it('needs --key and fails on an unknown key, naming it', async () => {
		const site = makeSite()
		const missing = await runAstrumScena(site, ['content', 'translation-marker', 'compute'])
		expect(missing.status).toBe(1)
		expect(missing.stderr).toContain('compute requires --key <key>')
		const unknown = await runAstrumScena(site, [
			'content',
			'translation-marker',
			'compute',
			'--key',
			'nope',
		])
		expect(unknown.status).toBe(1)
		expect(unknown.stderr).toContain('no document pair for key "nope"')
	})

	it('fails on a key two collections share, naming it', async () => {
		const site = makeSite()
		const article = (await sitePairs(site)).find(({ pair }) => pair.collection === 'articles')!
		for (const file of [article.referencePath, article.translationPath])
			cpSync(file, path.join(site, 'src/content/pages', path.basename(file)))
		const result = await runAstrumScena(site, [
			'content',
			'translation-marker',
			'compute',
			'--key',
			article.pair.translationKey,
		])
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			`key "${article.pair.translationKey}" is ambiguous across collections`,
		)
	})
})
