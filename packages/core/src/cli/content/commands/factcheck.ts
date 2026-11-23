import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { loadSiteSection } from '../../../config/loader.ts'
import {
	expectedFactcheckTargets,
	extractUrls,
	type Factcheck,
	type FactcheckDocument,
	factcheckSourceDigest,
	markDocumentResearched,
	mergeResearchFindings,
	mergeSeededFindings,
	missingUrlFindings,
	ownHostSet,
	reconcileFactcheck,
	setFindingDecisions,
} from '../../../lib/content/factcheck.ts'
import { FACTCHECK_REVIEW_RELATIVE_PATH } from '../../../lib/content/factcheck-review.ts'
import {
	type CliContext,
	command,
	flagOption,
	label,
	repeatedOption,
	stringOption,
} from '../../context.ts'
import {
	loadFactcheckLedger,
	loadFactcheckSources,
	printFactcheckWarnings,
	readFactcheckLedger,
	renderFactcheckReview,
	writeFactcheckLedger,
	writeFactcheckReview,
} from '../factcheck-io.ts'
import { loadPrettier } from '../prettier.ts'

// the single writer of the fact-check ledger `data/factcheck/ledger.yaml` and of its review packet.
// Every writing command loads prettier first, then the ledger, builds the whole result, validates it
// and replaces the file atomically; any error leaves the file untouched.
//
//   extract [--check]                        seed every reference-locale document and body URL
//                                            (additive); `--check` writes nothing and lists a
//                                            document or URL without an entry as a warning
//   merge --key <k> --findings <file>        merge the researcher's JSON array into one document
//         [--date <yyyy-mm-dd>]
//   researched --key <k> [--date …]          stamp `researchedAt` and the current `sourceDigest`
//   decide --key <k> --set <id=status>…      record the owner's per-finding decisions
//   review                                   regenerate the review packet from the ledger

const NAME = 'content factcheck'

function requiredOption(context: CliContext, mode: string, name: string): string {
	const value = stringOption(context, name)
	if (value === undefined) throw new Error(`${mode} requires ${name}`)
	return value
}

function todayLocal(): string {
	const now = new Date()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const day = String(now.getDate()).padStart(2, '0')
	return `${now.getFullYear()}-${month}-${day}`
}

const dateOption = (context: CliContext): string => stringOption(context, '--date') ?? todayLocal()

function ledgerDocument(context: CliContext, ledger: Factcheck, key: string): FactcheckDocument {
	const document = ledger.documents.find((candidate) => candidate.key === key)
	if (!document)
		throw new Error(`"${key}" is not in the ledger; run ${command(context, `${NAME} extract`)}`)
	return document
}

function withDocument(ledger: Factcheck, updated: FactcheckDocument): Factcheck {
	return {
		...ledger,
		documents: ledger.documents.map((document) =>
			document.key === updated.key ? updated : document,
		),
	}
}

