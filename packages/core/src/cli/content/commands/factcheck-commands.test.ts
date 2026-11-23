import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import { writeSiteFiles } from '../../../config/fixtures/site-files.ts'
import { loadSiteConfig, loadSiteSection } from '../../../config/loader.ts'
import { siteRoot as demoRoot } from '../../../config/site-root.ts'
import {
	type Factcheck,
	FACTCHECK_RELATIVE_PATH,
	type FactcheckFinding,
	factcheckSourceDigest,
	findingId,
	parseFactcheck,
} from '../../../lib/content/factcheck.ts'
import { FACTCHECK_REVIEW_RELATIVE_PATH } from '../../../lib/content/factcheck-review.ts'
import {
	type DocumentCollection,
	parseDocumentFile,
} from '../../../lib/content/translation-marker.ts'
import { COURSES_COLLECTION } from '../../../modules/courses/manifest.ts'
import { runAstrumScena } from '../../test-fixtures.ts'
import { loadFactcheckSources } from '../factcheck-io.ts'
import { PRETTIER_PACKAGE } from '../prettier.ts'

// the fact-check commands and gate on copies of the demo, with documents of their own in the
// reference locale

const scratch = mkdtempSync(path.join(tmpdir(), 'astrum-scena-factcheck-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const FORMER_HOST = 'old.example.com'

const missingPrettier = () =>
	Promise.reject(
		Object.assign(new Error(`Cannot find package '${PRETTIER_PACKAGE}' imported from x.js`), {
			code: 'ERR_MODULE_NOT_FOUND',
		}),
	)

type Site = { root: string; referenceLocale: string; originHost: string }

const documentPath = (site: Site, collection: DocumentCollection, key: string): string =>
	path.join(site.root, 'src/content', collection, `${key}.${site.referenceLocale}.md`)

const documentText = (site: Site, key: string, body: string): string =>
	`---\ntranslationKey: ${key}\nlocale: ${site.referenceLocale}\nslug: ${key}\ntitle: Title of ${key}\nstatus: draft\n---\n\n${body}\n`

function writeDocument(site: Site, collection: DocumentCollection, key: string, body: string) {
	writeFileSync(documentPath(site, collection, key), documentText(site, key, body))
}

function digestOf(site: Site, collection: DocumentCollection, key: string): string {
	return factcheckSourceDigest(
		parseDocumentFile({
			collection,
			filename: path.basename(documentPath(site, collection, key)),
			raw: readFileSync(documentPath(site, collection, key), 'utf8'),
		}),
	)
}

let copies = 0
// a copy of the demo with a former host of its own and two documents: `alpha` with two external
// links and `selfie` with two links to the site's own hosts
function makeSite(): Site {
	const root = path.join(scratch, `site-${++copies}`)
	cpSync(demoRoot, root, {
		recursive: true,
		filter: (source) => !/(?:^|[\\/])(?:node_modules|dist|\.astro|\.cache)$/.test(source),
	})
	const config = loadSiteConfig(root)
	writeSiteFiles(root, { ...config, factcheck: { ownHosts: [FORMER_HOST] } })
	const site: Site = {
		root,
		referenceLocale: loadSiteSection(root, 'content').referenceLocale,
		originHost: new URL(loadSiteSection(root, 'origin')).host,
	}
	writeDocument(
		site,
		'articles',
		'alpha',
		'Links https://new.example.com/page and https://fresh.example.com/x.',
	)
	writeDocument(
		site,
		'pages',
		'selfie',
		`Own links https://www.${site.originHost}/about/ and https://${FORMER_HOST}/x.`,
	)
	return site
}

const run = (site: Site, ...args: string[]) => runAstrumScena(site.root, args)
const factcheck = (site: Site, ...args: string[]) => run(site, 'content', 'factcheck', ...args)

const ledgerFile = (site: Site) => path.join(site.root, FACTCHECK_RELATIVE_PATH)
const reviewFile = (site: Site) => path.join(site.root, FACTCHECK_REVIEW_RELATIVE_PATH)
const readRaw = (site: Site) => readFileSync(ledgerFile(site), 'utf8')
const readLedger = (site: Site): Factcheck => parseFactcheck(parseYaml(readRaw(site)))
const documentOf = (ledger: Factcheck, key: string) =>
	ledger.documents.find((document) => document.key === key)

function writeLedger(site: Site, ledger: object | string) {
	mkdirSync(path.dirname(ledgerFile(site)), { recursive: true })
	writeFileSync(ledgerFile(site), typeof ledger === 'string' ? ledger : stringifyYaml(ledger))
}

async function extracted(): Promise<Site> {
	const site = makeSite()
	const result = await factcheck(site, 'extract')
	expect(result.status, result.stderr).toBe(0)
	return site
}

function writeFindings(site: Site, value: unknown): string {
	const file = path.join(site.root, '.cache/factcheck/alpha-findings.json')
	mkdirSync(path.dirname(file), { recursive: true })
	writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
	return file
}

// the local calendar date before and after a run, so a run crossing midnight still matches
function localDate(): string {
	const now = new Date()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const day = String(now.getDate()).padStart(2, '0')
	return `${now.getFullYear()}-${month}-${day}`
}

const DEAD = {
	raw: 'https://new.example.com/page',
	kind: 'url',
	status: 'dead',
	evidence: 'gone for good',
	recommendation: { action: 'end-note', noteRu: 'Страница больше не существует.' },
}
const COMPANY = {
	raw: 'Acme',
	kind: 'company',
	status: 'alive',
	evidence: 'still trading',
	recommendation: { action: 'none' },
}

describe('content factcheck extract', () => {
	it('seeds every reference-locale document and its body URLs, courses included', async () => {
		const site = await extracted()
		const ledger = readLedger(site)
		const sources = await loadFactcheckSources(site.root)
		expect(ledger.documents.map((document) => document.key)).toEqual(
			sources.map((source) => source.translationKey).sort(),
		)
		expect(ledger.documents.some((d) => d.targetCollection === COURSES_COLLECTION)).toBe(true)
		const alpha = documentOf(ledger, 'alpha')!
		expect(alpha).toMatchObject({
			targetCollection: 'articles',
			sourceDigest: digestOf(site, 'articles', 'alpha'),
		})
		expect(alpha.researchedAt).toBeUndefined()
		expect(alpha.findings.map((finding) => [finding.raw, finding.status]).sort()).toEqual([
			['https://fresh.example.com/x', 'unchecked'],
			['https://new.example.com/page', 'unchecked'],
		])
		expect(readRaw(site)).toMatch(/^schemaVersion: 1\n/)
	})

	it('seeds links to the origin and the former hosts as self-links', async () => {
		const site = await extracted()
		const selfie = documentOf(readLedger(site), 'selfie')!
		expect(selfie.findings.map((finding) => finding.status)).toEqual(['self-link', 'self-link'])
	})

	it('keeps existing findings, the old digest of a stale document, and drops its researchedAt', async () => {
		const site = makeSite()
		const accepted: FactcheckFinding = {
			id: 'url-old',
			kind: 'url',
			raw: 'https://old.example.net/page',
			status: 'moved',
			evidence: 'moved to the new host',
			recommendation: { action: 'fix-in-place', replacement: 'https://new.example.com/page' },
			decision: { status: 'accepted', reviewedByOwner: true },
		}
		const stale = 'a'.repeat(64)
		writeLedger(site, {
			schemaVersion: 1,
			documents: [
				{
					key: 'alpha',
					targetCollection: 'articles',
					sourceDigest: digestOf(site, 'articles', 'alpha'),
					researchedAt: '2026-08-25',
					findings: [accepted],
				},
				{
					key: 'selfie',
					targetCollection: 'pages',
					sourceDigest: stale,
					researchedAt: '2026-08-25',
					findings: [],
				},
			],
		})
		expect((await factcheck(site, 'extract')).status).toBe(0)
		const ledger = readLedger(site)
		const alpha = documentOf(ledger, 'alpha')!
		expect(alpha.researchedAt).toBe('2026-08-25')
		expect(alpha.findings.find((finding) => finding.id === 'url-old')).toEqual(accepted)
		// the replacement of the accepted fix stands where the old URL was, so it is not seeded
		expect(alpha.findings.map((finding) => finding.raw).sort()).toEqual([
			'https://fresh.example.com/x',
			'https://old.example.net/page',
		])
		const selfie = documentOf(ledger, 'selfie')!
		expect(selfie.sourceDigest).toBe(stale)
		expect(selfie.researchedAt).toBeUndefined()
	})

	it('changes nothing on a second run', async () => {
		const site = await extracted()
		const once = readRaw(site)
		expect((await factcheck(site, 'extract')).status).toBe(0)
		expect(readRaw(site)).toBe(once)
	})

	it('--check lists the gaps as warnings and exits 0, writing nothing, without prettier', async () => {
		const site = makeSite()
		const gaps = await runAstrumScena(
			site.root,
			['content', 'factcheck', 'extract', '--check'],
			{
				importPrettier: missingPrettier,
			},
		)
		expect(gaps.status, gaps.stderr).toBe(0)
		expect(gaps.stderr).toContain('document "alpha" is missing from the ledger')
		expect(gaps.stderr).toContain(
			'document "alpha" is missing a finding for URL https://fresh.example.com/x',
		)
		expect(existsSync(ledgerFile(site))).toBe(false)
		expect((await factcheck(site, 'extract')).status).toBe(0)
		const covered = await factcheck(site, 'extract', '--check')
		expect(covered.status).toBe(0)
		expect(covered.stderr).not.toContain('WARN')
	})

	it('--check still fails on a broken ledger', async () => {
		const site = makeSite()
		writeLedger(site, 'schemaVersion: 1\ndocuments: [{ key: 1 }]\n')
		const result = await factcheck(site, 'extract', '--check')
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`${FACTCHECK_RELATIVE_PATH}: documents.0.`)
	})
})

describe('content factcheck merge', () => {
	it('updates a matched finding, adds a new one with a deterministic id, as open', async () => {
		const site = await extracted()
		const file = writeFindings(site, [DEAD, COMPANY])
		const result = await factcheck(
			site,
			'merge',
			'--key',
			'alpha',
			'--findings',
			file,
			'--date',
			'2026-10-02',
		)
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('content factcheck merge alpha OK (3 findings, 1 added)')
		const alpha = documentOf(readLedger(site), 'alpha')!
		expect(alpha.findings.find((finding) => finding.raw === DEAD.raw)).toEqual({
			...DEAD,
			id: findingId('url', DEAD.raw),
			checkedAt: '2026-10-02',
			decision: { status: 'open', reviewedByOwner: false },
		})
		expect(alpha.findings.find((finding) => finding.raw === 'Acme')!.id).toBe(
			findingId('company', 'Acme'),
		)
	})

	it('reads --findings from the current directory, and dates the findings today by default', async () => {
		const site = await extracted()
		const file = writeFindings(site, [COMPANY])
		const before = localDate()
		const result = await runAstrumScena(scratch, [
			'content',
			'factcheck',
			'merge',
			'--root',
			path.relative(scratch, site.root),
			'--key',
			'alpha',
			'--findings',
			path.relative(scratch, file),
		])
		expect(result.status, result.stderr).toBe(0)
		const added = documentOf(readLedger(site), 'alpha')!.findings.find((f) => f.raw === 'Acme')!
		expect([before, localDate()]).toContain(added.checkedAt)
	})

	it.each([
		['not an array', { raw: 'x' }],
		['an extra field', [{ ...COMPANY, id: 'co-mine' }]],
		['a duplicate (kind, raw)', [COMPANY, COMPANY]],
		[
			'a schema violation',
			[{ ...COMPANY, status: 'unchecked', recommendation: DEAD.recommendation }],
		],
		['broken JSON', '[{'],
	])('fails without writing on %s', async (_label, value) => {
		const site = await extracted()
		const before = readRaw(site)
		const file = writeFindings(site, value)
		const result = await factcheck(site, 'merge', '--key', 'alpha', '--findings', file)
		expect(result.status).toBe(1)
		expect(readRaw(site)).toBe(before)
	})

	it('fails on an unknown key, naming it, and on a bad date, without writing', async () => {
		const site = await extracted()
		const before = readRaw(site)
		const file = writeFindings(site, [COMPANY])
		const unknown = await factcheck(site, 'merge', '--key', 'nope', '--findings', file)
		expect(unknown.status).toBe(1)
		expect(unknown.stderr).toContain(
			'"nope" is not in the ledger; run astrum-scena content factcheck extract',
		)
		const date = await factcheck(
			site,
			'merge',
			'--key',
			'alpha',
			'--findings',
			file,
			'--date',
			'2026-13-01',
		)
		expect(date.status).toBe(1)
		expect(date.stderr).toContain('"2026-13-01" is not a real YYYY-MM-DD date')
		expect(readRaw(site)).toBe(before)
	})

	it('needs --key, --findings and a ledger', async () => {
		const site = makeSite()
		const file = writeFindings(site, [COMPANY])
		expect((await factcheck(site, 'merge', '--findings', file)).stderr).toContain(
			'merge requires --key',
		)
		expect((await factcheck(site, 'merge', '--key', 'alpha')).stderr).toContain(
			'merge requires --findings',
		)
		const missing = await factcheck(site, 'merge', '--key', 'alpha', '--findings', file)
		expect(missing.status).toBe(1)
		expect(missing.stderr).toContain(
			`${FACTCHECK_RELATIVE_PATH}: missing; run astrum-scena content factcheck extract`,
		)
	})
})

describe('content factcheck researched', () => {
	it('stamps researchedAt and the current digest of only that document', async () => {
		const site = await extracted()
		writeDocument(site, 'articles', 'alpha', 'An edited body.')
		const before = readLedger(site)
		const result = await factcheck(site, 'researched', '--key', 'alpha', '--date', '2026-10-01')
		expect(result.status, result.stderr).toBe(0)
		expect(readLedger(site)).toEqual({
			...before,
			documents: before.documents.map((document) =>
				document.key === 'alpha'
					? {
							...document,
							sourceDigest: digestOf(site, 'articles', 'alpha'),
							researchedAt: '2026-10-01',
						}
					: document,
			),
		})
	})

	it('fails without writing on an unknown key, a document outside the ledger and a bad date', async () => {
		const site = await extracted()
		writeDocument(site, 'pages', 'gamma', 'A new document.')
		const before = readRaw(site)
		const ghost = await factcheck(site, 'researched', '--key', 'ghost')
		expect(ghost.stderr).toContain('"ghost" is not a src/content document')
		const gamma = await factcheck(site, 'researched', '--key', 'gamma')
		expect(gamma.stderr).toContain('"gamma" is not in the ledger')
		const date = await factcheck(site, 'researched', '--key', 'alpha', '--date', '2026-02-30')
		for (const result of [ghost, gamma, date]) expect(result.status).toBe(1)
		const bogus = await factcheck(site, 'researched', '--key', 'alpha', '--bogus')
		expect(bogus.status).toBe(2)
		expect(readRaw(site)).toBe(before)
	})
})

describe('content factcheck decide', () => {
	async function merged(): Promise<Site> {
		const site = await extracted()
		const file = writeFindings(site, [DEAD, COMPANY])
		expect((await factcheck(site, 'merge', '--key', 'alpha', '--findings', file)).status).toBe(
			0,
		)
		return site
	}

	it('records decisions and derives reviewedByOwner, changing only the targeted findings', async () => {
		const site = await merged()
		const dead = findingId('url', DEAD.raw)
		const company = findingId('company', 'Acme')
		const result = await factcheck(
			site,
			'decide',
			'--key',
			'alpha',
			'--set',
			`${dead}=accepted`,
			'--set',
			`${company}=rejected`,
		)
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('content factcheck decide alpha OK (2 decisions)')
		const findings = documentOf(readLedger(site), 'alpha')!.findings
		const decision = (id: string) => findings.find((finding) => finding.id === id)!.decision
		expect(decision(dead)).toEqual({ status: 'accepted', reviewedByOwner: true })
		expect(decision(company)).toEqual({ status: 'rejected', reviewedByOwner: false })

		const before = readRaw(site).split('\n')
		expect(
			(await factcheck(site, 'decide', '--key', 'alpha', '--set', `${dead}=deferred`)).status,
		).toBe(0)
		const after = readRaw(site).split('\n')
		expect(after).toHaveLength(before.length)
		expect(
			after.filter((line, index) => line !== before[index]).map((line) => line.trim()),
		).toEqual(['status: deferred', 'reviewedByOwner: false'])
	})

	it('addresses a finding whose id contains =, splitting at the last =', async () => {
		const site = await extracted()
		const ledger = readLedger(site)
		writeLedger(site, {
			...ledger,
			documents: ledger.documents.map((document) =>
				document.key === 'selfie'
					? { ...document, findings: [{ ...document.findings[0]!, id: 'self=link' }] }
					: document,
			),
		})
		const result = await factcheck(
			site,
			'decide',
			'--key',
			'selfie',
			'--set',
			'self=link=rejected',
		)
		expect(result.status, result.stderr).toBe(0)
		expect(documentOf(readLedger(site), 'selfie')!.findings[0]!.decision).toEqual({
			status: 'rejected',
			reviewedByOwner: false,
		})
	})

	it('fails without writing on an unknown id or status, or without --set', async () => {
		const site = await merged()
		const before = readRaw(site)
		const dead = findingId('url', DEAD.raw)
		const unknown = await factcheck(
			site,
			'decide',
			'--key',
			'alpha',
			'--set',
			`${dead}=rejected`,
			'--set',
			'url-ghost=open',
		)
		expect(unknown.stderr).toContain('document "alpha" has no finding "url-ghost"')
		const status = await factcheck(site, 'decide', '--key', 'alpha', '--set', `${dead}=maybe`)
		expect(status.stderr).toContain('"maybe" is not a decision status')
		const none = await factcheck(site, 'decide', '--key', 'alpha')
		expect(none.stderr).toContain('at least one --set <id>=<status> is required')
		for (const result of [unknown, status, none]) expect(result.status).toBe(1)
		expect(readRaw(site)).toBe(before)
	})
})

describe('the writing fact-check commands without prettier', () => {
	it('fail asking to install it and write nothing', async () => {
		const site = await extracted()
		const before = readRaw(site)
		const file = writeFindings(site, [COMPANY])
		for (const args of [
			['extract'],
			['merge', '--key', 'alpha', '--findings', file],
			['researched', '--key', 'alpha'],
			['decide', '--key', 'alpha', '--set', 'url-x=open'],
			['review'],
		]) {
			const result = await runAstrumScena(site.root, ['content', 'factcheck', ...args], {
				importPrettier: missingPrettier,
			})
			expect(result.status, args.join(' ')).toBe(1)
			expect(result.stderr).toContain('pnpm add -D prettier')
		}
		expect(readRaw(site)).toBe(before)
		expect(existsSync(reviewFile(site))).toBe(false)
	})
})

describe('content factcheck review and check factcheck', () => {
	it('passes on the demo without a ledger', async () => {
		const result = await run(makeSite(), 'check', 'factcheck')
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain(
			`check factcheck OK (no ${FACTCHECK_RELATIVE_PATH}; nothing to check)`,
		)
	})

	it('passes the ledger and packet of extract → merge → decide → review; review is byte-stable', async () => {
		const site = await extracted()
		const file = writeFindings(site, [DEAD, COMPANY])
		expect((await factcheck(site, 'merge', '--key', 'alpha', '--findings', file)).status).toBe(
			0,
		)
		const set = `${findingId('url', DEAD.raw)}=accepted`
		expect((await factcheck(site, 'decide', '--key', 'alpha', '--set', set)).status).toBe(0)
		const review = await factcheck(site, 'review')
		expect(review.status, review.stderr).toBe(0)
		expect(review.stdout).toContain(`path:      ${FACTCHECK_REVIEW_RELATIVE_PATH}`)
		const packet = readFileSync(reviewFile(site), 'utf8')
		expect(packet).toContain('### `alpha` → articles')
		expect(packet).toContain('decision: accepted')
		expect(packet).toContain(`decision: accepted\n  - id: \`${findingId('url', DEAD.raw)}\``)
		expect(packet).toContain(`Доказательство: ${DEAD.evidence}`)
		expect(packet).toContain(`Рекомендация: end-note: ${DEAD.recommendation.noteRu}`)

		const check = await run(site, 'check', 'factcheck')
		expect(check.status, check.stderr).toBe(0)
		expect(check.stdout).toContain('check factcheck OK')
		expect(check.stdout).toContain('owner: accepted 1, open ')
		expect(check.stderr).not.toContain('WARN')

		expect((await factcheck(site, 'review')).status).toBe(0)
		expect(readFileSync(reviewFile(site), 'utf8')).toBe(packet)
		const all = await run(site, 'check')
		expect(all.stdout).toContain('check factcheck OK')
	})

	it('fails on a ledger edited without review, naming the review command', async () => {
		const site = await extracted()
		expect((await factcheck(site, 'review')).status).toBe(0)
		const set = `${documentOf(readLedger(site), 'selfie')!.findings[0]!.id}=rejected`
		expect((await factcheck(site, 'decide', '--key', 'selfie', '--set', set)).status).toBe(0)
		const result = await run(site, 'check', 'factcheck')
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('review packet differs from the projection of the ledger')
		expect(result.stderr).toContain('Regenerate it: astrum-scena content factcheck review')
	})

	it('fails on a missing packet, naming the review command', async () => {
		const site = await extracted()
		const result = await run(site, 'check', 'factcheck')
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			`review packet missing (${FACTCHECK_REVIEW_RELATIVE_PATH}). Regenerate it: astrum-scena content factcheck review`,
		)
	})

	it('fails on the old version key, naming the missing schemaVersion and the supported ones', async () => {
		const site = await extracted()
		writeLedger(site, readRaw(site).replace(/^schemaVersion: 1$/m, 'version: 1'))
		const result = await run(site, 'check', 'factcheck')
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			`${FACTCHECK_RELATIVE_PATH}: missing schemaVersion; supported: 1`,
		)
	})

	it('only warns, naming the keys, on a stale digest and a document without an entry', async () => {
		const site = await extracted()
		expect((await factcheck(site, 'review')).status).toBe(0)
		writeDocument(site, 'articles', 'alpha', 'A new text.')
		writeDocument(site, 'pages', 'gamma', 'A new document.')
		const result = await runAstrumScena(site.root, ['check', 'factcheck'], {
			env: { GITHUB_ACTIONS: 'true' },
		})
		expect(result.status, result.stderr).toBe(0)
		expect(result.stderr).toContain('check factcheck WARN: the fact-check lags the text (2):')
		expect(result.stderr).toContain('"alpha": sourceDigest is stale')
		expect(result.stderr).toContain(
			'missing document "gamma"; run astrum-scena content factcheck extract, then /factcheck gamma',
		)
		expect(result.stdout).toContain(
			'::warning::check factcheck: factcheck "alpha": sourceDigest is stale',
		)
	})

	it('fails on an entry without a document, and review refuses to render it', async () => {
		const site = await extracted()
		expect((await factcheck(site, 'review')).status).toBe(0)
		rmSync(documentPath(site, 'pages', 'selfie'))
		const result = await run(site, 'check', 'factcheck')
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('"selfie" is not a src/content document')
		const review = await factcheck(site, 'review')
		expect(review.status).toBe(1)
		expect(review.stderr).toContain('cannot render the review packet')
	})

	it('fails on a blocking verify issue', async () => {
		const site = await extracted()
		const ledger = readLedger(site)
		writeLedger(site, {
			...ledger,
			documents: ledger.documents.map((document) =>
				document.key === 'alpha'
					? {
							...document,
							findings: [
								{
									...document.findings[0]!,
									status: 'alive',
									recommendation: {
										action: 'fix-in-place',
										replacement: 'https://new.example.com/',
									},
								},
							],
						}
					: document,
			),
		})
		const result = await run(site, 'check', 'factcheck')
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('blocking verify issues:')
		expect(result.stderr).toContain('action "fix-in-place" is not allowed for status "alive"')
	})

	it('fails with a ledger and without prettier, asking to install it', async () => {
		const site = await extracted()
		expect((await factcheck(site, 'review')).status).toBe(0)
		const result = await runAstrumScena(site.root, ['check', 'factcheck'], {
			importPrettier: missingPrettier,
		})
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('pnpm add -D prettier')
	})
})

