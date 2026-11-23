// structural skeleton + diff of a document's MDX block inserts, for `/sync-mdx`.
//
// The skill keeps the RU and EN versions of one document structurally in sync by their MDX
// *inserts* — the block components (`<WrapAround/>`, `<Gallery/>`, …) and the container/leaf/text
// directives (`:::callout` …) — and ONLY those. Authorial prose, translations, frontmatter copy,
// alt/caption text and local links are never read structurally here and never touched.
//
// `parseMdxStructure` parses a document body to an mdast tree using the same JSX + directive grammar
// the build uses (`micromark-extension-mdxjs` mirrors what `@astrojs/mdx` runs; the CommonMark
// directive grammar matches satteri's `features.directive`), then walks it into an ordered, nested
// skeleton of structural nodes only — prose/heading/list nodes are transparent (we descend through
// them to find nested inserts, but never emit them). `diffMdxStructure` aligns two skeletons by
// position with an LCS backbone and classifies every divergence as one of four outcomes:
//   - aligned (same insert in both, same order) — recurse into children; PROPS ARE NOT COMPARED,
//     an attribute divergence is an authorial decision, not drift;
//   - `a-only` / `b-only` — an insert present in one locale and missing in the other (insert candidate);
//   - `reorder` — an insert present in both but in a different relative order. Detected only for an
//     UNAMBIGUOUS move (a single insert of a given identity that moved); an ambiguous same-identity
//     sibling reorder is deliberately left to surface as a mismatch, never guessed;
//   - `mismatch` — two DIFFERENT inserts contend for the same slot; reported as an author error,
//     never auto-resolved.
// The library is pure and deterministic; the skill decides direction (which locale leads) and applies
// nothing without an owner confirm.

import { directiveFromMarkdown } from 'mdast-util-directive'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { mdxFromMarkdown } from 'mdast-util-mdx'
import { directive } from 'micromark-extension-directive'
import { mdxjs } from 'micromark-extension-mdxjs'

export type MdxStructuralKind = 'component' | 'directive'

export type MdxStructuralNode = {
	kind: MdxStructuralKind
	// component name (`Gallery`) or directive name (`callout`)
	name: string
	// directives only
	directiveType?: 'container' | 'leaf' | 'text'
	// components only: flow (block) or text (inline) level
	jsxType?: 'flow' | 'text'
	// for display and as the seed when inserting; the diff ignores them
	attributes: Record<string, string | boolean>
	// 1-based start line, for reporting
	line: number
	column: number
	// document order; prose between inserts is transparent
	children: MdxStructuralNode[]
}

export class MdxStructureParseError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'MdxStructureParseError'
	}
}

const STRUCTURAL_JSX = new Set(['mdxJsxFlowElement', 'mdxJsxTextElement'])
const STRUCTURAL_DIRECTIVE = new Set(['containerDirective', 'leafDirective', 'textDirective'])

// minimal shapes of the mdast nodes we read (the util packages type them more richly).
type UnknownNode = {
	type: string
	name?: string | null
	children?: UnknownNode[]
	attributes?: unknown
	position?: { start?: { line?: number; column?: number } | null } | null
	value?: unknown
}

const FRONTMATTER = /^﻿?---\r?\n.*?\r?\n---\r?\n?/s

export function stripFrontmatter(source: string): string {
	return source.replace(FRONTMATTER, '')
}

function normalizeJsxAttributes(raw: unknown): Record<string, string | boolean> {
	const out: Record<string, string | boolean> = {}
	if (!Array.isArray(raw)) return out
	for (const attr of raw as UnknownNode[]) {
		if (attr.type === 'mdxJsxExpressionAttribute') {
			// a spread (`{...rest}`): key it by its raw text so two different spreads differ.
			out[`{${String(attr.value ?? '')}}`] = true
			continue
		}
		if (attr.type !== 'mdxJsxAttribute' || typeof attr.name !== 'string') continue
		const value = attr.value
		if (value == null) {
			out[attr.name] = true
		} else if (typeof value === 'string') {
			out[attr.name] = value
		} else if (typeof value === 'object' && 'value' in (value as object)) {
			// an expression attribute value (`width={80}`): keep the raw expression text.
			out[attr.name] = `{${String((value as { value?: unknown }).value ?? '')}}`
		}
	}
	return out
}

function normalizeDirectiveAttributes(raw: unknown): Record<string, string | boolean> {
	const out: Record<string, string | boolean> = {}
	if (!raw || typeof raw !== 'object') return out
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		out[key] = value == null ? true : String(value)
	}
	return out
}

function directiveTypeOf(nodeType: string): 'container' | 'leaf' | 'text' {
	if (nodeType === 'containerDirective') return 'container'
	if (nodeType === 'leafDirective') return 'leaf'
	return 'text'
}

