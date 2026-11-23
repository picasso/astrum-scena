import { fromMarkdown } from 'mdast-util-from-markdown'
import { defaultTreeAdapter, type DefaultTreeAdapterTypes, parseFragment } from 'parse5'

export type LegacyLinkSyntax = 'html' | 'markdown-inline' | 'markdown-reference' | 'autolink'

export type LegacyLinkSourceLocation = {
	startOffset: number
	endOffset: number
	startLine: number
	startColumn: number
	endLine: number
	endColumn: number
}

export type LegacyLinkOccurrence = {
	documentKey?: string
	ordinal: number
	rawHref: string
	label: string
	sourceLocation: LegacyLinkSourceLocation
	sourceSyntax: LegacyLinkSyntax
	safe: boolean
}

export type LegacyLinkDiagnostic = {
	code: 'empty-destination' | 'empty-label' | 'malformed-anchor' | 'unsafe-destination'
	ordinal: number
	detail: string
	sourceLocation: LegacyLinkSourceLocation
}

export type LegacyLinkExtraction = {
	occurrences: LegacyLinkOccurrence[]
	diagnostics: LegacyLinkDiagnostic[]
}

export type ProtectedLegacyLinks = LegacyLinkExtraction & {
	value: string
	emittedLinkOccurrences: number
	restore: (value: string) => string
}

type Candidate = {
	startOffset: number
	endOffset: number
	rawHref: string
	rawLabel: string
	plainLabel: string
	sourceLocation: LegacyLinkSourceLocation
	sourceSyntax: LegacyLinkSyntax
	forcedDiagnostic?: LegacyLinkDiagnostic['code']
}

type MarkdownPosition = {
	start: { line: number; column: number; offset?: number }
	end: { line: number; column: number; offset?: number }
}

type MarkdownNode = {
	type: string
	identifier?: string
	url?: string
	value?: string
	position?: MarkdownPosition
	children?: MarkdownNode[]
}

const LINK_TOKEN_PREFIX = '\u0000legacy-link-'

function sourceLocation(position: MarkdownPosition): LegacyLinkSourceLocation | undefined {
	const startOffset = position.start.offset
	const endOffset = position.end.offset
	if (startOffset === undefined || endOffset === undefined) return undefined
	return {
		startOffset,
		endOffset,
		startLine: position.start.line,
		startColumn: position.start.column,
		endLine: position.end.line,
		endColumn: position.end.column,
	}
}

function markdownText(node: MarkdownNode): string {
	if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? ''
	if (node.type === 'image' || node.type === 'imageReference') return ''
	return (node.children ?? []).map(markdownText).join('')
}

function markdownLabel(value: string, node: MarkdownNode): string {
	const positioned = (node.children ?? []).filter(
		(child): child is MarkdownNode & { position: MarkdownPosition } => Boolean(child.position),
	)
	const first = positioned[0]?.position
	const last = positioned.at(-1)?.position
	const startOffset = first?.start.offset
	const endOffset = last?.end.offset
	if (startOffset === undefined || endOffset === undefined) return markdownText(node)
	return value.slice(startOffset, endOffset)
}

function collectMarkdownCandidates(value: string): {
	candidates: Candidate[]
	definitionRanges: Map<string, { startOffset: number; endOffset: number }>
} {
	const root = fromMarkdown(value) as MarkdownNode
	const definitions = new Map<
		string,
		{ href: string; range: { startOffset: number; endOffset: number } }
	>()
	const candidates: Candidate[] = []

	const collectDefinitions = (node: MarkdownNode): void => {
		if (node.type === 'definition' && node.identifier && node.url && node.position) {
			const location = sourceLocation(node.position)
			if (location) {
				definitions.set(node.identifier.toLowerCase(), {
					href: node.url,
					range: { startOffset: location.startOffset, endOffset: location.endOffset },
				})
			}
		}
		for (const child of node.children ?? []) collectDefinitions(child)
	}
	collectDefinitions(root)

	const usedDefinitions = new Set<string>()
	const collectLinks = (node: MarkdownNode): void => {
		if (node.position && (node.type === 'link' || node.type === 'linkReference')) {
			const location = sourceLocation(node.position)
			const definition =
				node.type === 'linkReference' && node.identifier
					? definitions.get(node.identifier.toLowerCase())
					: undefined
			const href = node.type === 'link' ? node.url : definition?.href
			if (location && href !== undefined) {
				const raw = value.slice(location.startOffset, location.endOffset)
				const sourceSyntax: LegacyLinkSyntax =
					node.type === 'linkReference'
						? 'markdown-reference'
						: raw.startsWith('<')
							? 'autolink'
							: 'markdown-inline'
				const rawLabel =
					sourceSyntax === 'autolink' ? raw.slice(1, -1) : markdownLabel(value, node)
				candidates.push({
					startOffset: location.startOffset,
					endOffset: location.endOffset,
					rawHref: href,
					rawLabel,
					plainLabel: sourceSyntax === 'autolink' ? rawLabel : markdownText(node),
					sourceLocation: location,
					sourceSyntax,
				})
				if (node.type === 'linkReference' && node.identifier) {
					usedDefinitions.add(node.identifier.toLowerCase())
				}
			}
		}
		for (const child of node.children ?? []) collectLinks(child)
	}
	collectLinks(root)

	return {
		candidates,
		definitionRanges: new Map(
			[...usedDefinitions]
				.map((identifier) => [identifier, definitions.get(identifier)?.range] as const)
				.filter(
					(
						entry,
					): entry is readonly [string, { startOffset: number; endOffset: number }] =>
						Boolean(entry[1]),
				),
		),
	}
}

