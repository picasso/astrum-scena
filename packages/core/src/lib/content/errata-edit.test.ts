import { describe, expect, it } from 'vitest'

import {
	editMarkdownLinkDestination,
	escapeMarkdownLabel,
	locateNoteRegion,
	managedNoteIds,
	parseErrataNotes,
	regenerateNoteRegion,
	replaceProseLiteral,
	serializeNoteRegion,
	stripManagedNoteRegion,
} from './errata-edit'
import { extractLegacyLinks } from './legacy-links'

describe('escapeMarkdownLabel', () => {
	it('escapes Markdown metacharacters and leaves the rest of the URL alone', () => {
		expect(escapeMarkdownLabel('http://host.example/a_b*c[d]#e')).toBe(
			'http://host.example/a\\_b\\*c\\[d\\]\\#e',
		)
	})
})

describe('editMarkdownLinkDestination', () => {
	// link shapes of a links paragraph: full-URL label, bare-host label, escaped URL label
	const body =
		'**links:** [www.filters.example](<http://www.filters.example>) ' +
		'[http://www.lenses.example/products\\_gb.htm](<http://www.lenses.example/products_gb.htm>) ' +
		'[www.optics.example](<http://www.optics.example>)'

	it('replaces exactly the destination equal to RAW, preserving the <…> wrapper', () => {
		const result = editMarkdownLinkDestination(
			body,
			'http://www.optics.example',
			'https://lenses.example/en/optics-inc',
		)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.value).toContain(
			'[https://lenses.example/en/optics-inc](<https://lenses.example/en/optics-inc>)',
		)
		expect(result.value).toContain('[www.filters.example](<http://www.filters.example>)')
		expect(result.labelChanges).toEqual([
			{ before: 'www.optics.example', after: 'https://lenses.example/en/optics-inc' },
		])
	})

	it('re-applies Markdown escaping in a URL label (products_gb)', () => {
		const result = editMarkdownLinkDestination(
			body,
			'http://www.lenses.example/products_gb.htm',
			'https://lenses.example/en/photo-optics/filters',
		)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.value).toContain(
			'[https://lenses.example/en/photo-optics/filters](<https://lenses.example/en/photo-optics/filters>)',
		)
		expect(result.labelChanges).toEqual([
			{
				before: 'http://www.lenses.example/products_gb.htm',
				after: 'https://lenses.example/en/photo-optics/filters',
			},
		])
	})

	it('keeps link count stable and only the target destination changes (link parity intent)', () => {
		const before = extractLegacyLinks(body).occurrences.map((o) => o.rawHref)
		const result = editMarkdownLinkDestination(
			body,
			'http://www.optics.example',
			'https://lenses.example/en/optics-inc',
		)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		const after = extractLegacyLinks(result.value).occurrences.map((o) => o.rawHref)
		expect(after).toHaveLength(before.length)
		expect(after).toContain('https://lenses.example/en/optics-inc')
		expect(after).not.toContain('http://www.optics.example')
	})

	it('STOPs on zero and on many matches', () => {
		expect(editMarkdownLinkDestination(body, 'http://absent.test', 'http://x.test').ok).toBe(
			false,
		)
		const twice = '[a](<http://dup.test>) [b](<http://dup.test>)'
		const many = editMarkdownLinkDestination(twice, 'http://dup.test', 'http://x.test')
		expect(many).toEqual({ ok: false, reason: 'ambiguous', detail: expect.any(String) })
	})

	it('STOPs (unsafe-replacement) on a destination that could break the link', () => {
		const one = '[a](<http://a.test>)'
		const result = editMarkdownLinkDestination(
			one,
			'http://a.test',
			'http://a.test> onmouseover=x',
		)
		expect(result).toEqual({
			ok: false,
			reason: 'unsafe-replacement',
			detail: expect.any(String),
		})
	})

	it('wraps an unwrapped destination in <…> when the replacement carries parentheses', () => {
		const one = '[a](http://old.test)'
		const result = editMarkdownLinkDestination(
			one,
			'http://old.test',
			'https://x.test/Foo_(bar)',
		)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.value).toBe('[a](<https://x.test/Foo_(bar)>)')
		expect(result.labelChanges).toEqual([])
	})
})

