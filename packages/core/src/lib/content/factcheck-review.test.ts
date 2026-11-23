import { describe, expect, it } from 'vitest'

import { type Factcheck, factcheckSourceDigest, parseFactcheck } from './factcheck.ts'
import { FACTCHECK_REVIEW_RELATIVE_PATH, serializeFactcheckReview } from './factcheck-review.ts'
import { parseDocumentFile } from './translation-marker.ts'

function makeSource(key: string, body: string) {
	return parseDocumentFile({
		collection: 'articles',
		filename: `${key}.ru.md`,
		raw: `---\ntranslationKey: ${key}\nlocale: ru\nslug: ${key}\ntitle: Заголовок\nstatus: draft\n---\n\n${body}\n`,
	})
}

const source = makeSource('photogear', 'РУ тело')

const factcheck: Factcheck = parseFactcheck({
	schemaVersion: 1,
	documents: [
		{
			key: 'photogear',
			targetCollection: 'articles',
			sourceDigest: factcheckSourceDigest(source),
			researchedAt: '2026-08-24',
			findings: [
				{
					id: 'prod-x',
					kind: 'product',
					raw: 'Widget 3000',
					status: 'dead',
					evidence: 'снят с производства',
					checkedAt: '2026-08-20',
					recommendation: {
						action: 'end-note',
						noteRu: 'Widget 3000 снят с производства.',
					},
					decision: { status: 'accepted', reviewedByOwner: true },
				},
			],
		},
	],
})

describe('serializeFactcheckReview', () => {
	it('renders the document by key and folder', () => {
		const markdown = serializeFactcheckReview(factcheck)
		expect(markdown).toContain('### `photogear` → articles')
		expect(markdown).toContain('- Документов в ledger: **1**')
		expect(markdown).toContain('decision: accepted\n')
	})

	// staleness is a warning of content:factcheck:check; were it in the packet, an edited document
	// would turn into packet drift and fail the check
	it('projects the ledger alone, without freshness against src/content', () => {
		const markdown = serializeFactcheckReview(factcheck)
		expect(markdown).not.toContain('Source digest')
		expect(markdown).not.toContain('stale**')
	})

	it('lives beside the ledger and names the commands of the bin', () => {
		expect(FACTCHECK_REVIEW_RELATIVE_PATH).toBe('data/factcheck/review.md')
		const markdown = serializeFactcheckReview(factcheck)
		expect(markdown).toContain('`astrum-scena content factcheck review`')
		expect(markdown).not.toContain('pnpm ')
	})

	it('shows the id of each finding, as decide --set takes it', () => {
		expect(serializeFactcheckReview(factcheck)).toContain(
			'decision: accepted\n  - id: `prod-x`\n',
		)
	})

	it('is byte-stable on repeat (drift-gate safe)', () => {
		expect(serializeFactcheckReview(factcheck)).toBe(serializeFactcheckReview(factcheck))
	})
})
