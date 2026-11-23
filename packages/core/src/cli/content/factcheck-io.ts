import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import { loadSiteSection } from '../../config/loader.ts'
import {
	type Factcheck,
	FACTCHECK_RELATIVE_PATH,
	parseFactcheck,
} from '../../lib/content/factcheck.ts'
import {
	FACTCHECK_REVIEW_RELATIVE_PATH,
	serializeFactcheckReview,
} from '../../lib/content/factcheck-review.ts'
import type { ParsedDocumentFile } from '../../lib/content/translation-marker.ts'
import { type CliContext, command } from '../context.ts'
import { loadDocumentFiles } from './documents.ts'
import { formatFor, type PrettierModule, replaceFile } from './prettier.ts'

// the IO of the fact-check commands and gate: the ledger, the reference-locale documents and the
// review packet, both files rendered through the site's prettier so that drift comparisons are byte
// for byte

export const ledgerPath = (root: string): string => path.join(root, FACTCHECK_RELATIVE_PATH)

export const reviewPath = (root: string): string => path.join(root, FACTCHECK_REVIEW_RELATIVE_PATH)

export async function loadFactcheckSources(root: string): Promise<ParsedDocumentFile[]> {
	const { referenceLocale } = loadSiteSection(root, 'content')
	return (await loadDocumentFiles(root)).files.filter((file) => file.locale === referenceLocale)
}

// undefined when the site has no ledger
export async function readFactcheckLedger(root: string): Promise<Factcheck | undefined> {
	let raw: string
	try {
		raw = await readFile(ledgerPath(root), 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
		throw error
	}
	return parseFactcheck(parseYaml(raw))
}

// fail-closed: only the seeder turns a missing file into an empty ledger; any other error
// (unreadable, broken YAML, invalid schema) propagates, so a write never wipes owner findings
export async function loadFactcheckLedger(context: CliContext): Promise<Factcheck> {
	const ledger = await readFactcheckLedger(context.root)
	if (ledger === undefined)
		throw new Error(
			`${FACTCHECK_RELATIVE_PATH}: missing; run ${command(context, 'content factcheck extract')}`,
		)
	return ledger
}

// a fact-check that lags the text is not a failure; on GitHub Actions each item also becomes an
// annotation, so the owner sees it on the run without opening the log
export function printFactcheckWarnings(
	context: CliContext,
	name: string,
	warnings: readonly string[],
): void {
	if (warnings.length === 0) return
	context.err(`${name} WARN: the fact-check lags the text (${warnings.length}):`)
	for (const warning of warnings) {
		context.err(`  - ${warning}`)
		if (context.env.GITHUB_ACTIONS === 'true') {
			const data = `${name}: ${warning}`.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')
			context.out(`::warning::${data}`)
		}
	}
}

export const renderFactcheckReview = (
	prettier: PrettierModule,
	root: string,
	factcheck: Factcheck,
): Promise<string> => formatFor(prettier, reviewPath(root), serializeFactcheckReview(factcheck))

async function replaceCreating(filePath: string, content: string): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true })
	await replaceFile(filePath, content)
}

// the single ledger write path: validates the whole ledger, formats it and replaces the file
// atomically, so a failed run leaves the previous ledger untouched
export async function writeFactcheckLedger(
	prettier: PrettierModule,
	root: string,
	ledger: Factcheck,
): Promise<void> {
	const filePath = ledgerPath(root)
	const formatted = await formatFor(prettier, filePath, stringifyYaml(parseFactcheck(ledger)))
	await replaceCreating(filePath, formatted)
}

export const writeFactcheckReview = (root: string, markdown: string): Promise<void> =>
	replaceCreating(reviewPath(root), markdown)