describe('replaceProseLiteral', () => {
	it('replaces every whole-token occurrence of a renamed brand', () => {
		const result = replaceProseLiteral('Fotolux and Fotolux again', 'Fotolux', 'Photolux')
		expect(result).toEqual({ ok: true, value: 'Photolux and Photolux again', count: 2 })
	})

	it('does not touch a substring inside a larger word', () => {
		const result = replaceProseLiteral('superFotoluxury', 'Fotolux', 'Photolux')
		expect(result.ok).toBe(false)
	})

	it('STOPs (not-found) on zero occurrences', () => {
		expect(replaceProseLiteral('nothing here', 'Ghost', 'X').ok).toBe(false)
	})

	it('allows multi-word and hyphenated plain-text replacements', () => {
		expect(replaceProseLiteral('old Grad-ND filter', 'Grad-ND', 'Soft-ND')).toEqual({
			ok: true,
			value: 'old Soft-ND filter',
			count: 1,
		})
		expect(replaceProseLiteral('X brand', 'X', 'Steady Tripod Works').ok).toBe(true)
	})

	it('STOPs (unsafe-replacement) on any attribute-breaking or tag-forming replacement', () => {
		// the literal may sit inside an attribute value; the replacement must not break out of it
		for (const evil of [
			'<img src=x onerror=alert(1)>', // angle brackets open a new tag
			'" onerror="alert(1)', // a quote leaves a quoted attribute
			'X onmouseover=alert(1)', // `=` adds a handler to an unquoted attribute
			'`code`', // backtick
		]) {
			expect(replaceProseLiteral('brand X here', 'X', evil)).toEqual({
				ok: false,
				reason: 'unsafe-replacement',
				detail: expect.any(String),
			})
		}
	})

	it('allows an ampersand in a brand name', () => {
		expect(replaceProseLiteral('the XT brand', 'XT', 'R&D Optics').ok).toBe(true)
	})

	it('replaces only visible prose, never inside a tag (attribute value)', () => {
		const html = '<a data-brand="Fotolux" href="http://x.test">Fotolux ballhead</a>'
		const result = replaceProseLiteral(html, 'Fotolux', 'Photolux')
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.value).toBe(
			'<a data-brand="Fotolux" href="http://x.test">Photolux ballhead</a>',
		)
		expect(result.count).toBe(1)
	})

	it('is not fooled by a `>` inside an attribute value (quote-aware segmentation)', () => {
		const html = '<span title="x > Fotolux">Fotolux</span>'
		const result = replaceProseLiteral(html, 'Fotolux', 'Photolux')
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.value).toBe('<span title="x > Fotolux">Photolux</span>')
		expect(result.count).toBe(1)
	})
})

