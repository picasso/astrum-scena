import {
	countFindings,
	type Factcheck,
	FACTCHECK_RELATIVE_PATH,
	type FactcheckDocument,
	verifyFactcheck,
} from './factcheck.ts'

// fact-check review packet: the exit point of a `/factcheck` session. The owner reads the claims,
// their status/evidence/proposed fix and decides through `astrum-scena content factcheck decide`
// (`decision.status`, `reviewedByOwner`). Pure and deterministic; rendered through prettier for a
// byte-stable drift gate. It projects the ledger alone: freshness against `src/content` is a warning
// of `astrum-scena check factcheck`, so an edited document never turns into packet drift.

// beside the ledger it projects
export const FACTCHECK_REVIEW_RELATIVE_PATH = 'data/factcheck/review.md'

const COMMAND = 'astrum-scena content factcheck'

const STATUS_ORDER = ['dead', 'renamed', 'moved', 'uncertain', 'self-link', 'alive', 'unchecked']

function inlineCode(value: string): string {
	// CommonMark: a fence longer than any backtick run inside; an edge backtick gets a space pad
	// (stripped on render) so it does not merge with the fence
	const cleaned = value.replace(/[\r\n]+/g, ' ')
	const longestRun = Math.max(0, ...(cleaned.match(/`+/g) ?? []).map((run) => run.length))
	const fence = '`'.repeat(Math.max(1, longestRun + 1))
	const pad = /^`|`$/.test(cleaned) ? ' ' : ''
	return `${fence}${pad}${cleaned}${pad}${fence}`
}

// free text from agents or the owner could carry newlines, `<` or pipes that spoof the packet's
// Markdown structure and, through the drift gate, fail the check
function oneLine(value: string): string {
	return value
		.replace(/[\r\n]+/g, ' ')
		.replace(/</g, '&lt;')
		.replace(/\|/g, '\\|')
		.trim()
}

function renderFinding(finding: FactcheckDocument['findings'][number]): string[] {
	const lines: string[] = []
	const rec = finding.recommendation
	const recLabel =
		rec.action === 'none'
			? 'none'
			: rec.action === 'end-note'
				? `end-note: ${oneLine(rec.noteRu ?? '')}`
				: `${rec.action} → ${oneLine(rec.replacement ?? '')}`
	lines.push(
		`- ${inlineCode(finding.raw)} — _${finding.kind}_ · status: **${finding.status}** · decision: ${finding.decision.status}`,
	)
	// the id `astrum-scena content factcheck decide --set <id>=<status>` takes
	lines.push(`  - id: ${inlineCode(finding.id)}`)
	if (finding.location) lines.push(`  - Контекст: ${oneLine(finding.location)}`)
	if (finding.evidence) lines.push(`  - Доказательство: ${oneLine(finding.evidence)}`)
	lines.push(`  - Рекомендация: ${recLabel}`)
	return lines
}

function renderDocumentSection(document: FactcheckDocument): string {
	const lines: string[] = []
	lines.push(`### \`${document.key}\` → ${document.targetCollection}`)
	lines.push('')
	lines.push(
		`- Ресёрч: ${document.researchedAt ? `проведён ${document.researchedAt}` : '**ещё не проводился**'}`,
	)

	const issues = verifyFactcheck(document)
	const blocking = issues.filter((issue) => issue.severity === 'blocking')
	const advisory = issues.filter((issue) => issue.severity === 'advisory')
	lines.push(
		`- Verification: ${blocking.length === 0 ? 'blocking issues отсутствуют' : `**${blocking.length} blocking**`}${advisory.length > 0 ? `, ${advisory.length} advisory` : ''}`,
	)
	for (const issue of [...blocking, ...advisory]) {
		lines.push(`  - [${issue.severity}] ${oneLine(issue.findingId)}: ${oneLine(issue.detail)}`)
	}

	if (document.findings.length === 0) {
		lines.push('- Находок нет: ledger не содержит находок для документа.')
		lines.push('')
		return lines.join('\n')
	}

	lines.push(`- Находок: **${document.findings.length}**`)
	lines.push('')
	const sorted = [...document.findings].sort((left, right) => {
		const byStatus = STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status)
		return byStatus !== 0 ? byStatus : left.id.localeCompare(right.id)
	})
	for (const finding of sorted) lines.push(...renderFinding(finding))
	lines.push('')
	return lines.join('\n')
}

export function serializeFactcheckReview(factcheck: Factcheck): string {
	const counts = countFindings(factcheck)
	const documents = [...factcheck.documents].sort((left, right) =>
		left.key.localeCompare(right.key),
	)

	const statusTotals = new Map<string, number>()
	for (const document of documents) {
		for (const finding of document.findings) {
			statusTotals.set(finding.status, (statusTotals.get(finding.status) ?? 0) + 1)
		}
	}
	const statusSummary = STATUS_ORDER.filter((status) => statusTotals.has(status))
		.map((status) => `${status} ${statusTotals.get(status)}`)
		.join(', ')

	const lines: string[] = []
	lines.push('# Review packet фактчека')
	lines.push('')
	lines.push(
		`Генерируется детерминированно из \`${FACTCHECK_RELATIVE_PATH}\` командой \`${COMMAND} review\`. Не редактируется вручную: ledger меняют команды \`${COMMAND} {extract,merge,researched,decide}\`, затем пакет регенерируется. Решения владельца записывает \`${COMMAND} decide\` (\`decision.status\`, \`reviewedByOwner\`); принятые фиксы применяет скилл \`/factcheck-apply\` прямо в парных файлах документов \`src/content\` (errata-журнал опционален) — идемпотентно по содержимому файла, без маркеров. Свежесть digest относительно документов опорной локали пакет не показывает: устаревший digest и документ без записи — предупреждения \`astrum-scena check factcheck\`, который сверяет этот пакет с ledger.`,
	)
	lines.push('')
	lines.push('## Сводка')
	lines.push('')
	const researched = documents.filter((document) => document.researchedAt).length
	lines.push(
		`- Документов в ledger: **${counts.documents}**. Находок: **${counts.findings}** (${statusSummary || 'нет'}).`,
	)
	lines.push(
		`- Обработано ресёрчем: **${researched}/${documents.length}**; не обработано: **${documents.length - researched}**.`,
	)
	lines.push(`- Решения: accepted **${counts.accepted}**, open **${counts.open}**.`)
	lines.push('')
	lines.push('## Документы')
	lines.push('')

	for (const document of documents) lines.push(renderDocumentSection(document))

	return `${lines.join('\n').trimEnd()}\n`
}