// the step of UPGRADING.md: rename `version` of the ledger to `schemaVersion`, delete the packet the
// site's script wrote under docs/ and regenerate it beside the ledger
describe('the upgraded ledger', () => {
	it('passes check factcheck after the upgrade step', async () => {
		const site = await extracted()
		const legacy = readRaw(site).replace(/^schemaVersion: 1$/m, 'version: 1')
		writeLedger(site, legacy)
		const oldPacket = path.join(site.root, 'docs/factcheck-review.md')
		mkdirSync(path.dirname(oldPacket), { recursive: true })
		writeFileSync(oldPacket, '# Review packet\n')
		expect((await run(site, 'check', 'factcheck')).status).toBe(1)

		writeLedger(site, legacy.replace(/^version: 1$/m, 'schemaVersion: 1'))
		rmSync(oldPacket)
		expect((await factcheck(site, 'review')).status).toBe(0)
		const result = await run(site, 'check', 'factcheck')
		expect(result.status, result.stderr).toBe(0)
	})
})

// the step of UPGRADING.md: a packet written before it showed the finding ids differs from the
// projection of the ledger until review writes it again
describe('the upgraded review packet', () => {
	it('fails check factcheck until review rewrites it with the finding ids', async () => {
		const site = await extracted()
		const file = writeFindings(site, [DEAD, COMPANY])
		expect((await factcheck(site, 'merge', '--key', 'alpha', '--findings', file)).status).toBe(
			0,
		)
		expect((await factcheck(site, 'review')).status).toBe(0)
		const current = readFileSync(reviewFile(site), 'utf8')
		const old = current.replace(/^ {2}- id: .*\n/gm, '')
		expect(old).not.toBe(current)
		writeFileSync(reviewFile(site), old)
		const stale = await run(site, 'check', 'factcheck')
		expect(stale.status).toBe(1)
		expect(stale.stderr).toContain('Regenerate it: astrum-scena content factcheck review')

		expect((await factcheck(site, 'review')).status).toBe(0)
		expect(readFileSync(reviewFile(site), 'utf8')).toBe(current)
		const result = await run(site, 'check', 'factcheck')
		expect(result.status, result.stderr).toBe(0)
	})
})