describe('regenerateNoteRegion + parseErrataNotes', () => {
	const noteA = { findingId: 'prod-a', digest8: 'aaaaaaaa', text: 'Первая заметка.' }
	const noteB = { findingId: 'prod-b', digest8: 'bbbbbbbb', text: 'Вторая заметка.' }

	it('creates a single canon note (no notitle on the first) when none exists', () => {
		const result = regenerateNoteRegion('Body text.', [noteA])
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.value).toBe(
			['Body text.', '', ':::note{claim="prod-a:aaaaaaaa"}', 'Первая заметка.', ':::'].join(
				'\n',
			),
		)
	})

	it('gives the first note no notitle and every later note notitle', () => {
		const result = regenerateNoteRegion('Body.', [noteA, noteB])
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.value).toBe(
			[
				'Body.',
				'',
				':::note{claim="prod-a:aaaaaaaa"}',
				'Первая заметка.',
				':::',
				'',
				':::note{claim="prod-b:bbbbbbbb" notitle}',
				'Вторая заметка.',
				':::',
			].join('\n'),
		)
	})

	it('is byte-identical when re-run with the same accepted set (idempotent, one region)', () => {
		const first = regenerateNoteRegion('Body text.', [noteA, noteB])
		expect(first.ok).toBe(true)
		if (!first.ok) return
		const second = regenerateNoteRegion(first.value, [noteA, noteB])
		expect(second.ok).toBe(true)
		if (!second.ok) return
		expect(second.value).toBe(first.value)
	})

	it('preserves prior note text byte-for-byte and appends a new note in order', () => {
		const first = regenerateNoteRegion('Body.', [noteA])
		expect(first.ok).toBe(true)
		if (!first.ok) return
		const second = regenerateNoteRegion(first.value, [noteA, noteB])
		expect(second.ok).toBe(true)
		if (!second.ok) return
		expect(second.value).toContain(':::note{claim="prod-a:aaaaaaaa"}\nПервая заметка.\n:::')
		expect(second.value).toContain(
			':::note{claim="prod-b:bbbbbbbb" notitle}\nВторая заметка.\n:::',
		)
		expect(second.value.indexOf('prod-a')).toBeLessThan(second.value.indexOf('prod-b'))
	})

	it('removes the region entirely when no notes remain', () => {
		const withRegion = regenerateNoteRegion('Body.', [noteA])
		expect(withRegion.ok).toBe(true)
		if (!withRegion.ok) return
		expect(regenerateNoteRegion(withRegion.value, [])).toEqual({ ok: true, value: 'Body.' })
	})

	it('round-trips notes through parseErrataNotes and managedNoteIds', () => {
		const built = regenerateNoteRegion('Body.', [noteA, noteB])
		expect(built.ok).toBe(true)
		if (!built.ok) return
		expect(parseErrataNotes(built.value)).toEqual({ ok: true, notes: [noteA, noteB] })
		expect(managedNoteIds(built.value)).toEqual({ ok: true, ids: ['prod-a', 'prod-b'] })
	})

	it('reports no region for a plain body', () => {
		expect(parseErrataNotes('Just prose.')).toEqual({ ok: true, notes: [] })
		expect(managedNoteIds('Just prose.')).toEqual({ ok: true, ids: [] })
	})

	it('ignores a manual note without claim (not managed, not an error)', () => {
		const body = 'Body.\n\n:::note{title="Автор"}\nРучная заметка.\n:::'
		expect(parseErrataNotes(body)).toEqual({ ok: true, notes: [] })
		expect(managedNoteIds(body)).toEqual({ ok: true, ids: [] })
	})

	it('STOPs (fail-closed) on a claim note that is not the trailing region', () => {
		const body = ':::note{claim="prod-a:aaaaaaaa"}\nЗаметка.\n:::\n\nMore prose after.'
		expect(managedNoteIds(body).ok).toBe(false)
		expect(regenerateNoteRegion(body, [noteA]).ok).toBe(false)
	})

	it('tolerates and round-trips presentational tone/icon on a managed claim note', () => {
		const body =
			'Body.\n\n:::note{claim="prod-a:aaaaaaaa" tone="alert" icon="history"}\nЗаметка.\n:::'
		expect(managedNoteIds(body)).toEqual({ ok: true, ids: ['prod-a'] })
		const parsed = parseErrataNotes(body)
		expect(parsed).toEqual({
			ok: true,
			notes: [
				{
					findingId: 'prod-a',
					digest8: 'aaaaaaaa',
					text: 'Заметка.',
					tone: 'alert',
					icon: 'history',
				},
			],
		})
		if (!parsed.ok) return
		const round = regenerateNoteRegion('Body.', parsed.notes)
		expect(round).toEqual({ ok: true, value: body })
	})

	it('emits notitle before tone on later notes and keeps the first note without notitle', () => {
		const result = regenerateNoteRegion('Body.', [
			{ findingId: 'prod-a', digest8: 'aaaaaaaa', text: 'A', tone: 'info' },
			{ findingId: 'prod-b', digest8: 'bbbbbbbb', text: 'B', tone: 'alert' },
		])
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.value).toContain(':::note{claim="prod-a:aaaaaaaa" tone="info"}')
		expect(result.value).toContain(':::note{claim="prod-b:bbbbbbbb" notitle tone="alert"}')
	})

	it('STOPs (fail-closed) on a claim note with an unknown attribute', () => {
		const body = 'Body.\n\n:::note{claim="prod-a:aaaaaaaa" variant="line"}\nЗаметка.\n:::'
		expect(managedNoteIds(body).ok).toBe(false)
	})

	it('STOPs (fail-closed) on a title attribute on a managed (claim) note', () => {
		const body = 'Body.\n\n:::note{claim="prod-a:aaaaaaaa" title="Иначе"}\nЗаметка.\n:::'
		expect(managedNoteIds(body).ok).toBe(false)
	})

	it('STOPs (fail-closed) on a 4-colon claim note that still renders (not the canon 3 colons)', () => {
		const body = 'Body.\n\n::::note{claim="prod-a:aaaaaaaa"}\nЗаметка.\n::::'
		expect(managedNoteIds(body).ok).toBe(false)
	})

	it('STOPs (fail-closed) on a claim opener with trailing text after the brace (still renders)', () => {
		const body = 'Body.\n\n:::note{claim="prod-a:aaaaaaaa"} junk\nЗаметка.\n:::'
		expect(managedNoteIds(body).ok).toBe(false)
	})

	it('STOPs (fail-closed) on an unclosed claim note', () => {
		const body = 'Body.\n\n:::note{claim="prod-a:aaaaaaaa"}\nЗаметка без закрытия.'
		expect(managedNoteIds(body).ok).toBe(false)
	})

	it('does not treat a :::note inside a fenced code block as a region', () => {
		const body = [
			'Body.',
			'',
			'```md',
			':::note{claim="prod-a:aaaaaaaa"}',
			'x',
			':::',
			'```',
		].join('\n')
		expect(managedNoteIds(body)).toEqual({ ok: true, ids: [] })
	})

	it('STOPs (fail-closed) on an unsafe finding id, a malformed digest8, or fence text', () => {
		expect(regenerateNoteRegion('Body.', [{ ...noteA, findingId: 'bad:id' }]).ok).toBe(false)
		expect(regenerateNoteRegion('Body.', [{ ...noteA, digest8: 'ZZZ' }]).ok).toBe(false)
		expect(regenerateNoteRegion('Body.', [{ ...noteA, text: 'line\n::: sneaky' }]).ok).toBe(
			false,
		)
	})

	it('honors a custom EOL (\\r\\n) and round-trips it', () => {
		const result = regenerateNoteRegion('Body.', [noteA], '\r\n')
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.value).toContain('\r\n\r\n:::note{claim="prod-a:aaaaaaaa"}\r\n')
		expect(parseErrataNotes(result.value)).toEqual({ ok: true, notes: [noteA] })
	})

	it('round-trips a MULTI-note CRLF region (the closer consumes the CR)', () => {
		const built = regenerateNoteRegion('Body.', [noteA, noteB], '\r\n')
		expect(built.ok).toBe(true)
		if (!built.ok) return
		expect(parseErrataNotes(built.value)).toEqual({ ok: true, notes: [noteA, noteB] })
		expect(managedNoteIds(built.value)).toEqual({ ok: true, ids: ['prod-a', 'prod-b'] })
		// idempotent over CRLF.
		const again = regenerateNoteRegion(built.value, [noteA, noteB], '\r\n')
		expect(again.ok).toBe(true)
		if (!again.ok) return
		expect(again.value).toBe(built.value)
	})

	it('does not let an invalid backtick fence (backtick in info) hide a following region', () => {
		const body = ['```x`y', '', ':::note{claim="prod-a:aaaaaaaa"}', 'Заметка.', ':::'].join(
			'\n',
		)
		expect(managedNoteIds(body)).toEqual({ ok: true, ids: ['prod-a'] })
	})

	it('still excludes a genuine (valid) fenced code block containing note-like lines', () => {
		const body = ['```md', ':::note{claim="prod-a:aaaaaaaa"}', 'x', ':::', '```'].join('\n')
		expect(managedNoteIds(body)).toEqual({ ok: true, ids: [] })
	})
})