function htmlText(node: DefaultTreeAdapterTypes.Node): string {
	if (defaultTreeAdapter.isTextNode(node)) return node.value
	if ('tagName' in node && node.tagName === 'img') return ''
	if (!('childNodes' in node)) return ''
	return node.childNodes.map(htmlText).join('')
}

function collectHtmlCandidates(value: string): Candidate[] {
	const fragment = parseFragment(value, { sourceCodeLocationInfo: true })
	const candidates: Candidate[] = []

	const visit = (node: DefaultTreeAdapterTypes.Node, excluded: boolean): void => {
		const isElement = 'tagName' in node
		const tagName = isElement ? node.tagName.toLowerCase() : ''
		const insideExcluded = excluded || tagName === 'script' || tagName === 'style'
		if (isElement && tagName === 'a' && !insideExcluded) {
			const location = node.sourceCodeLocation
			const startTag = location?.startTag
			if (location && startTag) {
				const endTag = location.endTag
				const href = node.attrs.find((attribute) => attribute.name.toLowerCase() === 'href')
				const rawLabel = value.slice(
					startTag.endOffset,
					endTag?.startOffset ?? location.endOffset,
				)
				candidates.push({
					startOffset: location.startOffset,
					endOffset: location.endOffset,
					rawHref: href?.value ?? '',
					rawLabel,
					plainLabel: htmlText(node),
					sourceLocation: {
						startOffset: location.startOffset,
						endOffset: location.endOffset,
						startLine: location.startLine,
						startColumn: location.startCol,
						endLine: location.endLine,
						endColumn: location.endCol,
					},
					sourceSyntax: 'html',
					...(!endTag ? { forcedDiagnostic: 'malformed-anchor' as const } : {}),
				})
			}
		}
		if (!insideExcluded && 'childNodes' in node) {
			for (const child of node.childNodes) visit(child, insideExcluded)
		}
	}
	visit(fragment, false)
	return candidates
}

function nonOverlappingCandidates(value: string): {
	candidates: Candidate[]
	definitionRanges: { startOffset: number; endOffset: number }[]
} {
	const markdown = collectMarkdownCandidates(value)
	const sorted = [...collectHtmlCandidates(value), ...markdown.candidates].sort(
		(left, right) =>
			left.startOffset - right.startOffset ||
			right.endOffset - left.endOffset ||
			(left.sourceSyntax === 'html' ? -1 : 1),
	)
	const candidates: Candidate[] = []
	for (const candidate of sorted) {
		if (
			candidates.some(
				(existing) =>
					candidate.startOffset < existing.endOffset &&
					candidate.endOffset > existing.startOffset,
			)
		) {
			continue
		}
		candidates.push(candidate)
	}
	return {
		candidates: candidates.sort((left, right) => left.startOffset - right.startOffset),
		definitionRanges: [...markdown.definitionRanges.values()],
	}
}

