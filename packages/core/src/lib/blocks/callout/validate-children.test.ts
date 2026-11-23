import { describe, expect, it } from 'vitest'

import { CalloutValidationError } from './schema.ts'
import { type MdastLike, validateCalloutChildren } from './validate-children.ts'

const p = (text: string): MdastLike => ({
	type: 'paragraph',
	children: [{ type: 'text', value: text }],
})

describe('validateCalloutChildren', () => {
	it('accepts paragraphs, inline marks, links and both list kinds', () => {
		const tree: MdastLike[] = [
			{
				type: 'paragraph',
				children: [
					{ type: 'text', value: 'a ' },
					{ type: 'strong', children: [{ type: 'text', value: 'b' }] },
					{ type: 'emphasis', children: [{ type: 'text', value: 'c' }] },
					{ type: 'link', children: [{ type: 'text', value: 'd' }] },
					{ type: 'break' },
				],
			},
			{ type: 'list', children: [{ type: 'listItem', children: [p('one')] }] },
		]
		expect(() => validateCalloutChildren(tree)).not.toThrow()
	})

	it('rejects an empty or whitespace-only body', () => {
		expect(() => validateCalloutChildren([])).toThrow(/empty/)
		expect(() => validateCalloutChildren([p('   ')])).toThrow(/empty/)
	})

	it('rejects each forbidden child type', () => {
		const cases: Array<[MdastLike, RegExp]> = [
			[{ type: 'heading', children: [{ type: 'text', value: 'h' }] }, /heading/],
			[{ type: 'image' }, /image/],
			[{ type: 'code', value: 'x' }, /code/],
			[{ type: 'html', value: '<b>x</b>' }, /raw HTML/],
			[{ type: 'table' }, /table/],
			[{ type: 'blockquote', children: [p('q')] }, /blockquote/],
			[{ type: 'containerDirective', name: 'callout', children: [p('x')] }, /nested callout/],
			[{ type: 'containerDirective', name: 'note', children: [p('x')] }, /nested directive/],
			[{ type: 'mdxJsxFlowElement', children: [p('x')] }, /MDX/],
		]
		for (const [node, re] of cases) {
			expect(() => validateCalloutChildren([node]), node.type).toThrow(re)
			expect(() => validateCalloutChildren([node])).toThrow(CalloutValidationError)
		}
	})

	it('rejects links with an executable URL scheme but allows prose links', () => {
		const bad = (url: string): MdastLike => ({
			type: 'paragraph',
			children: [{ type: 'link', url, children: [{ type: 'text', value: 'x' }] }],
		})
		expect(() => validateCalloutChildren([bad('javascript:alert(1)')])).toThrow(/unsafe URL/)
		expect(() => validateCalloutChildren([bad('data:text/html,x')])).toThrow(/unsafe URL/)
		expect(() => validateCalloutChildren([bad('  java\tscript:alert(1)')])).toThrow(
			/unsafe URL/,
		)
		// legitimate prose links stay allowed.
		for (const url of ['/x/', 'https://e.example', 'mailto:a@b.example', 'tel:+1', '#anchor']) {
			expect(() => validateCalloutChildren([bad(url)]), url).not.toThrow()
		}
	})

	it('rejects reference-style links, whose target may live outside the block subtree', () => {
		// a definition can sit outside the callout, so its URL cannot be validated here; require an
		// inline link instead (closes the `[x][id]` + external `[id]: javascript:…` bypass).
		const linkRef: MdastLike[] = [
			{
				type: 'paragraph',
				children: [{ type: 'linkReference', children: [{ type: 'text', value: 'x' }] }],
			},
		]
		expect(() => validateCalloutChildren(linkRef)).toThrow(/reference-style link/)
		expect(() =>
			validateCalloutChildren([{ type: 'definition', url: 'https://e.example' }]),
		).toThrow(/reference-style link/)
	})

	it('detects a forbidden node nested deep in an allowed subtree', () => {
		const tree: MdastLike[] = [
			{
				type: 'list',
				children: [
					{
						type: 'listItem',
						children: [{ type: 'heading', children: [{ type: 'text', value: 'h' }] }],
					},
				],
			},
		]
		expect(() => validateCalloutChildren(tree)).toThrow(/heading/)
	})
})