describe('serializeNoteRegion', () => {
	it('writes the canonical region with notitle on later notes and the given EOL', () => {
		expect(
			serializeNoteRegion(
				[
					{ findingId: 'prod-a', digest8: 'aaaaaaaa', text: 'A', icon: 'history' },
					{ findingId: 'prod-b', digest8: 'bbbbbbbb', text: 'B' },
				],
				'\r\n',
			),
		).toBe(
			[
				':::note{claim="prod-a:aaaaaaaa" icon="history"}',
				'A',
				':::',
				'',
				':::note{claim="prod-b:bbbbbbbb" notitle}',
				'B',
				':::',
			].join('\r\n'),
		)
	})
})

describe('stripManagedNoteRegion', () => {
	it('drops the trailing errata region, leaving the authored body', () => {
		const built = regenerateNoteRegion('Authored body.', [
			{ findingId: 'prod-a', digest8: 'aaaaaaaa', text: 'Заметка.' },
		])
		expect(built.ok).toBe(true)
		if (!built.ok) return
		expect(stripManagedNoteRegion(built.value)).toBe('Authored body.')
	})

	it('returns a plain or malformed body unchanged', () => {
		expect(stripManagedNoteRegion('Just prose.')).toBe('Just prose.')
		const malformed = ':::note{claim="prod-a:aaaaaaaa"}\nx\n:::\n\ntrailing'
		expect(stripManagedNoteRegion(malformed)).toBe(malformed)
	})
	it('gives the same body whether notes sit before or after the trailing links', () => {
		const note = ':::note{claim="prod-a:aaaaaaaa"}\nЗаметка.\n:::'
		const links = ':::links\n- [A](https://a.example)\n:::'
		const plain = `Authored body.\n\n${links}`
		expect(stripManagedNoteRegion(`Authored body.\n\n${note}\n\n${links}`)).toBe(plain)
		expect(stripManagedNoteRegion(`${plain}\n\n${note}`)).toBe(plain)
	})
})