function destinationProblem(destination: string): string | undefined {
	if (!destination) return 'destination is empty'
	if (destination !== destination.trim()) return 'destination has leading or trailing whitespace'
	if (/[\u0000-\u001f\u007f\s<>\\]/u.test(destination)) {
		return 'destination contains whitespace, control characters, or unsafe delimiters'
	}
	if (destination.startsWith('//')) return 'protocol-relative destinations are not allowed'
	if (destination.startsWith('/')) return undefined
	if (/^#[^#\s]+$/u.test(destination)) return undefined
	if (/^mailto:[^\s@]+@[^\s@]+$/iu.test(destination)) return undefined
	if (/^https?:\/\//iu.test(destination)) {
		try {
			const parsed = new URL(destination)
			return parsed.protocol === 'http:' || parsed.protocol === 'https:'
				? undefined
				: 'destination scheme is not allowed'
		} catch {
			return 'destination is malformed'
		}
	}
	return 'destination scheme is not allowed'
}

function diagnosticFor(candidate: Candidate, ordinal: number): LegacyLinkDiagnostic | undefined {
	if (candidate.forcedDiagnostic === 'malformed-anchor') {
		return {
			code: 'malformed-anchor',
			ordinal,
			detail: 'HTML anchor has no closing tag',
			sourceLocation: candidate.sourceLocation,
		}
	}
	if (!candidate.rawHref) {
		return {
			code: 'empty-destination',
			ordinal,
			detail: 'link destination is empty',
			sourceLocation: candidate.sourceLocation,
		}
	}
	if (!candidate.plainLabel.trim()) {
		return {
			code: 'empty-label',
			ordinal,
			detail: 'link label is empty or image-only',
			sourceLocation: candidate.sourceLocation,
		}
	}
	const problem = destinationProblem(candidate.rawHref)
	if (!problem) return undefined
	return {
		code: 'unsafe-destination',
		ordinal,
		detail: `${problem}: "${candidate.rawHref}"`,
		sourceLocation: candidate.sourceLocation,
	}
}

export function extractLegacyLinks(
	value: string,
	options: { documentKey?: string } = {},
): LegacyLinkExtraction {
	const { candidates } = nonOverlappingCandidates(value)
	const diagnostics: LegacyLinkDiagnostic[] = []
	const occurrences = candidates.map((candidate, index): LegacyLinkOccurrence => {
		const ordinal = index + 1
		const diagnostic = diagnosticFor(candidate, ordinal)
		if (diagnostic) diagnostics.push(diagnostic)
		return {
			...(options.documentKey ? { documentKey: options.documentKey } : {}),
			ordinal,
			rawHref: candidate.rawHref,
			label: candidate.plainLabel.trim(),
			sourceLocation: candidate.sourceLocation,
			sourceSyntax: candidate.sourceSyntax,
			safe: !diagnostic,
		}
	})
	return { occurrences, diagnostics }
}

export function protectLegacyLinks(
	value: string,
	renderLabel: (value: string, sourceSyntax: LegacyLinkSyntax) => string,
	options: { documentKey?: string; emitLinks?: boolean } = {},
): ProtectedLegacyLinks {
	const { candidates, definitionRanges } = nonOverlappingCandidates(value)
	const diagnostics: LegacyLinkDiagnostic[] = []
	const replacements: { startOffset: number; endOffset: number; value: string }[] = []
	const rendered = new Map<string, string>()
	let emittedLinkOccurrences = 0

	const occurrences = candidates.map((candidate, index): LegacyLinkOccurrence => {
		const ordinal = index + 1
		const token = `${LINK_TOKEN_PREFIX}${ordinal}\u0000`
		const diagnostic = diagnosticFor(candidate, ordinal)
		if (diagnostic) diagnostics.push(diagnostic)
		const label = renderLabel(candidate.rawLabel, candidate.sourceSyntax)
		const safe = !diagnostic && Boolean(label.trim())
		if (!diagnostic && !label.trim()) {
			diagnostics.push({
				code: 'empty-label',
				ordinal,
				detail: 'link label is empty after sanitization',
				sourceLocation: candidate.sourceLocation,
			})
		}
		const emitsLink = safe && options.emitLinks !== false
		if (emitsLink) emittedLinkOccurrences += 1
		rendered.set(token, emitsLink ? `[${label}](<${candidate.rawHref}>)` : label)
		replacements.push({
			startOffset: candidate.startOffset,
			endOffset: candidate.endOffset,
			value: token,
		})
		return {
			...(options.documentKey ? { documentKey: options.documentKey } : {}),
			ordinal,
			rawHref: candidate.rawHref,
			label: candidate.plainLabel.trim(),
			sourceLocation: candidate.sourceLocation,
			sourceSyntax: candidate.sourceSyntax,
			safe,
		}
	})

	for (const range of definitionRanges) {
		if (
			candidates.some(
				(candidate) =>
					range.startOffset < candidate.endOffset &&
					range.endOffset > candidate.startOffset,
			)
		) {
			continue
		}
		replacements.push({ ...range, value: '' })
	}

	let protectedValue = value
	for (const replacement of replacements.sort(
		(left, right) => right.startOffset - left.startOffset || right.endOffset - left.endOffset,
	)) {
		protectedValue =
			protectedValue.slice(0, replacement.startOffset) +
			replacement.value +
			protectedValue.slice(replacement.endOffset)
	}

	return {
		value: protectedValue,
		occurrences,
		diagnostics,
		emittedLinkOccurrences,
		restore: (markdown) => {
			let restored = markdown
			for (const [token, link] of rendered) restored = restored.replaceAll(token, link)
			return restored
		},
	}
}
