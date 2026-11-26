import { describe, expect, it } from 'vitest'

import {
	checkUpgrading,
	isBreakingBump,
	isCompatibleBump,
	nextBreaking,
	parseUpgrading,
	parseVersion,
	removedEntries,
	sectionHeadings,
	unreleasedCoreErrors,
	versionBumpErrors,
} from './upgrading.ts'

const v = (text: string) => parseVersion(text)!

const entry = (heading: string, ...skip: string[]) =>
	[
		`### ${heading}`,
		'',
		...['Before', 'After', 'Order', 'Writers', 'Verify']
			.filter((part) => !skip.includes(part))
			.map((part) => `**${part}:** the ${part.toLowerCase()} part.\n`),
	].join('\n')

const upgrading = (...sections: [string, ...string[]][]) =>
	[
		'# Upgrading',
		'',
		'```md',
		'### `<name>`',
		'',
		'## [9.9.9]',
		'```',
		'',
		...sections.flatMap(([heading, ...entries]) => {
			const [version, date] = heading.split(' - ')
			return [`## [${version}]${date ? ` - ${date}` : ''}`, '', ...entries]
		}),
	].join('\n')

describe('version policy', () => {
	it('takes any higher 0.y.z or 1.0.0 as breaking under 1.0.0 and the next major from it on', () => {
		expect(nextBreaking(v('0.6.9'))).toEqual(v('1.0.0'))
		expect(nextBreaking(v('1.2.3'))).toEqual(v('2.0.0'))
		for (const to of ['0.6.10', '0.7.0', '0.7.3', '0.12.1', '1.0.0'])
			expect(isBreakingBump(v('0.6.9'), v(to)), to).toBe(true)
		for (const to of ['0.6.9', '0.6.1', '1.0.1', '2.0.0'])
			expect(isBreakingBump(v('0.6.9'), v(to)), to).toBe(false)
		expect(isBreakingBump(v('1.2.3'), v('1.3.0'))).toBe(false)
		expect(isBreakingBump(v('1.2.3'), v('2.0.0'))).toBe(true)
	})

	it('takes any higher 0.y.z under 1.0.0 and a minor or patch from it on as compatible', () => {
		expect(isCompatibleBump(v('0.0.0'), v('0.6.9'))).toBe(true)
		expect(isCompatibleBump(v('0.6.9'), v('0.6.10'))).toBe(true)
		expect(isCompatibleBump(v('0.6.9'), v('0.7.0'))).toBe(true)
		expect(isCompatibleBump(v('0.6.9'), v('0.6.8'))).toBe(false)
		expect(isCompatibleBump(v('0.6.9'), v('1.0.0'))).toBe(false)
		expect(isCompatibleBump(v('1.2.3'), v('1.3.0'))).toBe(true)
		expect(isCompatibleBump(v('1.2.3'), v('1.2.4'))).toBe(true)
		expect(isCompatibleBump(v('1.2.3'), v('2.0.0'))).toBe(false)
		expect(isCompatibleBump(v('1.2.3'), v('1.2.3'))).toBe(false)
	})

	it('reads only x.y.z', () => {
		expect(parseVersion('0.4.0-beta.1')).toBeUndefined()
		expect(parseVersion('v1.0.0')).toBeUndefined()
	})
})

describe('parseUpgrading', () => {
	it('reads sections and their entries, skipping fenced examples', () => {
		const text = upgrading(
			['Unreleased', entry('`nav.home`')],
			['0.4.0 - 2026-11-06', entry('`a.b`'), entry('`c`')],
		)
		const { sections, errors } = parseUpgrading(text)
		expect(errors).toEqual([])
		expect(sections.map(({ heading }) => heading)).toEqual(['Unreleased', '0.4.0'])
		expect(sections[1]!.entries.map(({ index, heading }) => [index, heading])).toEqual([
			[2, '`a.b`'],
			[3, '`c`'],
		])
		expect(sectionHeadings(text, '0.4.0')).toEqual(['`a.b`', '`c`'])
		expect(sectionHeadings(text, '0.5.0')).toEqual([])
	})

	it('does not take a label inside a fence for the part', () => {
		const text = upgrading([
			'Unreleased',
			[entry('`x`', 'Verify'), '```md', '**Verify:** fenced', '```'].join('\n'),
		])
		expect(parseUpgrading(text).sections[0]!.entries[0]!.missing).toEqual(['Verify'])
	})

	it('does not take a label without text for the part', () => {
		const parts = (...lines: string[]) =>
			parseUpgrading(['## [Unreleased]', '', '### `x`', '', ...lines].join('\n')).sections[0]!
				.entries[0]!.missing
		const rest = ['**After:** a', '**Order:** b', '**Writers:** c']
		expect(parts('**Before:**', '', ...rest, '**Verify:**  ')).toEqual(['Before', 'Verify'])
		expect(
			parts('**Before:**', '**After:** a', '**Order:** b', '**Writers:** c', '**Verify:** d'),
		).toEqual(['Before'])
		expect(parts('**Before:**', 'the old form', '', ...rest, '**Verify:** d')).toEqual([])
		expect(
			parts('**Before:**', '```yaml', 'a: 1', '```', '', ...rest, '**Verify:** d'),
		).toEqual([])
	})

	it('reads a file with CRLF line endings', () => {
		const text = upgrading(['Unreleased', entry('`a`')], ['0.4.0 - 2026-11-06', entry('`b`')])
		const crlf = text.replace(/\n/g, '\r\n')
		expect(checkUpgrading(crlf, '0.4.0')).toEqual([])
		expect(sectionHeadings(crlf, 'Unreleased')).toEqual(['`a`'])
		expect(sectionHeadings(crlf, '0.4.0')).toEqual(['`b`'])
	})
})