// report the node's position in the ORIGINAL document. `lineOffset` re-adds the lines the stripped
// frontmatter occupied, so the skill's edit guidance points at the real file line, not the body line.
function positionOf(node: UnknownNode, lineOffset: number): { line: number; column: number } {
	const start = node.position?.start
	const line = start?.line
	return { line: line == null ? 0 : line + lineOffset, column: start?.column ?? 0 }
}

function buildNode(node: UnknownNode, lineOffset: number): MdxStructuralNode {
	const { line, column } = positionOf(node, lineOffset)
	if (STRUCTURAL_JSX.has(node.type)) {
		return {
			kind: 'component',
			name: node.name as string,
			jsxType: node.type === 'mdxJsxFlowElement' ? 'flow' : 'text',
			attributes: normalizeJsxAttributes(node.attributes),
			line,
			column,
			children: collectStructural(node.children, lineOffset),
		}
	}
	return {
		kind: 'directive',
		name: node.name as string,
		directiveType: directiveTypeOf(node.type),
		attributes: normalizeDirectiveAttributes(node.attributes),
		line,
		column,
		children: collectStructural(node.children, lineOffset),
	}
}

function collectStructural(
	children: UnknownNode[] | undefined,
	lineOffset: number,
): MdxStructuralNode[] {
	const out: MdxStructuralNode[] = []
	for (const node of children ?? []) {
		if (STRUCTURAL_JSX.has(node.type)) {
			// a JSX fragment (`<>…</>`) has no name — it groups without identity, so stay transparent.
			if (node.name == null) {
				out.push(...collectStructural(node.children, lineOffset))
				continue
			}
			out.push(buildNode(node, lineOffset))
			continue
		}
		if (STRUCTURAL_DIRECTIVE.has(node.type)) {
			// errata `:::note` is maintained per locale by `/factcheck-apply`, so RU and EN notes may
			// differ and keeping them would read as false drift; descend transparently since its body is prose
			// and block validation forbids nested inserts there
			if (node.type === 'containerDirective' && node.name === 'note') {
				out.push(...collectStructural(node.children, lineOffset))
				continue
			}
			out.push(buildNode(node, lineOffset))
			continue
		}
		if (Array.isArray(node.children)) {
			out.push(...collectStructural(node.children, lineOffset))
		}
	}
	return out
}

export function parseMdxStructure(source: string): MdxStructuralNode[] {
	const body = stripFrontmatter(source)
	// lines removed with the frontmatter, re-added so positions map back to the original file.
	const removedPrefix = source.slice(0, source.length - body.length)
	const lineOffset = (removedPrefix.match(/\n/g) ?? []).length
	let tree: UnknownNode
	try {
		tree = fromMarkdown(body, {
			extensions: [mdxjs(), directive()],
			mdastExtensions: [mdxFromMarkdown(), directiveFromMarkdown()],
		}) as unknown as UnknownNode
	} catch (error) {
		throw new MdxStructureParseError(error instanceof Error ? error.message : String(error))
	}
	return collectStructural(tree.children, lineOffset)
}

// components align by name, directives by type + name
export function structuralIdentity(node: MdxStructuralNode): string {
	return node.kind === 'component'
		? `component:${node.name}`
		: `directive:${node.directiveType}:${node.name}`
}

export type MdxStructureDiffType = 'a-only' | 'b-only' | 'reorder' | 'mismatch'

export type MdxStructureDiffEntry = {
	type: MdxStructureDiffType
	// ancestor identities from the root down to this entry
	path: string[]
	// present for `a-only`, `reorder`, `mismatch`
	a?: MdxStructuralNode
	// present for `b-only`, `reorder`, `mismatch`
	b?: MdxStructuralNode
	detail: string
}

export type MdxStructureDiff = {
	entries: MdxStructureDiffEntry[]
	inParity: boolean
}

type LcsOp =
	| { type: 'equal'; i: number; j: number }
	| { type: 'del'; i: number }
	| { type: 'ins'; j: number }

function lcsOps(a: string[], b: string[]): LcsOp[] {
	const n = a.length
	const m = b.length
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			const row = dp[i]!
			const next = dp[i + 1]!
			row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!)
		}
	}
	const ops: LcsOp[] = []
	let i = 0
	let j = 0
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			ops.push({ type: 'equal', i, j })
			i++
			j++
		} else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
			ops.push({ type: 'del', i })
			i++
		} else {
			ops.push({ type: 'ins', j })
			j++
		}
	}
	while (i < n) ops.push({ type: 'del', i: i++ })
	while (j < m) ops.push({ type: 'ins', j: j++ })
	return ops
}

