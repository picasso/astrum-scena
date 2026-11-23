import {
	formatNoteClaim,
	NOTE_DIGEST8_PATTERN,
	NOTE_FINDING_ID_PATTERN,
} from '../blocks/note/claim.ts'
import { extractLegacyLinks } from './legacy-links.ts'

// pure, deterministic text edits for the errata loop (`/factcheck-apply`, ADR-0011), kept apart
// from the factcheck contract in factcheck.ts (which imports only note parsing from here) so the
// mutations are unit-testable on their own. Nothing throws: the calling skill turns `ok: false`
// into an owner STOP

// --- shared helpers ---------------------------------------------------------

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// these characters could break `[…](<…>)` or inject markup (`" onclick=…`) once the Markdown renders,
// so the edit refuses such a destination even when the owner accepted it
function isUnsafeDestination(value: string): boolean {
	if (value.trim() === '') return true
	return /[\s"'<>`\\]/u.test(value)
}

// escapes the same metacharacter class as the existing EN Markdown, so an edited URL label is
// spelled like the unedited ones (`produkte_gb.htm` → `produkte\_gb.htm`)
export function escapeMarkdownLabel(value: string): string {
	return value.replace(/[\\`*_[\]{}<>#]/g, '\\$&')
}

function stripUrl(value: string): string {
	return value
		.replace(/^https?:\/\//i, '')
		.replace(/\/+$/, '')
		.toLowerCase()
}

// the label is the URL itself rather than descriptive text, spelled in full (`http://host/path`) or
// as a bare host (`www.host`)
function labelIsUrl(label: string, raw: string): boolean {
	return stripUrl(label) === stripUrl(raw)
}

// never hide a path behind a bare host, or the visible text would misstate the destination: a label
// stays bare only when it was bare and the replacement has no path
function rewriteUrlLabel(replacement: string, oldLabel: string): string {
	const oldHadScheme = /^https?:\/\//i.test(oldLabel)
	if (oldHadScheme) return replacement
	const replNoScheme = replacement.replace(/^https?:\/\//i, '')
	const replHasPath = replNoScheme.replace(/\/+$/, '').includes('/')
	if (replHasPath) return replacement
	return replNoScheme.replace(/\/+$/, '')
}

export type LabelChange = { before: string; after: string }

// --- Markdown link edit -----------------------------------------------------

export type LinkEditFailure = 'not-found' | 'ambiguous' | 'unsafe-replacement'

export type MarkdownLinkEditResult =
	| { ok: true; value: string; labelChanges: LabelChange[] }
	| { ok: false; reason: LinkEditFailure; detail: string }

// matches by resolved destination, as link parity does, so `[label](<dest>)`, `[label](dest)` and
// an escaped label all count, while a bare RAW in prose is irrelevant to parity and left alone.
// Keeps the `<…>` wrapping and re-escapes a URL label; fails closed on match count and on an unsafe
// replacement
export function editMarkdownLinkDestination(
	markdown: string,
	raw: string,
	replacement: string,
): MarkdownLinkEditResult {
	if (isUnsafeDestination(replacement)) {
		return {
			ok: false,
			reason: 'unsafe-replacement',
			detail: `replacement "${replacement}" is unsafe to inline into a markdown link`,
		}
	}
	const occurrences = extractLegacyLinks(markdown).occurrences
	const matching = occurrences.filter((occurrence) => occurrence.rawHref === raw)
	if (matching.length === 0) {
		return { ok: false, reason: 'not-found', detail: `no markdown link resolves to "${raw}"` }
	}
	if (matching.length > 1) {
		return {
			ok: false,
			reason: 'ambiguous',
			detail: `${matching.length} markdown links resolve to "${raw}"`,
		}
	}

	const span = matching[0]!.sourceLocation
	const link = markdown.slice(span.startOffset, span.endOffset)
	if (matching[0]!.sourceSyntax === 'autolink') {
		const value =
			markdown.slice(0, span.startOffset) +
			`<${replacement}>` +
			markdown.slice(span.endOffset)
		return { ok: true, value, labelChanges: [] }
	}
	const labelClose = link.indexOf('](')
	if (!link.startsWith('[') || labelClose < 0) {
		return { ok: false, reason: 'not-found', detail: 'matched markdown link is malformed' }
	}
	const labelRaw = link.slice(1, labelClose)
	const destPart = link.slice(labelClose + 2, link.length - 1) // between `](` and `)`
	const wrapped = destPart.trim().startsWith('<')
	// unwrapped, an unbalanced `)` would end the destination early and resolve to another URL; the
	// wrapping is safe because isUnsafeDestination already refused `<` and `>`
	const needsWrap = wrapped || /[()]/.test(replacement)
	const newDest = needsWrap ? `<${replacement}>` : replacement

	let newLabelRaw = labelRaw
	const labelChanges: LabelChange[] = []
	const plainLabel = matching[0]!.label
	if (labelIsUrl(plainLabel, raw)) {
		const after = rewriteUrlLabel(replacement, plainLabel)
		if (after !== plainLabel) {
			newLabelRaw = escapeMarkdownLabel(after)
			labelChanges.push({ before: plainLabel, after })
		}
	}
	const editedLink = `[${newLabelRaw}](${newDest})`
	const value = markdown.slice(0, span.startOffset) + editedLink + markdown.slice(span.endOffset)
	return { ok: true, value, labelChanges }
}

// --- prose literal edit (company or product rename) -------------------------

export type LiteralEditResult =
	| { ok: true; value: string; count: number }
	| { ok: false; reason: 'not-found' | 'unsafe-replacement'; detail: string }

// a brand or product name is plain text: `<` would open a tag in prose, and quotes, `=` and
// backtick could break out of an attribute or start a handler if the text ever landed in one.
// Spaces, hyphens and `&` (`AT&T`) are harmless; verifyFactcheck does not validate prose
// replacements, so the guard lives at the insertion point
function isUnsafeLiteral(value: string): boolean {
	return value.trim() === '' || /["'<>=`\u0000-\u001f\u007f]/u.test(value)
}

// replaces every whole-token occurrence (`Arcatech` → `Acratech`) in visible prose only: Unicode
// letter/digit boundaries spare substrings of longer words, and tag bodies are skipped because a
// brand mention lives in text and an edit inside an attribute would distort the markup
export function replaceProseLiteral(
	text: string,
	raw: string,
	replacement: string,
): LiteralEditResult {
	if (isUnsafeLiteral(replacement)) {
		return {
			ok: false,
			reason: 'unsafe-replacement',
			detail: `replacement "${replacement}" is not a plain-text literal`,
		}
	}
	const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(raw)}(?![\\p{L}\\p{N}])`, 'gu')
	let count = 0
	// quote-aware: a `>` inside an attribute value (`title="a>b"`) must not end the tag, or the
	// attributes after it would be edited as prose
	const value = segmentHtml(text)
		.map((segment) =>
			segment.isTag
				? segment.value
				: segment.value.replace(pattern, () => {
						count += 1
						return replacement
					}),
		)
		.join('')
	if (count === 0) return { ok: false, reason: 'not-found', detail: `literal "${raw}" not found` }
	return { ok: true, value, count }
}

type HtmlSegment = { isTag: boolean; value: string }

// alternating text and `<...>` segments that concatenate back to the input byte for byte; quotes
// inside a tag shield `>`, so `<a title="x>y" href="z">` is one segment
function segmentHtml(html: string): HtmlSegment[] {
	const segments: HtmlSegment[] = []
	let index = 0
	while (index < html.length) {
		if (html[index] === '<') {
			let cursor = index + 1
			let quote = ''
			while (cursor < html.length) {
				const char = html[cursor]!
				if (quote) {
					if (char === quote) quote = ''
				} else if (char === '"' || char === "'") {
					quote = char
				} else if (char === '>') {
					cursor += 1
					break
				}
				cursor += 1
			}
			segments.push({ isTag: true, value: html.slice(index, cursor) })
			index = cursor
		} else {
			let cursor = index
			while (cursor < html.length && html[cursor] !== '<') cursor += 1
			segments.push({ isTag: false, value: html.slice(index, cursor) })
			index = cursor
		}
	}
	return segments
}

// --- managed `:::note` errata region ----------------------------------------
//
// The errata region is the canonical trailing run of `:::note{claim="…"}` directives (ADR-0011);
// the heading is not stored, the render plugin prints it per locale. Only this module's own
// canonical form is parsed, never the general directive grammar: that form sits where micromark
// directive 3.0.2 (repo) and 4.0.0 (Satteri renderer) agree, so the boundaries found here are the
// renderer's. Anything not strictly canonical fails closed.
//
// A note is managed iff it carries `claim`. `tone`/`icon` are tolerated and kept on round-trip
// (the author owns styling); `notitle` is positional and set by the serializer; an unknown
// attribute or `title` on a claim note fails closed. A note without `claim` is manual: it never
// forms a region and the render plugin validates it.

export type ErrataNote = {
	findingId: string
	digest8: string
	text: string
	// kept on round-trip; `notitle` is positional, see serializeNoteRegion
	tone?: string
	icon?: string
}

// exactly three colons and a clean line end (`[ \t]*\r?$` absorbs trailing spaces and a CRLF CR);
// parseManagedOpener decides whether the opener is managed
const NOTE_OPENER = /^:::note\{([^}\n]*)\}[ \t]*\r?$/gm

// safe to re-emit into an opener; the render plugin checks the enum, this module only preserves it
const NOTE_PRESENTATION_VALUE = /^[a-z][a-z-]*$/

type ManagedOpener = { findingId: string; digest8: string; tone?: string; icon?: string }

// null unless the attributes are a valid `claim` plus only bare `notitle`, `tone="…"` and
// `icon="…"` (so `title` is rejected); splitting on spaces is safe because managed values never
// contain them
function parseManagedOpener(attrs: string): ManagedOpener | null {
	let findingId: string | undefined
	let digest8: string | undefined
	let tone: string | undefined
	let icon: string | undefined
	for (const token of attrs.trim().split(/ +/)) {
		if (token === '') continue
		if (token === 'notitle') continue // positional, restored by the serializer
		let match = /^claim="([A-Za-z0-9._-]+):([0-9a-f]{8})"$/.exec(token)
		if (match) {
			findingId = match[1]
			digest8 = match[2]
			continue
		}
		match = /^tone="([a-z][a-z-]*)"$/.exec(token)
		if (match) {
			tone = match[1]
			continue
		}
		match = /^icon="([a-z][a-z-]*)"$/.exec(token)
		if (match) {
			icon = match[1]
			continue
		}
		return null
	}
	if (findingId === undefined || digest8 === undefined) return null
	const result: ManagedOpener = { findingId, digest8 }
	if (tone !== undefined) result.tone = tone
	if (icon !== undefined) result.icon = icon
	return result
}
// deliberately broad guard: Satteri also renders `::::note{…}` and an opener with text after `}`
// (`:::note{claim="…"} junk`) as notes, so any renderable claim note outside the canonical form
// must fail closed instead of being skipped. `\bclaim=` keeps longer attribute names out; manual
// notes without `claim` are not matched
const NOTE_CLAIM_OPENER = /^:{3,}note\{[^}\n]*\bclaim=/gm
const NOTE_CLOSER = /^:::[ \t]*\r?$/gm
// `:::links` holds no nested directives (validate-children rejects them), so its first `:::` closes it.
const LINKS_OPENER = /^:::links(?:\{[^}\n]*\})?[ \t]*\r?$/gm
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

type NoteBlock = {
	findingId: string
	digest8: string
	text: string
	tone?: string
	icon?: string
	start: number
	end: number
}
type NoteRegionInfo = { start: number; end: number; blocks: NoteBlock[] }
// `linksTailStart` is where the trailing run of `:::links` blocks begins (`body.length` when there is
// none): notes before or after that run are equally valid, the order is the author's visual choice.
type AnalyzeResult =
	| { ok: true; region: NoteRegionInfo | null; linksTailStart: number }
	| { ok: false; detail: string }

// `[start, endExclusive)`; an unclosed fence runs to the end of the body. Approximate, but enough
// to keep `:::` and opener-like lines inside code blocks out of the scan
function codeFenceRanges(body: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = []
	let open: { char: string; len: number; start: number } | null = null
	let lineStart = 0
	while (lineStart <= body.length) {
		const nl = body.indexOf('\n', lineStart)
		const lineEnd = nl === -1 ? body.length : nl
		const line = body.slice(lineStart, lineEnd).replace(/\r$/, '')
		const match = CODE_FENCE.exec(line)
		if (open) {
			if (
				match &&
				match[1]![0] === open.char &&
				match[1]!.length >= open.len &&
				match[2]!.trim() === ''
			) {
				ranges.push([open.start, lineEnd])
				open = null
			}
		} else if (match) {
			const fenceChar = match[1]![0]!
			// a backtick fence's info string cannot contain a backtick (CommonMark); treating
			// ```` ```x`y ```` as a fence would hide the canonical notes after it (fail-open)
			if (!(fenceChar === '`' && match[2]!.includes('`'))) {
				open = { char: fenceChar, len: match[1]!.length, start: lineStart }
			}
		}
		if (nl === -1) break
		lineStart = nl + 1
	}
	if (open) ranges.push([open.start, body.length])
	return ranges
}

// start of the `:::links` blocks that end the body, separated only by whitespace.
function trailingLinksStart(
	body: string,
	inFence: (index: number) => boolean,
	closers: Array<{ index: number; matchLen: number }>,
): number {
	const blocks: Array<{ start: number; end: number }> = []
	for (const match of body.matchAll(LINKS_OPENER)) {
		if (inFence(match.index)) continue
		const openerEnd = match.index + match[0].length
		const closer = closers.find((candidate) => candidate.index >= openerEnd)
		// an unclosed container runs to the end of the body, as the renderer reads it
		blocks.push({
			start: match.index,
			end: closer ? closer.index + closer.matchLen : body.length,
		})
		if (!closer) break
	}
	let tailStart = body.length
	for (let index = blocks.length - 1; index >= 0; index -= 1) {
		if (body.slice(blocks[index]!.end, tailStart).trim() !== '') break
		tailStart = blocks[index]!.start
	}
	return tailStart
}

// anchored on the canonical form: `region: null` when there is none, `ok: false` on a damaged
// managed form because guessing its boundaries could corrupt the body
function analyzeNoteRegion(body: string): AnalyzeResult {
	const fences = codeFenceRanges(body)
	const inFence = (index: number): boolean =>
		fences.some(([start, end]) => index >= start && index < end)

	const openers: Array<{ index: number; matchLen: number } & ManagedOpener> = []
	for (const match of body.matchAll(NOTE_OPENER)) {
		if (inFence(match.index)) continue
		// manual notes (`:::note{title=…}`) match NOTE_OPENER too; non-canonical claim notes are
		// caught by the NOTE_CLAIM_OPENER guard below
		const parsed = parseManagedOpener(match[1]!)
		if (!parsed) continue
		openers.push({ index: match.index, matchLen: match[0].length, ...parsed })
	}
	const claimOpeners: number[] = []
	for (const match of body.matchAll(NOTE_CLAIM_OPENER)) {
		if (!inFence(match.index)) claimOpeners.push(match.index)
	}
	const closers: Array<{ index: number; matchLen: number }> = []
	for (const match of body.matchAll(NOTE_CLOSER)) {
		if (!inFence(match.index)) closers.push({ index: match.index, matchLen: match[0].length })
	}
	const linksTailStart = trailingLinksStart(body, inFence, closers)

	if (openers.length === 0) {
		// a claim with no canonical opener is a damaged managed note
		if (claimOpeners.length > 0) {
			return {
				ok: false,
				detail: `a note carrying "claim" is not in canonical errata form (offset ${claimOpeners[0]})`,
			}
		}
		return { ok: true, region: null, linksTailStart }
	}

	// regenerateNoteRegion refuses note text with a `:::` line, so the first `:::` after a
	// canonical opener is always its closer
	const blocks: NoteBlock[] = []
	for (const opener of openers) {
		const openerEnd = opener.index + opener.matchLen
		const closer = closers.find((candidate) => candidate.index >= openerEnd)
		if (!closer) {
			return { ok: false, detail: `unclosed :::note directive (offset ${opener.index})` }
		}
		const text = body
			.slice(openerEnd, closer.index)
			.replace(/^\r?\n/, '')
			.replace(/\r?\n$/, '')
		blocks.push({
			findingId: opener.findingId,
			digest8: opener.digest8,
			text,
			...(opener.tone !== undefined ? { tone: opener.tone } : {}),
			...(opener.icon !== undefined ? { icon: opener.icon } : {}),
			start: opener.index,
			end: closer.index + closer.matchLen,
		})
	}

	// the region ends the body, or is followed only by the trailing `:::links` run.
	const last = blocks[blocks.length - 1]!
	if (body.slice(last.end, linksTailStart).trim() !== '') {
		return {
			ok: false,
			detail: `content follows the trailing :::note region (offset ${last.end}); managed notes must end the document or precede only its trailing :::links blocks`,
		}
	}

	// the region is the trailing run of blocks separated by exactly one blank line
	let startIdx = blocks.length - 1
	while (startIdx > 0) {
		const between = body.slice(blocks[startIdx - 1]!.end, blocks[startIdx]!.start)
		// the closer absorbs an optional CR, so under CRLF the gap reads `\n\r\n`; dropping CRs
		// keeps the one-blank-line test EOL-agnostic
		if (between.replace(/\r/g, '') !== '\n\n') break
		startIdx -= 1
	}
	const regionBlocks = blocks.slice(startIdx)
	const region: NoteRegionInfo = {
		start: regionBlocks[0]!.start,
		end: last.end,
		blocks: regionBlocks,
	}

	// a managed note detached from the trailing region would be invisible to every edit
	for (const opener of openers) {
		if (opener.index < region.start) {
			return {
				ok: false,
				detail: `a managed :::note is separated from the trailing region (offset ${opener.index})`,
			}
		}
	}
	for (const claimIndex of claimOpeners) {
		if (claimIndex < region.start || claimIndex >= region.end) {
			return {
				ok: false,
				detail: `a note carrying "claim" is outside the trailing region (offset ${claimIndex})`,
			}
		}
	}
	return { ok: true, region, linksTailStart }
}

export type NoteRegionLocation = { start: number; end: number }
export type LocateNoteRegionResult =
	{ ok: true; region: NoteRegionLocation | null } | { ok: false; detail: string }

export function locateNoteRegion(body: string): LocateNoteRegionResult {
	const analyzed = analyzeNoteRegion(body)
	if (!analyzed.ok) return analyzed
	return {
		ok: true,
		region: analyzed.region ? { start: analyzed.region.start, end: analyzed.region.end } : null,
	}
}

export type ManagedNoteIdsResult = { ok: true; ids: string[] } | { ok: false; detail: string }

// ids in order, for removal-only reconciliation; a broken region is `ok: false` (not an empty list)
// so the caller STOPs instead of silently skipping
export function managedNoteIds(body: string): ManagedNoteIdsResult {
	const analyzed = analyzeNoteRegion(body)
	if (!analyzed.ok) return { ok: false, detail: analyzed.detail }
	return { ok: true, ids: analyzed.region ? analyzed.region.blocks.map((b) => b.findingId) : [] }
}

export type ParseErrataNotesResult =
	{ ok: true; notes: ErrataNote[] } | { ok: false; detail: string }

// lets the caller keep the already-approved text of a note whose (id, digest8) did not change
export function parseErrataNotes(body: string): ParseErrataNotesResult {
	const analyzed = analyzeNoteRegion(body)
	if (!analyzed.ok) return { ok: false, detail: analyzed.detail }
	const notes: ErrataNote[] = analyzed.region
		? analyzed.region.blocks.map((b) => ({
				findingId: b.findingId,
				digest8: b.digest8,
				text: b.text,
				...(b.tone !== undefined ? { tone: b.tone } : {}),
				...(b.icon !== undefined ? { icon: b.icon } : {}),
			}))
		: []
	return { ok: true, notes }
}

// every note after the first gets `notitle` so the renderer prints the heading once; attributes go
// in a fixed order (claim, notitle, tone, icon) and `title` is never written
export function serializeNoteRegion(notes: ErrataNote[], eol = '\n'): string {
	return notes
		.map((note, index) => {
			const claim = formatNoteClaim(note.findingId, note.digest8)
			let opener = `:::note{claim="${claim}"`
			if (index > 0) opener += ' notitle'
			if (note.tone !== undefined) opener += ` tone="${note.tone}"`
			if (note.icon !== undefined) opener += ` icon="${note.icon}"`
			opener += '}'
			return [opener, note.text, ':::'].join(eol)
		})
		.join(`${eol}${eol}`)
}

export type RegenerateNoteRegionResult = { ok: true; value: string } | { ok: false; detail: string }

// inserts, replaces or removes the region from the full ordered note set; unchanged notes give
// byte-identical output when `eol` matches the existing region, so per-note reconciliation stays
// with the caller
export function regenerateNoteRegion(
	body: string,
	notes: ErrataNote[],
	eol = '\n',
): RegenerateNoteRegionResult {
	// findingId/digest8 go into the opener, and a text line starting with `:::` would break the
	// region boundaries
	for (const note of notes) {
		if (!NOTE_FINDING_ID_PATTERN.test(note.findingId)) {
			return { ok: false, detail: `unsafe finding id for a note: "${note.findingId}"` }
		}
		if (!NOTE_DIGEST8_PATTERN.test(note.digest8)) {
			return { ok: false, detail: `note digest8 must be 8 hex chars, got "${note.digest8}"` }
		}
		if (note.text.trim() === '') {
			return { ok: false, detail: `note text for "${note.findingId}" is empty` }
		}
		// tone/icon are re-emitted into the opener line; the render plugin checks the enum
		if (note.tone !== undefined && !NOTE_PRESENTATION_VALUE.test(note.tone)) {
			return { ok: false, detail: `unsafe note tone for "${note.findingId}": "${note.tone}"` }
		}
		if (note.icon !== undefined && !NOTE_PRESENTATION_VALUE.test(note.icon)) {
			return { ok: false, detail: `unsafe note icon for "${note.findingId}": "${note.icon}"` }
		}
		for (const line of note.text.split(/\r?\n/)) {
			if (/^\s*:::/.test(line)) {
				return {
					ok: false,
					detail: `note text for "${note.findingId}" contains a ':::' fence line`,
				}
			}
		}
	}

	const analyzed = analyzeNoteRegion(body)
	if (!analyzed.ok) return { ok: false, detail: analyzed.detail }

	if (notes.length === 0) {
		if (!analyzed.region) return { ok: true, value: body }
		const value = joinAroundRegion(body, analyzed.region, `${eol}${eol}`).replace(/\s+$/, '')
		return { ok: true, value }
	}

	const region = serializeNoteRegion(notes, eol)
	if (analyzed.region) {
		const value =
			body.slice(0, analyzed.region.start) + region + body.slice(analyzed.region.end)
		return { ok: true, value }
	}
	// a new region goes before the trailing `:::links` run (the owner's preferred order), else at the end.
	const base = body.slice(0, analyzed.linksTailStart).replace(/\s+$/, '')
	const separator = base.length > 0 ? `${eol}${eol}` : ''
	const links = body.slice(analyzed.linksTailStart)
	const tail = links === '' ? '' : `${eol}${eol}${links}`
	return { ok: true, value: `${base}${separator}${region}${tail}` }
}

// for the translation freshness digest: `/factcheck-apply` manages errata per locale, so it is not
// translation source. A damaged region is returned as is (fail-open here): upstream validation
// reports it
export function stripManagedNoteRegion(body: string): string {
	const analyzed = analyzeNoteRegion(body)
	if (!analyzed.ok || !analyzed.region) return body
	return joinAroundRegion(body, analyzed.region, '\n\n')
}

// the body without the region; trailing `:::links` after it keep one blank line from the prose, so
// moving notes before or after the links never changes the result.
function joinAroundRegion(body: string, region: NoteRegionInfo, separator: string): string {
	const prefix = body.slice(0, region.start).replace(/\s+$/, '')
	const suffix = body.slice(region.end).replace(/^\s+/, '')
	if (suffix === '') return prefix
	return prefix === '' ? suffix : `${prefix}${separator}${suffix}`
}
