import { createHash } from 'node:crypto'

import { z } from 'astro/zod'

import { assertSchemaVersion } from '../../config/schema-version.ts'
import { SHA256_HEX_PATTERN } from '../../config/sha256-schema.ts'
import { kebabIdSchema } from './schemas.ts'
import { digestTranslationSource } from './translation-freshness.ts'
import type { DocumentCollection, ParsedDocumentFile } from './translation-marker.ts'

// versioned fact-check contract for external claims (URLs, companies, products, factual assertions)
// in old articles, pages and the documents of the enabled modules. It separates
// finding/verification/recommendation (the machine-validated layer) from putting a fix into the text.
// `/factcheck` fills findings; the owner decides through `astrum-scena content factcheck decide`.
//
// Key invariants (schema + `reconcileFactcheck`): the ledger has no extras or duplicates against the
// reference-locale documents of the site; `targetCollection` is the document's collection. A document
// without an entry and a `sourceDigest` that no longer equals the current digest of the document (see
// `factcheckSourceDigest` — editing the text makes its fact-check stale) are warnings: the owner
// re-runs `/factcheck` when convenient. A finding is structurally consistent: the recommendation
// carries the required fields, `reviewedByOwner` ⇔ accepted. Editorial sense (which status allows
// which action, replacement safety) is checked by `verifyFactcheck`.
//
// The separate batch skill `/factcheck-apply` puts accepted fixes into `src/content`; its idempotency
// is content-based, so the ledger keeps no per-finding markers of that. Pure: the ledger IO and the
// commands live in the `astrum-scena content factcheck` commands.

export const FACTCHECK_RELATIVE_PATH = 'data/factcheck/ledger.yaml'