// classify what remains of one gap between LCS anchors after global reorder pairs are removed. Both a
// removal and an insertion left in the same gap is a genuine substitution — two different inserts
// contend for the same slot — which is an author error, never auto-resolved. A one-sided gap is a
// clean insert candidate.
function classifyGapResidual(
	dels: MdxStructuralNode[],
	ins: MdxStructuralNode[],
	path: string[],
	entries: MdxStructureDiffEntry[],
): void {
	const count = Math.min(dels.length, ins.length)
	for (let k = 0; k < count; k++) {
		const del = dels[k]!
		const insert = ins[k]!
		entries.push({
			type: 'mismatch',
			path,
			a: del,
			b: insert,
			detail: `different inserts occupy the same position: ${structuralIdentity(
				del,
			)} (A) vs ${structuralIdentity(insert)} (B)`,
		})
	}
	for (const node of dels.slice(count)) {
		entries.push({
			type: 'a-only',
			path,
			a: node,
			detail: `${structuralIdentity(node)} present in A, missing in B`,
		})
	}
	for (const node of ins.slice(count)) {
		entries.push({
			type: 'b-only',
			path,
			b: node,
			detail: `${structuralIdentity(node)} present in B, missing in A`,
		})
	}
}

function diffLevel(
	a: MdxStructuralNode[],
	b: MdxStructuralNode[],
	path: string[],
	entries: MdxStructureDiffEntry[],
): void {
	const ops = lcsOps(a.map(structuralIdentity), b.map(structuralIdentity))

	// pass 1 — reorder. A node present on both sides but not aligned by the LCS has moved. Pair such a
	// removal and insertion ONLY when its identity is UNAMBIGUOUS at this level (exactly one removal and
	// one insertion of that identity). Ambiguous same-identity cases are deliberately NOT guessed here —
	// they fall through to positional handling below and surface as owner-reviewed mismatches, never an
	// auto-detected reorder that could be a substitution in disguise. Recurse into the paired children
	// so nested drift inside a moved insert is not lost.
	// An identity is unambiguous at this level only when it occurs exactly ONCE in each locale — then a
	// non-aligned occurrence is unmistakably that single insert having moved. If the identity is
	// repeated (in either locale), even a lone unaligned occurrence stays ambiguous — it could be a
	// move or a substitution among the repeats — and is never paired as a reorder.
	const totalA = new Map<string, number>()
	const totalB = new Map<string, number>()
	for (const node of a) {
		const id = structuralIdentity(node)
		totalA.set(id, (totalA.get(id) ?? 0) + 1)
	}
	for (const node of b) {
		const id = structuralIdentity(node)
		totalB.set(id, (totalB.get(id) ?? 0) + 1)
	}
	const unambiguousIns = new Map<string, MdxStructuralNode>()
	for (const op of ops) {
		if (op.type !== 'ins') continue
		const node = b[op.j]!
		const id = structuralIdentity(node)
		if (totalA.get(id) === 1 && totalB.get(id) === 1) unambiguousIns.set(id, node)
	}
	const consumed = new Set<MdxStructuralNode>()
	for (const op of ops) {
		if (op.type !== 'del') continue
		const node = a[op.i]!
		const id = structuralIdentity(node)
		const match = unambiguousIns.get(id)
		if (!match) continue
		unambiguousIns.delete(id)
		consumed.add(node)
		consumed.add(match)
		entries.push({
			type: 'reorder',
			path,
			a: node,
			b: match,
			detail: `${id} appears in both locales but in a different order`,
		})
		diffLevel(node.children, match.children, [...path, id], entries)
	}

	// pass 2 — walk in order: equal anchors recurse into their aligned children (attributes are NOT
	// compared) and bound the gaps; residual removals/insertions in a gap are classified — both sides in
	// one gap is a substitution (mismatch), one side is an insert candidate.
	let pendingDels: MdxStructuralNode[] = []
	let pendingIns: MdxStructuralNode[] = []
	const flush = () => {
		if (pendingDels.length > 0 || pendingIns.length > 0) {
			classifyGapResidual(pendingDels, pendingIns, path, entries)
			pendingDels = []
			pendingIns = []
		}
	}
	for (const op of ops) {
		if (op.type === 'equal') {
			flush()
			const child = a[op.i]!
			diffLevel(
				child.children,
				b[op.j]!.children,
				[...path, structuralIdentity(child)],
				entries,
			)
		} else if (op.type === 'del') {
			const node = a[op.i]!
			if (!consumed.has(node)) pendingDels.push(node)
		} else {
			const node = b[op.j]!
			if (!consumed.has(node)) pendingIns.push(node)
		}
	}
	flush()
}

// `a` and `b` are two locales of one document and the caller decides which leads; attribute and
// prop differences on aligned inserts are deliberately ignored
export function diffMdxStructure(a: MdxStructuralNode[], b: MdxStructuralNode[]): MdxStructureDiff {
	const entries: MdxStructureDiffEntry[] = []
	diffLevel(a, b, [], entries)
	return { entries, inParity: entries.length === 0 }
}