describe('note region next to trailing :::links', () => {
	const noteA = { findingId: 'prod-a', digest8: 'aaaaaaaa', text: 'Первая заметка.' }
	const noteB = { findingId: 'prod-b', digest8: 'bbbbbbbb', text: 'Вторая заметка.' }
	const links = ':::links{size="sm"}\n- [A](https://a.example)\n:::'
	const moreLinks = ':::links\n- [B](https://b.example)\n:::'
	const regionA = ':::note{claim="prod-a:aaaaaaaa"}\nПервая заметка.\n:::'

	it('reads a region placed before the trailing links run', () => {
		const body = `Body.\n\n${regionA}\n\n${links}\n\n${moreLinks}\n`
		expect(parseErrataNotes(body)).toEqual({ ok: true, notes: [noteA] })
		expect(locateNoteRegion(body).ok).toBe(true)
	})

	it('replaces the region in place, keeping the links after it', () => {
		const body = `Body.\n\n${regionA}\n\n${links}\n`
		const result = regenerateNoteRegion(body, [noteA, noteB])
		expect(result).toEqual({
			ok: true,
			value: `Body.\n\n${regionA}\n\n:::note{claim="prod-b:bbbbbbbb" notitle}\nВторая заметка.\n:::\n\n${links}\n`,
		})
	})

	it('removes the region and keeps the links one blank line after the prose', () => {
		const body = `Body.\n\n${regionA}\n\n${links}`
		expect(regenerateNoteRegion(body, [])).toEqual({ ok: true, value: `Body.\n\n${links}` })
	})

	it('inserts a new region before the trailing links run', () => {
		const result = regenerateNoteRegion(`Body.\n\n${links}\n\n${moreLinks}`, [noteA])
		expect(result).toEqual({
			ok: true,
			value: `Body.\n\n${regionA}\n\n${links}\n\n${moreLinks}`,
		})
	})

	it('still accepts a region placed after the links', () => {
		const body = `Body.\n\n${links}\n\n${regionA}`
		expect(parseErrataNotes(body)).toEqual({ ok: true, notes: [noteA] })
	})

	it('STOPs (fail-closed) when prose follows the links after the region', () => {
		const body = `Body.\n\n${regionA}\n\n${links}\n\nMore prose.`
		expect(managedNoteIds(body).ok).toBe(false)
	})

	it('inserts before an unclosed trailing :::links instead of inside it', () => {
		const result = regenerateNoteRegion('Body.\n\n:::links\n- [A](https://a.example)', [noteA])
		expect(result).toEqual({
			ok: true,
			value: `Body.\n\n${regionA}\n\n:::links\n- [A](https://a.example)`,
		})
	})

	it('does not treat a fenced :::links as the trailing run', () => {
		const body = `Body.\n\n${regionA}\n\n\`\`\`md\n${links}\n\`\`\``
		expect(managedNoteIds(body).ok).toBe(false)
	})
})
