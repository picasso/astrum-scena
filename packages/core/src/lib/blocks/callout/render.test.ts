import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri'
import { beforeAll, describe, expect, it } from 'vitest'

import { calloutMdastPlugin } from './plugin.ts'

// renders through the same Sätteri processor as production (`astro.config.mjs`)

type Renderer = {
	render: (src: string, opts?: Record<string, unknown>) => Promise<{ code: string }>
}
let renderer: Renderer

beforeAll(async () => {
	renderer = (await createSatteriMarkdownProcessor({
		features: { directive: true },
		mdastPlugins: [calloutMdastPlugin as never],
	})) as unknown as Renderer
})

async function render(src: string, fileURL?: string): Promise<string> {
	const { code } = await renderer.render(src, fileURL ? { fileURL: new URL(fileURL) } : {})
	return code
}

describe('callout render path', () => {
	it('recognizes :::callout and applies defaults', async () => {
		const html = await render(':::callout\nPlain body.\n:::')
		expect(html).toContain('class="callout callout--block callout--default"')
		expect(html).not.toContain('callout--transparent')
		expect(html).toContain('class="callout__content"')
		expect(html).toContain('Plain body.')
		expect(html).not.toContain('callout__icon')
	})

	it('renders a static div, never a blockquote/aside/note or island', async () => {
		const html = await render(':::callout\nBody.\n:::')
		expect(html).toContain('<div')
		expect(html).not.toContain('<blockquote')
		expect(html).not.toContain('<aside')
		expect(html).not.toContain('role="note"')
		expect(html).not.toContain('astro-island')
	})

	it('applies variant, tone and transparent modifiers', async () => {
		const html = await render(
			':::callout{variant="line" tone="accent" transparent}\nBody.\n:::',
		)
		expect(html).toContain('callout--line')
		expect(html).toContain('callout--accent')
		expect(html).toContain('callout--transparent')
	})

	it('emits a decorative aria-hidden icon from the closed set and none without icon', async () => {
		const withIcon = await render(':::callout{icon="video"}\nBody.\n:::')
		expect(withIcon).toContain('callout--with-icon')
		expect(withIcon).toContain('class="callout__icon" aria-hidden="true"')
		expect(withIcon).toContain('<svg')
		expect(withIcon).toContain('currentColor')
		expect(withIcon).not.toContain('#444')

		const withoutIcon = await render(':::callout\nBody.\n:::')
		expect(withoutIcon).not.toContain('callout--with-icon')
		expect(withoutIcon).not.toContain('callout__icon')
	})

	it('preserves several paragraphs, inline marks and both list kinds', async () => {
		const html = await render(
			':::callout\nFirst **bold** and [link](/x/).\n\nSecond _em_.\n\n- a\n- b\n\n1. one\n2. two\n:::',
		)
		expect(html).toContain('<strong>bold</strong>')
		expect(html).toContain('<em>em</em>')
		expect(html).toContain('<a href="/x/">link</a>')
		expect(html).toContain('<ul>')
		expect(html).toContain('<ol>')
		expect((html.match(/<p>/g) ?? []).length).toBeGreaterThanOrEqual(2)
	})

	it('recognizes the same directive when the source is MDX-flavored inline usage', async () => {
		// `.md` and `.mdx` share one mdast pipeline
		const html = await render(':::callout{tone="alt"}\nShared syntax.\n:::')
		expect(html).toContain('callout--alt')
		expect(html).toContain('Shared syntax.')
	})

	it('fails with document path and directive position on a forbidden child', async () => {
		await expect(render(':::callout\n## heading\n:::', 'file:///docs/a.md')).rejects.toThrow(
			/\/docs\/a\.md:1:1 callout: .*heading/,
		)
	})

	it('rejects reference-style links (target may live outside the block, so its URL is unverifiable)', async () => {
		await expect(
			render(
				':::callout\nSee [site][s].\n\n[s]: https://e.example/\n:::',
				'file:///docs/r.md',
			),
		).rejects.toThrow(/callout: .*reference-style link/)
	})

	it('fails on an executable link URL in the body (markdown links are not sanitized upstream)', async () => {
		await expect(
			render(':::callout\n[click](javascript:alert(1))\n:::', 'file:///docs/x.md'),
		).rejects.toThrow(/callout: .*unsafe URL/)
	})

	it('fails on empty body and on unknown parameters', async () => {
		await expect(render(':::callout\n\n:::', 'file:///docs/b.md')).rejects.toThrow(
			/callout: .*empty/,
		)
		await expect(
			render(':::callout{width="90"}\nBody.\n:::', 'file:///docs/c.md'),
		).rejects.toThrow(/callout: .*unknown parameter/)
	})
})
