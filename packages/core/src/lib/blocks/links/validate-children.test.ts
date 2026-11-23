import { describe, expect, it } from 'vitest'

import { collectLinks, type MdastLike } from './validate-children.ts'

const text = (value: string): MdastLike => ({ type: 'text', value })
const brk = (): MdastLike => ({ type: 'break' })
const link = (url: string, ...children: MdastLike[]): MdastLike => ({
	type: 'link',
	url,
	children: children.length ? children : [text(url)],
})
const para = (...children: MdastLike[]): MdastLike => ({ type: 'paragraph', children })
const item = (...children: MdastLike[]): MdastLike => ({ type: 'listItem', children })
const list = (ordered: boolean, ...items: MdastLike[]): MdastLike => ({
	type: 'list',
	ordered,
	children: items,
})

describe('collectLinks — flexible input, links-only', () => {
	it('collects links from a markdown list, in order', () => {
		const links = collectLinks([
			list(
				false,
				item(para(link('http://a.example'))),
				item(para(link('/ru/x/', text('внутр')))),
			),
		])
		expect(links.map((l) => l.url)).toEqual(['http://a.example', '/ru/x/'])
	})

	it('collects bare links on separate lines (paragraph with soft breaks)', () => {
		const links = collectLinks([
			para(link('http://a.example'), brk(), link('http://b.example')),
		])
		expect(links.map((l) => l.url)).toEqual(['http://a.example', 'http://b.example'])
	})

	it('collects several links on ONE line separated by whitespace', () => {
		const links = collectLinks([
			para(link('http://a.example'), text('  '), link('http://b.example')),
		])
		expect(links.map((l) => l.url)).toEqual(['http://a.example', 'http://b.example'])
	})

	it('collects across multiple paragraphs', () => {
		const links = collectLinks([para(link('http://a.example')), para(link('http://b.example'))])
		expect(links).toHaveLength(2)
	})

	it('accepts an ordered list too (output is always a <ul>, so ordered source is fine)', () => {
		expect(collectLinks([list(true, item(para(link('http://a.example'))))])).toHaveLength(1)
	})

	it('accepts inline marks inside the link label', () => {
		expect(() =>
			collectLinks([
				para(link('http://a.example', { type: 'strong', children: [text('bold')] })),
			]),
		).not.toThrow()
	})

	it('rejects plain prose alongside the links', () => {
		expect(() => collectLinks([para(text('just prose'))])).toThrow(/plain text/)
		expect(() =>
			collectLinks([para(link('http://a.example'), text('trailing prose'))]),
		).toThrow(/plain text/)
	})

	it('rejects an empty body', () => {
		expect(() => collectLinks([])).toThrow(/empty/)
		expect(() => collectLinks([para(text('   '))])).toThrow(/empty/)
	})

	it('rejects a link with an empty or formatting-only label', () => {
		expect(() =>
			collectLinks([para({ type: 'link', url: 'http://a.example', children: [] })]),
		).toThrow(/empty or formatting-only label/)
	})

	it('rejects a disallowed node nested deep inside a link label (no XSS bypass)', () => {
		const nestedHtml: MdastLike = {
			type: 'link',
			url: 'http://a.example',
			children: [
				{
					type: 'strong',
					children: [
						{
							type: 'emphasis',
							children: [{ type: 'html', value: '<img onerror=alert(1)>' }],
						},
					],
				},
			],
		}
		expect(() => collectLinks([para(nestedHtml)])).toThrow(/raw HTML/)
	})

	it('rejects a GFM task-list checkbox item', () => {
		const taskItem: MdastLike = {
			type: 'listItem',
			checked: false,
			children: [{ type: 'paragraph', children: [link('http://a.example')] }],
		}
		expect(() => collectLinks([list(false, taskItem)])).toThrow(/task-list/)
	})

	it('never descends into a forbidden container to collect a link inside it', () => {
		// a link hidden inside a blockquote/table must NOT be collected — the container is rejected first.
		expect(() =>
			collectLinks([{ type: 'blockquote', children: [para(link('http://a.example'))] }]),
		).toThrow(/blockquote/)
		expect(() =>
			collectLinks([
				{
					type: 'table',
					children: [{ type: 'tableRow', children: [link('http://a.example')] }],
				},
			]),
		).toThrow(/table/)
	})

	it('rejects headings, images, reference links and nested directives', () => {
		expect(() => collectLinks([{ type: 'heading', children: [text('h')] }])).toThrow(/heading/)
		expect(() =>
			collectLinks([para({ type: 'image', url: 'http://a.example/x.png' })]),
		).toThrow(/image/)
		expect(() =>
			collectLinks([para({ type: 'linkReference', children: [text('ref')] })]),
		).toThrow(/reference-style link/)
		expect(() =>
			collectLinks([para({ type: 'containerDirective', name: 'links', children: [] })]),
		).toThrow(/nested links/)
	})
})