const EXTRACT_COMMAND = 'astrum-scena content factcheck extract'
const RESEARCHED_COMMAND = 'astrum-scena content factcheck researched'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// the round-trip rejects well-formed but impossible dates such as 2026-13-45
function isValidYmd(value: string): boolean {
	if (!ISO_DATE_PATTERN.test(value)) return false
	const parsed = new Date(`${value}T00:00:00.000Z`)
	return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

// the author's own hosts: links to them are a self-link rewrite onto the new site, not a fact-check of
// an external resource (ADR-0011)
export type OwnHosts = ReadonlySet<string>

// the origin host, every configured former host, and the `www.` variant of each
export function ownHostSet(origin: string, formerHosts: readonly string[]): OwnHosts {
	const hosts = [new URL(origin).host, ...formerHosts].map((host) => host.replace(/^www\./, ''))
	return new Set(hosts.flatMap((host) => [host, `www.${host}`]))
}

// script-capable schemes a replacement link must never carry
const DANGEROUS_URI_PATTERN = /(?:javascript|vbscript):|data:[a-z]+\//i

const findingKindSchema = z.enum(['url', 'company', 'product', 'claim'])
const findingStatusSchema = z.enum([
	'unchecked',
	'alive',
	'moved',
	'renamed',
	'dead',
	'uncertain',
	'self-link',
])
const recommendationActionSchema = z.enum(['fix-in-place', 'end-note', 'self-link-rewrite', 'none'])
const decisionStatusSchema = z.enum(['open', 'accepted', 'rejected', 'deferred'])

const recommendationSchema = z
	.object({
		action: recommendationActionSchema,
		// fix-in-place / self-link-rewrite: the new URL, name or /site path
		replacement: z.string().min(1).optional(),
		// end-note: one line of the author's RU annotation of what changed
		noteRu: z.string().min(1).optional(),
	})
	.strict()

const decisionSchema = z
	.object({
		status: decisionStatusSchema,
		reviewedByOwner: z.boolean(),
	})
	.strict()

const findingSchema = z
	.object({
		// stable within the document, see findingId
		id: z.string().min(1),
		kind: findingKindSchema,
		// the exact source string (URL or entity name)
		raw: z.string().min(1),
		location: z.string().optional(),
		status: findingStatusSchema,
		evidence: z.string().optional(),
		checkedAt: z
			.string()
			.refine(isValidYmd, 'checkedAt must be a real YYYY-MM-DD date')
			.optional(),
		recommendation: recommendationSchema,
		decision: decisionSchema,
	})
	.strict()
	.superRefine((value, context) => {
		const { action, replacement, noteRu } = value.recommendation
		if ((action === 'fix-in-place' || action === 'self-link-rewrite') && !replacement?.trim()) {
			context.addIssue({
				code: 'custom',
				message: `recommendation.action "${action}" requires a non-empty replacement`,
				path: ['recommendation', 'replacement'],
			})
		}
		if (action === 'end-note' && !noteRu?.trim()) {
			context.addIssue({
				code: 'custom',
				message: 'recommendation.action "end-note" requires a non-empty noteRu',
				path: ['recommendation', 'noteRu'],
			})
		}
		if (action === 'none' && (replacement !== undefined || noteRu !== undefined)) {
			context.addIssue({
				code: 'custom',
				message: 'recommendation.action "none" must not carry replacement or noteRu',
				path: ['recommendation'],
			})
		}
		// no fix may be recommended before the finding is verified
		if (value.status === 'unchecked' && action !== 'none') {
			context.addIssue({
				code: 'custom',
				message: 'an unchecked finding must have recommendation.action "none"',
				path: ['recommendation', 'action'],
			})
		}
		if ((value.decision.status === 'accepted') !== value.decision.reviewedByOwner) {
			context.addIssue({
				code: 'custom',
				message:
					'decision.reviewedByOwner must be true exactly when decision.status is accepted',
				path: ['decision', 'reviewedByOwner'],
			})
		}
	})

const documentSchema = z
	.object({
		key: kebabIdSchema,
		targetCollection: z.enum(['articles', 'pages', 'courses']),
		sourceDigest: z
			.string()
			.regex(SHA256_HEX_PATTERN, 'sourceDigest must be a sha256 hex digest'),
		// set by `/factcheck` once researcher and reviewer finish; absent on a fresh seed, which is
		// how the argument-less and `all` modes pick documents still to research
		researchedAt: z
			.string()
			.refine(isValidYmd, 'researchedAt must be a real YYYY-MM-DD date')
			.optional(),
		findings: z.array(findingSchema),
	})
	.strict()
	.superRefine((value, context) => {
		const ids = value.findings.map((finding) => finding.id)
		if (new Set(ids).size !== ids.length) {
			context.addIssue({
				code: 'custom',
				message: `document "${value.key}" has duplicate finding ids`,
				path: ['findings'],
			})
		}
	})

export const factcheckSchema = z
	.object({
		schemaVersion: z.literal(1),
		documents: z.array(documentSchema),
	})
	.strict()
	.superRefine((value, context) => {
		// the additive seeder maps documents by key, so a duplicate would lose the owner's data
		const keys = value.documents.map((document) => document.key)
		if (new Set(keys).size !== keys.length) {
			context.addIssue({
				code: 'custom',
				message: 'factcheck documents must have unique keys',
				path: ['documents'],
			})
		}
	})

export type FindingKind = z.infer<typeof findingKindSchema>
export type FindingStatus = z.infer<typeof findingStatusSchema>
export type RecommendationAction = z.infer<typeof recommendationActionSchema>
export type FactcheckFinding = z.infer<typeof findingSchema>
export type FactcheckDocument = z.infer<typeof documentSchema>
export type Factcheck = z.infer<typeof factcheckSchema>

// the version is checked first, so an older ledger is named as such rather than by its field errors
export function parseFactcheck(value: unknown, filePath = FACTCHECK_RELATIVE_PATH): Factcheck {
	assertSchemaVersion(value, filePath, factcheckSchema)
	const parsed = factcheckSchema.safeParse(value)
	if (!parsed.success) {
		const detail = parsed.error.issues
			.map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
			.join('; ')
		throw new Error(`${filePath}: ${detail}`)
	}
	return parsed.data
}

// fingerprint of a finding's recommendation payload. The JSON array order
// `[raw, action, replacement ?? null, noteRu ?? null]` is fixed, and absent optional fields become
// `null` (not `''`) so "absent" and "empty" never collide.
// `JSON.stringify` escapes deterministically, so the hash is stable across implementations. The first
// 8 hex chars (`digest8`) bind a `:::note{claim}` block in the article body to the exact
// recommendation it renders. Pure.
export function recommendationDigest(finding: FactcheckFinding): string {
	const { action, replacement, noteRu } = finding.recommendation
	const payload = JSON.stringify([finding.raw, action, replacement ?? null, noteRu ?? null])
	return createHash('sha256').update(payload, 'utf8').digest('hex')
}

// in file order: the argument-less mode takes the first, `all` takes the list. A stale digest is
// deliberately not mixed in: `astrum-scena check factcheck` reports it and the owner re-runs research
export function unresearchedDocumentKeys(factcheck: Factcheck): string[] {
	return factcheck.documents
		.filter((document) => !document.researchedAt)
		.map((document) => document.key)
}

// freshness anchor of a fact-check: sha256 of the RU `title` plus the body with the managed
// `:::note` region removed (the same digest rules as translation freshness). An end-note therefore
// never makes the document stale, while a fix-in-place edit to the text does, and the owner re-runs
// `/factcheck <key>`.
export function factcheckSourceDigest(document: Pick<ParsedDocumentFile, 'data' | 'body'>): string {
	return digestTranslationSource(`${document.data.title}\n\n${document.body}`)
}

// --- Deterministic extraction ----------------------------------------------

// quotes, brackets and backtick are excluded so Markdown/HTML markup never leaks into a URL; a URL
// with its own `)` gets truncated, an accepted loss for a rare legacy case
const URL_PATTERN = /https?:\/\/[^\s"'<>)\]`]+/g

export function extractUrls(text: string): string[] {
	const seen = new Set<string>()
	const result: string[] = []
	for (const match of text.matchAll(URL_PATTERN)) {
		const url = match[0].replace(/[.,;:!?]+$/, '')
		if (!seen.has(url)) {
			seen.add(url)
			result.push(url)
		}
	}
	return result
}

export function classifyOwnDomain(url: string, ownHosts: OwnHosts): boolean {
	try {
		return ownHosts.has(new URL(url).host.toLowerCase())
	} catch {
		return false
	}
}

const FINDING_ID_PREFIX: Record<FindingKind, string> = {
	url: 'url',
	company: 'co',
	product: 'prod',
	claim: 'claim',
}

// stable finding id `<prefix>-<sha256(raw)[0..8]>`, derived from the finding itself (no date or
// index) so seeding and merging are deterministic. `taken` (ids already in the document) resolves a
// rare 8-hex prefix collision deterministically by lengthening the hash slice.
export function findingId(
	kind: FindingKind,
	raw: string,
	taken: ReadonlySet<string> = new Set(),
): string {
	const prefix = FINDING_ID_PREFIX[kind]
	const hash = createHash('sha256').update(raw, 'utf8').digest('hex')
	for (let length = 8; length <= hash.length; length += 4) {
		const id = `${prefix}-${hash.slice(0, length)}`
		if (!taken.has(id)) return id
	}
	return `${prefix}-${hash}`
}

export function seedUrlFinding(
	url: string,
	ownHosts: OwnHosts,
	taken: ReadonlySet<string> = new Set(),
): FactcheckFinding {
	return {
		id: findingId('url', url, taken),
		kind: 'url',
		raw: url,
		status: classifyOwnDomain(url, ownHosts) ? 'self-link' : 'unchecked',
		recommendation: { action: 'none' },
		decision: { status: 'open', reviewedByOwner: false },
	}
}

// URLs a finding set already accounts for: every URL finding's `raw`, plus the replacement of an
// accepted fix — once the fix is in the text, its replacement stands where the original URL was.
function coveredUrls(findings: readonly FactcheckFinding[]): Set<string> {
	const covered = new Set(findings.filter((f) => f.kind === 'url').map((f) => f.raw))
	for (const finding of findings) {
		const { action, replacement } = finding.recommendation
		if (
			finding.decision.status === 'accepted' &&
			(action === 'fix-in-place' || action === 'self-link-rewrite') &&
			replacement
		) {
			covered.add(replacement)
		}
	}
	return covered
}

// additive: existing findings stay untouched (their status, evidence, recommendation and decision
// belong to the owner and the agents) and only uncovered URLs are seeded; sorted by id so the
// ledger stays byte-stable
export function mergeSeededFindings(
	existing: readonly FactcheckFinding[],
	urls: readonly string[],
	ownHosts: OwnHosts,
): FactcheckFinding[] {
	const findings = [...existing]
	const present = coveredUrls(findings)
	const takenIds = new Set(findings.map((f) => f.id))
	for (const url of urls) {
		if (present.has(url)) continue
		const finding = seedUrlFinding(url, ownHosts, takenIds)
		findings.push(finding)
		present.add(url)
		takenIds.add(finding.id)
	}
	return findings.sort((left, right) => left.id.localeCompare(right.id))
}

// coverage for `extract --check`
export function missingUrlFindings(
	existing: readonly FactcheckFinding[],
	urls: readonly string[],
): string[] {
	const present = coveredUrls(existing)
	return urls.filter((url) => !present.has(url))
}

// --- Research merge and owner decisions --------------------------------------
//
// Pure ledger writes behind `astrum-scena content factcheck`; the commands validate the whole ledger with
// `parseFactcheck` before writing, so a schema violation produced here never reaches the file.

const researchFindingSchema = z
	.object({
		raw: z.string().min(1),
		kind: findingKindSchema,
		location: z.string().optional(),
		status: findingStatusSchema,
		evidence: z.string().optional(),
		recommendation: recommendationSchema,
	})
	.strict()

const researchFindingsSchema = z.array(researchFindingSchema)

export type ResearchFinding = z.infer<typeof researchFindingSchema>
export type DecisionStatus = z.infer<typeof decisionStatusSchema>

function identityOf(finding: Pick<FactcheckFinding, 'kind' | 'raw'>): string {
	return JSON.stringify([finding.kind, finding.raw])
}

function assertDate(date: string): void {
	if (!isValidYmd(date)) throw new Error(`"${date}" is not a real YYYY-MM-DD date`)
}

// merges the researcher's full findings array into one document, matching by `(kind, raw)`. A matched
// finding gets the researched fields and `checkedAt` and keeps its `id`; it keeps its `decision` only
// while the recommendation is unchanged, since the owner decided that exact payload. A changed
// recommendation and an unmatched finding (added with a deterministic id) are open; a ledger finding
// absent from the input stays as is. Never deletes a finding.
export function mergeResearchFindings(
	document: FactcheckDocument,
	input: unknown,
	date: string,
): FactcheckDocument {
	assertDate(date)
	const research = researchFindingsSchema.parse(input)
	const byIdentity = new Map<string, number>()
	document.findings.forEach((finding, index) => {
		const identity = identityOf(finding)
		if (byIdentity.has(identity)) {
			throw new Error(
				`document "${document.key}" has two findings for ${finding.kind} "${finding.raw}"`,
			)
		}
		byIdentity.set(identity, index)
	})

	const findings = [...document.findings]
	const takenIds = new Set(findings.map((finding) => finding.id))
	const seen = new Set<string>()
	for (const item of research) {
		const identity = identityOf(item)
		if (seen.has(identity)) {
			throw new Error(`research input repeats ${item.kind} "${item.raw}"`)
		}
		seen.add(identity)
		const index = byIdentity.get(identity)
		const current = index === undefined ? undefined : findings[index]!
		const id = current?.id ?? findingId(item.kind, item.raw, takenIds)
		takenIds.add(id)
		const keepsDecision =
			current !== undefined &&
			recommendationDigest(current) ===
				recommendationDigest({ ...current, recommendation: item.recommendation })
		const merged: FactcheckFinding = {
			id,
			kind: item.kind,
			raw: item.raw,
			...(item.location === undefined ? {} : { location: item.location }),
			status: item.status,
			...(item.evidence === undefined ? {} : { evidence: item.evidence }),
			checkedAt: date,
			recommendation: item.recommendation,
			decision: keepsDecision ? current.decision : { status: 'open', reviewedByOwner: false },
		}
		if (index === undefined) findings.push(merged)
		else findings[index] = merged
	}
	return {
		...document,
		findings: findings.sort((left, right) => left.id.localeCompare(right.id)),
	}
}

// records the owner's per-finding decisions; `reviewedByOwner` follows `accepted`. Every id must exist
// in the document, so a typo fails instead of silently deciding nothing.
export function setFindingDecisions(
	document: FactcheckDocument,
	decisions: ReadonlyMap<string, string>,
): FactcheckDocument {
	const ids = new Set(document.findings.map((finding) => finding.id))
	const parsed = new Map<string, DecisionStatus>()
	for (const [id, status] of decisions) {
		if (!ids.has(id)) throw new Error(`document "${document.key}" has no finding "${id}"`)
		const result = decisionStatusSchema.safeParse(status)
		if (!result.success) throw new Error(`"${status}" is not a decision status`)
		parsed.set(id, result.data)
	}
	return {
		...document,
		findings: document.findings.map((finding) => {
			const status = parsed.get(finding.id)
			return status === undefined
				? finding
				: { ...finding, decision: { status, reviewedByOwner: status === 'accepted' } }
		}),
	}
}

// marks a document as researched: today's research is anchored to the current text digest.
export function markDocumentResearched(
	document: FactcheckDocument,
	source: Pick<ParsedDocumentFile, 'data' | 'body'>,
	date: string,
): FactcheckDocument {
	assertDate(date)
	return { ...document, researchedAt: date, sourceDigest: factcheckSourceDigest(source) }
}

// --- Verification -----------------------------------------------------------
//
// Editorial checks of one document. `blocking` means the contract cannot be accepted with that
// finding; `advisory` is only a signal for the review report.

export type FactcheckIssueSeverity = 'blocking' | 'advisory'

export type FactcheckIssue = {
	findingId: string
	code: string
	severity: FactcheckIssueSeverity
	detail: string
}

// editorial policy (ADR-0011): a dead link is fixed onto web.archive or annotated with an end-note;
// `none` is allowed everywhere because the owner may decline any fix
const ALLOWED_ACTIONS_BY_STATUS: Record<FindingStatus, ReadonlySet<RecommendationAction>> = {
	unchecked: new Set(['none']),
	alive: new Set(['none']),
	uncertain: new Set(['none', 'end-note']),
	moved: new Set(['none', 'fix-in-place']),
	renamed: new Set(['none', 'fix-in-place']),
	dead: new Set(['none', 'fix-in-place', 'end-note']),
	'self-link': new Set(['none', 'self-link-rewrite']),
}

const URL_LIKE_PATTERN = /^(?:https?:\/\/|\/|#|mailto:)/i

function normalizeReplacement(replacement: string): string {
	return replacement.replace(/[\u0000-\u001F\u007F]/g, '').trim()
}

// control characters are stripped first because URL parsers drop them (java<TAB>script: →
// javascript:); a bare `https://` has no host and is rejected. Entity smuggling into the scheme
// (`javascript&colon;`, `java&#58script`) is not URL-like, so `non-url-replacement` catches it for
// URL and self-link findings; a company/product name renders as text, where `&` (`AT&T`) is safe
function isUnsafeReplacement(replacement: string): boolean {
	const target = normalizeReplacement(replacement)
	if (!target) return true
	if (DANGEROUS_URI_PATTERN.test(target)) return true
	const hasScheme = /^[a-z][\w+.-]*:/i.test(target)
	if (hasScheme && !URL_LIKE_PATTERN.test(target)) return true
	if (/^https?:\/\//i.test(target)) {
		try {
			if (!new URL(target).host) return true
		} catch {
			return true
		}
	}
	return false
}

export function verifyFactcheck(document: FactcheckDocument): FactcheckIssue[] {
	const issues: FactcheckIssue[] = []
	for (const finding of document.findings) {
		const { action, replacement } = finding.recommendation
		if ((action === 'fix-in-place' || action === 'self-link-rewrite') && replacement) {
			if (isUnsafeReplacement(replacement)) {
				issues.push({
					findingId: finding.id,
					code: 'unsafe-replacement',
					severity: 'blocking',
					detail: `replacement "${replacement}" is an unsafe or malformed link target`,
				})
			}
			// plain text is a valid replacement only for a renamed company, product or claim
			const mustBeUrl = action === 'self-link-rewrite' || finding.kind === 'url'
			if (mustBeUrl && !URL_LIKE_PATTERN.test(normalizeReplacement(replacement))) {
				issues.push({
					findingId: finding.id,
					code: 'non-url-replacement',
					severity: 'blocking',
					detail: `replacement for a ${finding.kind} finding / self-link must be a URL or path, got "${replacement}"`,
				})
			}
		}
		if (!ALLOWED_ACTIONS_BY_STATUS[finding.status].has(action)) {
			issues.push({
				findingId: finding.id,
				code: 'action-status-mismatch',
				severity: 'blocking',
				detail: `action "${action}" is not allowed for status "${finding.status}"`,
			})
		}
		if (finding.decision.status === 'accepted' && finding.status === 'unchecked') {
			issues.push({
				findingId: finding.id,
				code: 'accepted-unchecked',
				severity: 'blocking',
				detail: 'cannot accept a decision on an unchecked finding',
			})
		}
		// research should cite evidence, but its absence does not invalidate the finding
		if (
			finding.status !== 'unchecked' &&
			finding.status !== 'self-link' &&
			!finding.evidence?.trim()
		) {
			issues.push({
				findingId: finding.id,
				code: 'missing-evidence',
				severity: 'advisory',
				detail: `finding is "${finding.status}" but carries no evidence`,
			})
		}
	}
	return issues
}

// --- Reconciliation ---------------------------------------------------------
//
// Read-only join of the ledger with the reference-locale documents of `src/content`. Collects ALL
// errors and mutates nothing.

// expected ledger documents keyed by `translationKey`; the collection is the document's folder. Input
// is the reference-locale document set; a key repeated across collections is fail-closed.
export function expectedFactcheckTargets(
	documents: readonly ParsedDocumentFile[],
): Map<string, ParsedDocumentFile> {
	const expected = new Map<string, ParsedDocumentFile>()
	for (const document of documents) {
		const previous = expected.get(document.translationKey)
		if (previous) {
			throw new Error(
				`document key "${document.translationKey}" is not unique (${previous.collection}/${previous.filename}, ${document.collection}/${document.filename})`,
			)
		}
		expected.set(document.translationKey, document)
	}
	return expected
}

export type FactcheckCounts = {
	documents: number
	findings: number
	accepted: number
	open: number
}

// `errors` break the contract; `warnings` (a stale digest, a document without an entry) only mean the
// fact-check is behind the text
export type FactcheckReport = {
	errors: string[]
	warnings: string[]
	counts: FactcheckCounts
}

export function reconcileFactcheck(
	input: Factcheck,
	documents: readonly ParsedDocumentFile[],
): FactcheckReport {
	const errors: string[] = []
	const warnings: string[] = []
	const expected = expectedFactcheckTargets(documents)

	const seen = new Set<string>()
	for (const document of input.documents) {
		if (seen.has(document.key)) {
			errors.push(`factcheck: duplicate key "${document.key}"`)
			continue
		}
		seen.add(document.key)
		const source = expected.get(document.key)
		if (!source) {
			errors.push(`factcheck: key "${document.key}" is not a src/content document`)
			continue
		}
		const collection: DocumentCollection = source.collection
		if (document.targetCollection !== collection) {
			errors.push(
				`factcheck "${document.key}": targetCollection "${document.targetCollection}" disagrees with the document folder "${collection}"`,
			)
		}
		if (factcheckSourceDigest(source) !== document.sourceDigest) {
			warnings.push(
				`factcheck "${document.key}": sourceDigest is stale (${collection}/${source.filename} has changed); re-run /factcheck ${document.key}, which ends with ${RESEARCHED_COMMAND} --key ${document.key}`,
			)
		}
	}
	for (const key of expected.keys()) {
		if (!seen.has(key)) {
			warnings.push(
				`factcheck: missing document "${key}"; run ${EXTRACT_COMMAND}, then /factcheck ${key}`,
			)
		}
	}

	return {
		errors,
		warnings,
		counts: { ...countFindings(input), documents: expected.size },
	}
}

export function countFindings(factcheck: Factcheck): FactcheckCounts {
	let accepted = 0
	let open = 0
	let findings = 0
	for (const document of factcheck.documents) {
		for (const finding of document.findings) {
			findings += 1
			if (finding.decision.status === 'accepted') accepted += 1
			if (finding.decision.status === 'open') open += 1
		}
	}
	return { documents: factcheck.documents.length, findings, accepted, open }
}