describe('checkUpgrading', () => {
	it('passes an empty [Unreleased] and complete sections in breaking order', () => {
		expect(checkUpgrading(upgrading(['Unreleased']), '0.0.0')).toEqual([])
		expect(
			checkUpgrading(
				upgrading(['Unreleased'], ['1.0.0', entry('`b`')], ['0.4.0', entry('`a`')]),
				'1.0.2',
			),
		).toEqual([])
	})

	it('names the entry and each missing part', () => {
		const errors = checkUpgrading(
			upgrading(['Unreleased', entry('`ok`'), entry('`nav.home`', 'After', 'Writers')]),
			'0.0.0',
		)
		expect(errors).toEqual(['entry 2 "`nav.home`" (line 23) lacks **After:**, **Writers:**'])
	})

	it('requires [Unreleased] first and recognised headings', () => {
		expect(checkUpgrading(upgrading(['0.1.0', entry('`a`')]), '0.1.0')).toContain(
			'the first section must be `## [Unreleased]`',
		)
		expect(checkUpgrading('## [Unreleased]\n\n## Notes\n', '0.0.0')[0]).toMatch(
			/^line 3: "## Notes" is not/,
		)
	})

	it('rejects text outside an entry and a release section without entries', () => {
		expect(checkUpgrading('## [Unreleased]\n\nstray text\n', '0.0.0')).toEqual([
			'line 3: text in [Unreleased] outside a `### <names>` entry',
		])
		expect(checkUpgrading('## [Unreleased]\n\n## [0.1.0]\n', '0.1.0')).toEqual([
			'line 3: [0.1.0] has no entries',
		])
	})

	it('requires each section to be a breaking release after the one below it', () => {
		expect(
			checkUpgrading(
				upgrading(['Unreleased'], ['0.7.2', entry('`b`')], ['0.6.10', entry('`a`')]),
				'0.7.2',
			),
		).toEqual([])
		const errors = checkUpgrading(
			upgrading(['Unreleased'], ['2.0.0', entry('`b`')], ['0.6.9', entry('`a`')]),
			'2.0.0',
		)
		expect(errors).toHaveLength(1)
		expect(errors[0]).toMatch(
			/\[2\.0\.0\] does not follow \[0\.6\.9\].*expected a higher 0\.y\.z or 1\.0\.0/,
		)
		expect(
			checkUpgrading(
				upgrading(['Unreleased'], ['0.6.9', entry('`a`')], ['0.7.0', entry('`b`')]),
				'0.7.0',
			),
		).toHaveLength(1)
	})

	it('requires every release section from 1.0.0 on, the oldest too, to be a major', () => {
		expect(checkUpgrading(upgrading(['Unreleased'], ['1.1.0', entry('`a`')]), '1.1.0')).toEqual(
			['line 11: [1.1.0] is not the version of a breaking release (x.0.0 from 1.0.0 on)'],
		)
		expect(checkUpgrading(upgrading(['Unreleased'], ['0.6.9', entry('`a`')]), '0.6.9')).toEqual(
			[],
		)
		expect(checkUpgrading(upgrading(['Unreleased'], ['1.0.0', entry('`a`')]), '1.0.2')).toEqual(
			[],
		)
	})

	it('rejects a section above the core version', () => {
		expect(checkUpgrading(upgrading(['Unreleased'], ['0.1.0', entry('`a`')]), '0.0.0')).toEqual(
			['line 11: [0.1.0] is above the core version 0.0.0'],
		)
	})
})

