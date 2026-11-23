import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri'
import { beforeAll, describe, expect, it } from 'vitest'

import { linksMdastPlugin } from './plugin.ts'

// uses the production satteri processor; `.md` and `.mdx` share this mdast pipeline, so full Astro
// `.mdx` compilation is deliberately not exercised here

type Renderer = {
	render: (src: string, opts?: Record<string, unknown>) => Promise<{ code: string }>
}
let renderer: Renderer

beforeAll(async () => {
	renderer = (await createSatteriMarkdownProcessor({
		features: { directive: true },
		mdastPlugins: [linksMdastPlugin as never],
	})) as unknown as Renderer
})

async function render(src: string, fileURL = 'file:///docs/x.ru.md'): Promise<string> {
	const { code } = await renderer.render(src, { fileURL: new URL(fileURL) })
	return code
}

const BODY = `- [www.tripod.example](http://www.tripod.example)\n- [www.ballhead.example](http://www.ballhead.example)`

describe('links render path', () => {
	it('recognizes :::links and applies defaults with the RU heading', async () => {
		const html = await render(`:::links\n${BODY}\n:::`)
		expect(html).toContain(
			'class="links links--sm links--gap-tiny links--w-content links--right links--icon-heading"',
		)
		expect(html).toContain('class="links__title"')
		expect(html).toContain('Ссылки')
		expect(html).toContain('class="links__list"')
		expect(html).toContain('<li><a')
		expect(html).toContain('href="http://www.tripod.example"')
	})

	it('accepts bare links on separate lines (no markdown list markers required)', async () => {
		const html = await render(
			`:::links\n[www.a.example](http://a.example)\n[www.b.example](http://b.example)\n:::`,
		)
		expect(html).toContain('class="links__list"')
		expect((html.match(/<li><a /g) ?? []).length).toBe(2)
		expect(html).toContain('href="http://a.example"')
		expect(html).toContain('href="http://b.example"')
	})

	it('accepts several links on one line and splits them into items', async () => {
		const html = await render(
			`:::links\n[a](http://a.example) [b](http://b.example) [c](http://c.example)\n:::`,
		)
		expect((html.match(/<li><a /g) ?? []).length).toBe(3)
	})

	it('normalizes an ordered-list input to a <ul>, never an <ol>', async () => {
		const html = await render(
			`:::links\n1. [a](http://a.example)\n2. [b](http://b.example)\n:::`,
		)
		expect(html).toContain('<ul class="links__list">')
		expect(html).not.toContain('<ol')
		expect((html.match(/<li><a /g) ?? []).length).toBe(2)
	})

	it('renders a static div (never a blockquote/aside or island)', async () => {
		const html = await render(`:::links\n${BODY}\n:::`)
		expect(html).toContain('<div')
		expect(html).not.toContain('<blockquote')
		expect(html).not.toContain('<aside')
		expect(html).not.toContain('astro-island')
	})

	it('opens external links in a new tab and keeps internal links / anchors same-tab', async () => {
		const html = await render(
			`:::links\n- [ext](http://a.example)\n- [internal](/ru/x/)\n- [anchor](#gear)\n:::`,
		)
		expect(html).toMatch(
			/<a href="http:\/\/a\.example" target="_blank" rel="noopener noreferrer"/,
		)
		expect(html).toContain('<a href="/ru/x/">')
		expect(html).toContain('<a href="#gear">')
		expect(html).not.toMatch(/href="\/ru\/x\/"[^>]*target/)
		expect(html).not.toMatch(/href="#gear"[^>]*target/)
	})

	it('uses the EN default heading for an .en document', async () => {
		const html = await render(`:::links\n${BODY}\n:::`, 'file:///docs/x.en.md')
		expect(html).toContain('Links')
		expect(html).not.toContain('Ссылки')
	})

	it('fails closed when the locale cannot be determined and no title is given', async () => {
		await expect(render(`:::links\n${BODY}\n:::`, 'file:///docs/plain.md')).rejects.toThrow(
			/links: cannot determine the document locale/,
		)
	})

	it('lets an explicit title override the default and rejects an empty one', async () => {
		const titled = await render(`:::links{title="Полезное"}\n${BODY}\n:::`)
		expect(titled).toContain('Полезное')
		expect(titled).not.toContain('>Ссылки<')
		await expect(render(`:::links{title="  "}\n${BODY}\n:::`)).rejects.toThrow(
			/links: .*non-empty/,
		)
	})

	it('renders a hostile title as escaped text, never raw tags', async () => {
		const html = await render(`:::links{title="<img src=x onerror=alert(1)>"}\n${BODY}\n:::`)
		expect(html).not.toContain('<img src=x onerror=alert(1)>')
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
	})

	it('suppresses the title paragraph (and its icon) under notitle', async () => {
		const html = await render(`:::links{notitle}\n${BODY}\n:::`)
		expect(html).not.toContain('class="links__title"')
		expect(html).not.toContain('links__icon')
		expect(html).toContain('class="links__list"')
	})

	it('emits the enum modifier classes for size/gap/width/align/icon', async () => {
		const html = await render(
			`:::links{size="sm" gap="large" width="compact" align="left" icon="none"}\n${BODY}\n:::`,
		)
		expect(html).toContain('links--sm')
		expect(html).toContain('links--gap-large')
		expect(html).toContain('links--w-compact')
		expect(html).toContain('links--left')
		expect(html).toContain('links--icon-none')
	})

	it('emits links--w-full for width=full (CSS silently drops align)', async () => {
		const html = await render(`:::links{width="full"}\n${BODY}\n:::`)
		expect(html).toContain('links--w-full')
	})

	describe('icons', () => {
		it('icon=heading (default) puts an aria-hidden bookmark span on the heading', async () => {
			const html = await render(`:::links\n${BODY}\n:::`)
			expect(html).toContain('class="links__icon" aria-hidden="true"')
			expect(html).toContain('<svg')
			expect(html).toContain('currentColor')
		})

		it('icon=heading + notitle renders no icon (no heading to attach it to)', async () => {
			const html = await render(`:::links{notitle}\n${BODY}\n:::`)
			expect(html).not.toContain('links__icon')
		})

		it('icon=each puts a LEADING aria-hidden ↗ inside each EXTERNAL link only', async () => {
			const html = await render(
				`:::links{icon="each"}\n- [ext](http://a.example)\n- [internal](/ru/x/)\n:::`,
			)
			// external anchor carries a leading ↗ span (before the label text); internal one does not.
			expect(html).toMatch(
				/href="http:\/\/a\.example"[^>]*><span class="links__ext" aria-hidden="true">[\s\S]*?<\/span>ext<\/a>/,
			)
			expect(html).not.toContain('class="links__icon"')
			const internalAnchor = html.slice(html.indexOf('href="/ru/x/"'))
			expect(internalAnchor.slice(0, internalAnchor.indexOf('</a>'))).not.toContain(
				'links__ext',
			)
		})

		it('icon=none renders no icons anywhere', async () => {
			const html = await render(`:::links{icon="none"}\n${BODY}\n:::`)
			expect(html).not.toContain('links__icon')
			expect(html).not.toContain('links__ext')
		})
	})

	describe('rejections carry the document path and directive position', () => {
		const cases: [string, RegExp][] = [
			[`:::links{bogus="1"}\n${BODY}\n:::`, /links: .*unknown parameter/],
			[`:::links{.fancy}\n${BODY}\n:::`, /links: .*shortcut/],
			[`:::links{notitle="true"}\n${BODY}\n:::`, /links: .*bare flag/],
			[`:::links{title="x" notitle}\n${BODY}\n:::`, /links: .*mutually exclusive/],
			[`:::links\n- [x](mailto:a@b.example)\n:::`, /links: .*unsafe or unsupported URL/],
			[`:::links\n- [x](javascript:alert(1))\n:::`, /links: .*unsafe or unsupported URL/],
			[`:::links\n- [x](//evil.com)\n:::`, /links: .*unsafe or unsupported URL/],
			// prose alongside links is rejected (the block is links-only), in list or bare form.
			[`:::links\n- just prose\n:::`, /links: .*plain text/],
			[`:::links\nplain paragraph, not a list\n:::`, /links: .*plain text/],
			[`:::links\n[a](http://a.example) and then some prose\n:::`, /links: .*plain text/],
			[`:::links\n\n:::`, /links: .*empty/],
			// raw HTML nested inside a link label must not slip through (stored-XSS guard).
			[
				`:::links\n- [***<img src=x onerror=alert(1)>***](http://a.example)\n:::`,
				/links: .*raw HTML/,
			],
		]

		for (const [src, matcher] of cases) {
			it(`rejects: ${matcher.source}`, async () => {
				await expect(render(src, 'file:///docs/a.ru.md')).rejects.toThrow(matcher)
			})
		}

		it('prefixes the error with the document path and 1:1 position', async () => {
			await expect(
				render(`:::links{bogus="1"}\n${BODY}\n:::`, 'file:///docs/a.ru.md'),
			).rejects.toThrow(/\/docs\/a\.ru\.md:1:1 links: /)
		})
	})
})
