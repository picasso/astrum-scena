import { type MarkdownLine, unfencedLines } from './api-surface.ts'

// UPGRADING.md: one `## [<npm version of the core>]` section per breaking release, newest first,
// under `## [Unreleased]`; each section holds `### <names>` entries, one per breaking change, with the
// parts a site needs to make the transition by hand.

export const UPGRADING_FILE = 'UPGRADING.md'
export const UNRELEASED = 'Unreleased'
export const ENTRY_PARTS = ['Before', 'After', 'Order', 'Writers', 'Verify'] as const

export type Version = { major: number; minor: number; patch: number }

export function parseVersion(text: string): Version | undefined {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text)
	if (!match) return undefined
	return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export const formatVersion = ({ major, minor, patch }: Version): string =>
	`${major}.${minor}.${patch}`

// the next major: 1.0.0 leaves 0.x, and from it on each breaking release is a major. Under 1.0.0 the
// version is `0.<epic>.<story>` of the story that releases it and a site pins it exactly, so any
// higher 0.y.z may be breaking as well
export const nextBreaking = (from: Version): Version => ({
	major: from.major + 1,
	minor: 0,
	patch: 0,
})

export const breakingHint = (from: Version): string =>
	from.major === 0 ? `a higher 0.y.z or 1.0.0` : formatVersion(nextBreaking(from))

export function isBreakingBump(from: Version, to: Version): boolean {
	if (from.major === 0 && to.major === 0) return compareVersions(to, from) > 0
	return compareVersions(to, nextBreaking(from)) === 0
}

// a fix or a compatible feature: any higher version under 1.0.0, the minor or the patch within the
// major from it on
export const isCompatibleBump = (from: Version, to: Version): boolean =>
	to.major === from.major && compareVersions(to, from) > 0

// the version a breaking release can have: any under 1.0.0, x.0.0 from it on
const isBreakingForm = ({ major, minor, patch }: Version): boolean =>
	major === 0 || (minor === 0 && patch === 0)

export type UpgradingEntry = {
	// 1-based across the file, the number a failure reports
	index: number
	heading: string
	line: number
	missing: (typeof ENTRY_PARTS)[number][]
}

export type UpgradingSection = {
	heading: string
	version?: Version
	line: number
	entries: UpgradingEntry[]
}

export type UpgradingDocument = { sections: UpgradingSection[]; errors: string[] }

const SECTION_HEADING = /^## \[([^\]]+)\](?: - \d{4}-\d{2}-\d{2})?$/

const partLabel = (part: string) => new RegExp(`^\\*\\*${part}:\\*\\*`)
const ANY_LABEL = new RegExp(`^\\*\\*(?:${ENTRY_PARTS.join('|')}):\\*\\*`)

// a label counts only with text after it on its line, on the next line of its paragraph, or with a
// code fence right below it (fenced lines are not in `body`, so the next line's number jumps)
function hasPart(body: MarkdownLine[], part: string): boolean {
	const label = partLabel(part)
	return body.some(({ text, number }, position) => {
		if (!label.test(text)) return false
		if (text.replace(label, '').trim() !== '') return true
		const next = body[position + 1]
		if (!next) return false
		if (next.number > number + 1) return true
		return next.text.trim() !== '' && !ANY_LABEL.test(next.text)
	})
}

function entryOf(index: number, heading: MarkdownLine, body: MarkdownLine[]): UpgradingEntry {
	return {
		index,
		heading: heading.text.slice(4).trim(),
		line: heading.number,
		missing: ENTRY_PARTS.filter((part) => !hasPart(body, part)),
	}
}

export function parseUpgrading(markdown: string): UpgradingDocument {
	const sections: UpgradingSection[] = []
	const errors: string[] = []
	let section: UpgradingSection | undefined
	let entry: { heading: MarkdownLine; body: MarkdownLine[] } | undefined
	let index = 0
	const close = () => {
		if (entry && section) section.entries.push(entryOf(++index, entry.heading, entry.body))
		entry = undefined
	}
	for (const line of unfencedLines(markdown)) {
		if (/^## /.test(line.text)) {
			close()
			const match = SECTION_HEADING.exec(line.text)
			const heading = match?.[1] ?? ''
			const version = parseVersion(heading)
			if (!match || (heading !== UNRELEASED && !version)) {
				errors.push(
					`line ${line.number}: "${line.text}" is not \`## [${UNRELEASED}]\` or \`## [x.y.z] - YYYY-MM-DD\``,
				)
				section = undefined
				continue
			}
			section = { heading, version, line: line.number, entries: [] }
			sections.push(section)
		} else if (!section) {
			continue
		} else if (/^### /.test(line.text)) {
			close()
			entry = { heading: line, body: [] }
		} else if (entry) {
			entry.body.push(line)
		} else if (line.text.trim() !== '') {
			errors.push(
				`line ${line.number}: text in [${section.heading}] outside a \`### <names>\` entry`,
			)
		}
	}
	close()
	return { sections, errors }
}