describe('versionBumpErrors', () => {
	const pending = upgrading(['Unreleased', entry('`a`')])
	const empty = upgrading(['Unreleased'])
	const released = upgrading(['Unreleased'], ['0.7.0', entry('`a`')])
	const releasedPending = upgrading(['Unreleased', entry('`b`')], ['0.7.0', entry('`a`')])
	const major = upgrading(['Unreleased'], ['2.0.0', entry('`a`')])

	it('ignores an unchanged version', () => {
		expect(versionBumpErrors('0.6.9', '0.6.9', pending)).toEqual([])
		expect(versionBumpErrors(undefined, '0.6.9', pending)).toEqual([])
	})

	it('passes any higher 0.y.z without transitions for it', () => {
		for (const [from, to] of [
			['0.0.0', '0.6.9'],
			['0.6.9', '0.6.10'],
			['0.6.9', '0.7.0'],
		])
			expect(versionBumpErrors(from, to, empty)).toEqual([])
	})

	it('takes a 0.y.z bump with transitions for the breaking release', () => {
		expect(versionBumpErrors('0.6.9', '0.7.0', pending)).toEqual([
			'the breaking release 0.6.9 → 0.7.0 needs a `## [0.7.0]` section in UPGRADING.md',
			'move the [Unreleased] entries of UPGRADING.md into [0.7.0], the release they ship in',
		])
		expect(versionBumpErrors('0.6.9', '0.7.0', releasedPending)).toHaveLength(1)
		expect(versionBumpErrors('0.6.9', '0.7.0', released)).toEqual([])
		expect(versionBumpErrors('0.6.9', '0.6.10', empty, pending)).toEqual([
			'the breaking release 0.6.9 → 0.6.10 needs a `## [0.6.10]` section in UPGRADING.md',
		])
	})

	it('requires a section for 1.0.0 and for each major after it', () => {
		expect(versionBumpErrors('0.6.9', '1.0.0', empty)).toEqual([
			'the breaking release 0.6.9 → 1.0.0 needs a `## [1.0.0]` section in UPGRADING.md',
		])
		expect(versionBumpErrors('1.2.3', '2.0.0', major)).toEqual([])
	})

	it('fails a compatible bump from 1.0.0 on when transitions are pending', () => {
		expect(versionBumpErrors('1.2.3', '1.3.0', pending)).toEqual([
			'UPGRADING.md has transitions for 1.3.0, so 1.2.3 → 1.3.0 must be the breaking release 2.0.0',
		])
		expect(versionBumpErrors('1.2.3', '1.2.4', empty, pending)).toHaveLength(1)
		expect(versionBumpErrors('1.2.3', '1.4.0', empty)).toEqual([])
	})

	it('rejects a version that does not increase or skips a release', () => {
		for (const to of ['0.6.8', '0.2.0'])
			expect(versionBumpErrors('0.6.9', to, empty)).toEqual([
				`the core version 0.6.9 → ${to} does not increase`,
			])
		for (const to of ['1.0.1', '2.0.0'])
			expect(versionBumpErrors('0.6.9', to, empty)).toEqual([
				`0.6.9 → ${to} is neither a fix or compatible release nor the breaking release a higher 0.y.z or 1.0.0`,
			])
		expect(versionBumpErrors('1.2.3', '3.0.0', empty)).toEqual([
			'1.2.3 → 3.0.0 is neither a fix or compatible release nor the breaking release 2.0.0',
		])
	})

	it('rejects a version that is not x.y.z', () => {
		expect(versionBumpErrors('0.6.9', '0.7.0-rc.1', empty)).toHaveLength(1)
	})
})

describe('removedEntries', () => {
	it('names the entries of the base that no section of the head keeps', () => {
		const base = upgrading(['Unreleased', entry('`b`')], ['0.4.0', entry('`a`')])
		expect(
			removedEntries(
				base,
				upgrading(['Unreleased'], ['0.5.0', entry('`b`')], ['0.4.0', entry('`a`')]),
			),
		).toEqual([])
		expect(removedEntries(base, upgrading(['Unreleased'], ['0.4.0', entry('`a`')]))).toEqual([
			'`b`',
		])
		expect(removedEntries(base, upgrading(['Unreleased', entry('`b`')]))).toEqual(['`a`'])
	})
})

describe('unreleasedCoreErrors', () => {
	it('fails a story release that changes the core without bumping it', () => {
		expect(unreleasedCoreErrors('1.6.10', '1.6.11', '0.6.10', '0.6.10', true)).toEqual([
			"the release 1.6.11 changes the core but keeps its npm version 0.6.10; bump it to the story's 0.<epic>.<story> in the same pull request",
		])
	})

	it('passes a bumped core, an untouched core or no story release', () => {
		expect(unreleasedCoreErrors('1.6.10', '1.6.11', '0.6.10', '0.6.11', true)).toEqual([])
		expect(unreleasedCoreErrors('1.6.10', '1.6.11', '0.6.10', '0.6.10', false)).toEqual([])
		expect(unreleasedCoreErrors('1.6.10', '1.6.10', '0.6.10', '0.6.10', true)).toEqual([])
		expect(unreleasedCoreErrors(undefined, '1.6.11', '0.6.10', '0.6.10', true)).toEqual([])
	})
})
