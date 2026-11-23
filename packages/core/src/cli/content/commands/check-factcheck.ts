import { readFile } from 'node:fs/promises'

import { reconcileFactcheck, verifyFactcheck } from '../../../lib/content/factcheck.ts'
import { FACTCHECK_REVIEW_RELATIVE_PATH } from '../../../lib/content/factcheck-review.ts'
import { type CliContext, command, label } from '../../context.ts'
import {
	ledgerPath,
	loadFactcheckSources,
	printFactcheckWarnings,
	readFactcheckLedger,
	renderFactcheckReview,
	reviewPath,
} from '../factcheck-io.ts'
import { loadPrettier } from '../prettier.ts'

// the optional fact-check ledger holds together and writes nothing: it fails when the ledger breaks
// its schema, has an entry without a reference-locale document, disagrees with a document's collection
// in targetCollection, has a blocking verify issue, or the committed review packet differs from its
// projection. A stale digest and a document without an entry only warn: the owner re-runs `/factcheck`
// when convenient

const GATE = 'check factcheck'

export async function checkFactcheck(context: CliContext): Promise<number> {
	const fail = (message: string): number => {
		context.err(`${GATE} FAIL: ${message}`)
		return 1
	}
	const regenerate = `Regenerate it: ${command(context, 'content factcheck review')}`

	let ledger
	let sources
	try {
		ledger = await readFactcheckLedger(context.root)
		if (ledger === undefined) {
			context.out(
				`${GATE} OK (no ${label(context, ledgerPath(context.root))}; nothing to check)`,
			)
			return 0
		}
		sources = await loadFactcheckSources(context.root)
	} catch (error) {
		return fail(`contract does not parse/validate: ${(error as Error).message}`)
	}

	const report = reconcileFactcheck(ledger, sources)
	if (report.errors.length > 0)
		return fail(
			`reconciliation errors:\n${report.errors.map((error) => `  - ${error}`).join('\n')}`,
		)

	const blocking = ledger.documents.flatMap((document) =>
		verifyFactcheck(document)
			.filter((issue) => issue.severity === 'blocking')
			.map((issue) => `${document.key} · ${issue.findingId}: ${issue.detail}`),
	)
	if (blocking.length > 0)
		return fail(`blocking verify issues:\n${blocking.map((item) => `  - ${item}`).join('\n')}`)

	let committed: string
	try {
		committed = await readFile(reviewPath(context.root), 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
		return fail(`review packet missing (${FACTCHECK_REVIEW_RELATIVE_PATH}). ${regenerate}.`)
	}
	const prettier = await loadPrettier(context.importPrettier)
	if (committed !== (await renderFactcheckReview(prettier, context.root, ledger)))
		return fail(
			`review packet differs from the projection of the ledger (${FACTCHECK_REVIEW_RELATIVE_PATH}). ${regenerate}.`,
		)

	printFactcheckWarnings(context, GATE, report.warnings)
	const { counts } = report
	context.out(`${GATE} OK`)
	context.out(`  documents: ${counts.documents}, findings: ${counts.findings}`)
	context.out(`  owner: accepted ${counts.accepted}, open ${counts.open}`)
	return 0
}