// the structure check of `check:upgrading`; `coreVersion` is the version in the core's package.json
export function checkUpgrading(markdown: string, coreVersion: string): string[] {
	const { sections, errors } = parseUpgrading(markdown)
	const core = parseVersion(coreVersion)
	if (!core) errors.push(`the core version "${coreVersion}" is not x.y.z`)
	if (sections[0]?.heading !== UNRELEASED)
		errors.push(`the first section must be \`## [${UNRELEASED}]\``)
	if (sections.filter(({ heading }) => heading === UNRELEASED).length > 1)
		errors.push(`more than one \`## [${UNRELEASED}]\` section`)

	const released = sections.filter(
		(section): section is UpgradingSection & { version: Version } => !!section.version,
	)
	for (const [position, section] of released.entries()) {
		if (section.entries.length === 0)
			errors.push(`line ${section.line}: [${section.heading}] has no entries`)
		if (!isBreakingForm(section.version))
			errors.push(
				`line ${section.line}: [${section.heading}] is not the version of a breaking release (x.0.0 from 1.0.0 on)`,
			)
		if (core && compareVersions(section.version, core) > 0)
			errors.push(
				`line ${section.line}: [${section.heading}] is above the core version ${coreVersion}`,
			)
		const older = released[position + 1]
		if (older && !isBreakingBump(older.version, section.version))
			errors.push(
				`line ${section.line}: [${section.heading}] does not follow [${older.heading}] as its breaking release (expected ${breakingHint(older.version)}); sections go newest first, one per breaking release`,
			)
	}

	for (const section of sections)
		for (const entry of section.entries)
			if (entry.missing.length > 0)
				errors.push(
					`entry ${entry.index} "${entry.heading}" (line ${entry.line}) lacks ${entry.missing.map((part) => `**${part}:**`).join(', ')}`,
				)
	return errors
}

export const compareVersions = (a: Version, b: Version): number =>
	a.major - b.major || a.minor - b.minor || a.patch - b.patch

// the entry headings of one section, empty without it; an entry names its breaking changes there
export const sectionHeadings = (markdown: string, heading: string): string[] =>
	parseUpgrading(markdown)
		.sections.filter((section) => section.heading === heading)
		.flatMap((section) => section.entries.map((entry) => entry.heading))

// the entry headings of `base` that `head` no longer has in any section: a transition sites may
// still need is never dropped
export function removedEntries(base: string, head: string): string[] {
	const kept = new Set(
		parseUpgrading(head).sections.flatMap((section) => section.entries.map((e) => e.heading)),
	)
	return parseUpgrading(base)
		.sections.flatMap((section) => section.entries.map((entry) => entry.heading))
		.filter((heading) => !kept.has(heading))
}

// a bump of the core's npm version must be breaking exactly when UPGRADING.md has transitions for it,
// counting the [Unreleased] entries of the merge base (`baseUpgrading`) as pending too
export function versionBumpErrors(
	from: string | undefined,
	to: string | undefined,
	upgrading: string,
	baseUpgrading = '',
): string[] {
	if (from === undefined || to === undefined || from === to) return []
	const before = parseVersion(from)
	const after = parseVersion(to)
	if (!before || !after) return [`the core version ${from} → ${to} is not x.y.z`]
	if (compareVersions(after, before) <= 0)
		return [`the core version ${from} → ${to} does not increase`]
	const breaking = isBreakingBump(before, after)
	const compatible = isCompatibleBump(before, after)
	if (!breaking && !compatible)
		return [
			`${from} → ${to} is neither a fix or compatible release nor the breaking release ${breakingHint(before)}`,
		]
	const unreleased = sectionHeadings(upgrading, UNRELEASED)
	const released = parseUpgrading(upgrading).sections.some((section) => section.heading === to)
	const pending =
		unreleased.length > 0 || released || sectionHeadings(baseUpgrading, UNRELEASED).length > 0
	// under 1.0.0 a bump is either; the transitions of UPGRADING.md make it the breaking one
	if (breaking && (pending || !compatible)) {
		const errors: string[] = []
		if (!released)
			errors.push(
				`the breaking release ${from} → ${to} needs a \`## [${to}]\` section in ${UPGRADING_FILE}`,
			)
		if (unreleased.length > 0)
			errors.push(
				`move the [${UNRELEASED}] entries of ${UPGRADING_FILE} into [${to}], the release they ship in`,
			)
		return errors
	}
	if (pending)
		return [
			`${UPGRADING_FILE} has transitions for ${to}, so ${from} → ${to} must be the breaking release ${breakingHint(before)}`,
		]
	return []
}