export async function factcheckExtract(context: CliContext): Promise<number> {
	const checkOnly = flagOption(context, '--check')
	const prettier = checkOnly ? undefined : await loadPrettier(context.importPrettier)
	const [sources, existing] = await Promise.all([
		loadFactcheckSources(context.root),
		readFactcheckLedger(context.root),
	])
	const expected = expectedFactcheckTargets(sources)
	const ownHosts = ownHostSet(
		loadSiteSection(context.root, 'origin'),
		loadSiteSection(context.root, 'factcheck').ownHosts,
	)
	const existingDocuments = existing?.documents ?? []
	const existingByKey = new Map(existingDocuments.map((document) => [document.key, document]))
	const missing: string[] = []
	const documents: FactcheckDocument[] = []

	for (const [key, source] of [...expected.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
		const urls = extractUrls(source.body)
		const current = existingByKey.get(key)
		if (!prettier) {
			if (!current) missing.push(`document "${key}" is missing from the ledger`)
			for (const url of missingUrlFindings(current?.findings ?? [], urls))
				missing.push(`document "${key}" is missing a finding for URL ${url}`)
			continue
		}
		// an existing digest is kept (reconcile still detects staleness); a new document gets the
		// current one. `researchedAt` survives only while the text is unchanged: a stale digest means
		// the research is outdated, so the document returns to the not-yet-researched list
		const fresh = factcheckSourceDigest(source)
		const researchStillValid = current?.researchedAt && current.sourceDigest === fresh
		documents.push({
			key,
			targetCollection: source.collection,
			sourceDigest: current ? current.sourceDigest : fresh,
			...(researchStillValid ? { researchedAt: current.researchedAt } : {}),
			findings: mergeSeededFindings(current?.findings ?? [], urls, ownHosts),
		})
	}

	if (!prettier) {
		printFactcheckWarnings(context, `${NAME} extract --check`, missing)
		context.out(`${NAME} extract --check OK`)
		context.out(`  documents: ${expected.size}`)
		return 0
	}

	// ledger entries without a document (renamed or removed file) are kept so no data is lost
	// silently; reconcile flags them
	for (const document of existingDocuments)
		if (!expected.has(document.key)) documents.push(document)
	documents.sort((left, right) => left.key.localeCompare(right.key))
	await writeFactcheckLedger(prettier, context.root, { schemaVersion: 1, documents })

	const totalFindings = documents.reduce((sum, document) => sum + document.findings.length, 0)
	context.out(`${NAME} extract OK`)
	context.out(`  documents: ${documents.length}`)
	context.out(`  findings:  ${totalFindings}`)
	return 0
}

export async function factcheckMerge(context: CliContext): Promise<number> {
	const key = requiredOption(context, 'merge', '--key')
	const findingsPath = path.resolve(context.cwd, requiredOption(context, 'merge', '--findings'))
	const date = dateOption(context)
	const prettier = await loadPrettier(context.importPrettier)
	const ledger = await loadFactcheckLedger(context)
	const document = ledgerDocument(context, ledger, key)
	let input: unknown
	try {
		input = JSON.parse(await readFile(findingsPath, 'utf8'))
	} catch (error) {
		throw new Error(`${label(context, findingsPath)}: ${(error as Error).message}`, {
			cause: error,
		})
	}
	const merged = mergeResearchFindings(document, input, date)
	await writeFactcheckLedger(prettier, context.root, withDocument(ledger, merged))
	const added = merged.findings.length - document.findings.length
	context.out(`${NAME} merge ${key} OK (${merged.findings.length} findings, ${added} added)`)
	return 0
}

export async function factcheckResearched(context: CliContext): Promise<number> {
	const key = requiredOption(context, 'researched', '--key')
	const date = dateOption(context)
	const prettier = await loadPrettier(context.importPrettier)
	const [ledger, sources] = await Promise.all([
		loadFactcheckLedger(context),
		loadFactcheckSources(context.root),
	])
	const source = expectedFactcheckTargets(sources).get(key)
	if (!source) throw new Error(`researched: "${key}" is not a src/content document`)
	const updated = markDocumentResearched(ledgerDocument(context, ledger, key), source, date)
	await writeFactcheckLedger(prettier, context.root, withDocument(ledger, updated))
	context.out(`${NAME} researched ${key} OK (${date})`)
	return 0
}

function parseDecisions(assignments: readonly string[]): Map<string, string> {
	const decisions = new Map<string, string>()
	for (const assignment of assignments) {
		const separator = assignment.lastIndexOf('=')
		if (separator <= 0)
			throw new Error(`decide: --set expects <id>=<status>, got "${assignment}"`)
		const id = assignment.slice(0, separator)
		if (decisions.has(id)) throw new Error(`decide: finding "${id}" is set twice`)
		decisions.set(id, assignment.slice(separator + 1))
	}
	return decisions
}

export async function factcheckDecide(context: CliContext): Promise<number> {
	const key = requiredOption(context, 'decide', '--key')
	const assignments = repeatedOption(context, '--set')
	if (assignments.length === 0)
		throw new Error('decide: at least one --set <id>=<status> is required')
	const decisions = parseDecisions(assignments)
	const prettier = await loadPrettier(context.importPrettier)
	const ledger = await loadFactcheckLedger(context)
	const updated = setFindingDecisions(ledgerDocument(context, ledger, key), decisions)
	await writeFactcheckLedger(prettier, context.root, withDocument(ledger, updated))
	context.out(`${NAME} decide ${key} OK (${assignments.length} decisions)`)
	return 0
}

// read-only towards the documents; byte-identical on repeat. Fails when the ledger does not
// reconcile with the documents, since the packet would mislead the owner; a stale digest or a
// document without an entry only warns
export async function factcheckReview(context: CliContext): Promise<number> {
	const prettier = await loadPrettier(context.importPrettier)
	const [ledger, sources] = await Promise.all([
		loadFactcheckLedger(context),
		loadFactcheckSources(context.root),
	])
	const report = reconcileFactcheck(ledger, sources)
	if (report.errors.length > 0)
		throw new Error(
			`the ledger has reconciliation errors; cannot render the review packet:\n${report.errors
				.map((error) => `  - ${error}`)
				.join('\n')}`,
		)
	printFactcheckWarnings(context, `${NAME} review`, report.warnings)
	await writeFactcheckReview(
		context.root,
		await renderFactcheckReview(prettier, context.root, ledger),
	)
	context.out(`${NAME} review OK`)
	context.out(`  path:      ${FACTCHECK_REVIEW_RELATIVE_PATH}`)
	context.out(`  documents: ${report.counts.documents}, findings: ${report.counts.findings}`)
	return 0
}
