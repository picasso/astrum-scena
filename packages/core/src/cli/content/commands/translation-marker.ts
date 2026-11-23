import { loadSiteSection } from '../../../config/loader.ts'
import { resolveTranslationFreshness } from '../../../lib/content/translation-freshness.ts'
import {
	buildDocumentPairs,
	confirmTranslatedFromDigest,
	type DocumentPair,
	pairSourceDigest,
} from '../../../lib/content/translation-marker.ts'
import { type CliContext, flagOption, repeatedOption, stringOption } from '../../context.ts'
import { loadDocumentFiles } from '../documents.ts'
import { formatFor, loadPrettier, replaceFile } from '../prettier.ts'

// the working-mode marker `translatedFromDigest`; `confirm --write` is its only writer.
//
//   confirm — a plan by default; `--write` inserts or refreshes the marker of the selected pairs
//             without touching authored text. Target: repeated `--document <collection>/<key>` or
//             `--all`
//   compute — prints the digest of the current reference-locale body of one document (`--key`)
//   check   — prints current/needs-review per translation; advisory, always exits 0

const DOCUMENT_OPTION = '--document'
const ALL_OPTION = '--all'

async function loadPairs(context: CliContext) {
	const documents = await loadDocumentFiles(context.root)
	const pairs = buildDocumentPairs(documents.files, loadSiteSection(context.root, 'content'))
	return { pairs, pathOf: documents.pathOf }
}

const pairLabel = (pair: DocumentPair): string =>
	`${pair.collection}/${pair.translationKey} (${pair.translation.locale})`

function documentSelectors(context: CliContext): 'all' | readonly string[] {
	const isAll = flagOption(context, ALL_OPTION)
	const selectors = repeatedOption(context, DOCUMENT_OPTION)
	if (isAll && selectors.length > 0)
		throw new Error(`${ALL_OPTION} and ${DOCUMENT_OPTION} cannot be combined`)
	if (!isAll && selectors.length === 0)
		throw new Error(`confirm requires ${DOCUMENT_OPTION} <collection>/<key> or ${ALL_OPTION}`)
	if (new Set(selectors).size !== selectors.length)
		throw new Error(`duplicate ${DOCUMENT_OPTION} selector`)
	return isAll ? 'all' : selectors
}

type PlannedConfirmation = {
	pair: DocumentPair
	next: string
	action: 'insert' | 'refresh'
}

export async function translationMarkerConfirm(context: CliContext): Promise<number> {
	const selectors = documentSelectors(context)
	const write = flagOption(context, '--write')
	const prettier = write ? await loadPrettier(context.importPrettier) : undefined
	const { pairs, pathOf } = await loadPairs(context)
	const selected =
		selectors === 'all'
			? pairs
			: selectors.flatMap((selector) => {
					const matches = pairs.filter(
						(pair) => `${pair.collection}/${pair.translationKey}` === selector,
					)
					if (matches.length === 0)
						throw new Error(`no document pair for selector "${selector}"`)
					return matches
				})

	const planned: PlannedConfirmation[] = []
	const current: DocumentPair[] = []
	for (const pair of selected) {
		const digest = pairSourceDigest(pair)
		if (pair.translation.marker === digest) {
			current.push(pair)
			continue
		}
		planned.push({
			pair,
			next: confirmTranslatedFromDigest(pair.translation.raw, digest),
			action: pair.translation.marker === undefined ? 'insert' : 'refresh',
		})
	}

	context.out(
		`content translation-marker confirm — ${planned.length} to confirm, ${current.length} current${prettier ? '' : ' (dry-run)'}`,
	)
	for (const pair of current) context.out(`  = ${pairLabel(pair)} (current)`)
	for (const item of planned)
		context.out(`  ${prettier ? '+' : '·'} ${pairLabel(item.pair)} (${item.action})`)
	if (!prettier) {
		if (planned.length > 0)
			context.out('  run with --write after the owner confirms the reviewed pairs')
		return 0
	}
	// every output is formatted before the first write, so a prettier failure changes no file
	const outputs = await Promise.all(
		planned.map(async (item) => {
			const filePath = pathOf(item.pair.translation)
			return { filePath, content: await formatFor(prettier, filePath, item.next) }
		}),
	)
	for (const { filePath, content } of outputs) await replaceFile(filePath, content)
	context.out(`content translation-marker confirm OK (${planned.length} written)`)
	return 0
}

export async function translationMarkerCompute(context: CliContext): Promise<number> {
	const key = stringOption(context, '--key')
	if (key === undefined) throw new Error('compute requires --key <key>')
	const { pairs } = await loadPairs(context)
	const matches = pairs.filter((pair) => pair.translationKey === key)
	if (matches.length === 0) throw new Error(`no document pair for key "${key}"`)
	if (new Set(matches.map((pair) => pair.collection)).size > 1)
		throw new Error(`key "${key}" is ambiguous across collections`)
	context.out(pairSourceDigest(matches[0]!))
	return 0
}

export async function translationMarkerCheck(context: CliContext): Promise<number> {
	const { pairs } = await loadPairs(context)
	let needsReview = 0
	for (const pair of pairs) {
		const result = resolveTranslationFreshness({
			referenceBody: pair.reference.body,
			translationMarker: pair.translation.marker,
		})
		if (result.status === 'needs-review') needsReview += 1
		const reason = result.reason ? ` (${result.reason})` : ''
		context.out(`  ${result.status.padEnd(12)} ${pairLabel(pair)}${reason}`)
	}
	context.out(
		`content translation-marker check — ${pairs.length} pairs, ${needsReview} need review (advisory)`,
	)
	return 0
}
