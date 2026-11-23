import { readFileSync } from 'node:fs'
import path from 'node:path'

import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri'
import { beforeAll, describe, expect, it } from 'vitest'

import { loadSiteConfig } from '../../../config/loader.ts'
import { siteRoot } from '../../../config/site-root.ts'
import { extractLegacyLinks } from '../../content/legacy-links.ts'
import { calloutMdastPlugin } from '../callout/plugin.ts'
import { noteMdastPlugin } from '../note/plugin.ts'
import { linksMdastPlugin } from './plugin.ts'

// the production plugin set runs in its integration order, so the demo article's trailing
// `:::links` + `:::note` pair goes through both plugins; the comparison with a frozen link inventory
// stays with the reference site

const ARTICLES = path.join(siteRoot, 'src/content/articles')
const KEYS = loadSiteConfig(siteRoot).content.locales.map(
	(locale) => `reading-the-light.${locale}.md`,
)

function source(key: string): string {
	return readFileSync(path.join(ARTICLES, key), 'utf8')
}

// the satteri processor renders the body only; frontmatter is the Astro content layer's job
function body(key: string): string {
	return source(key).replace(/^---\n[\s\S]*?\n---\n/, '')
}

type Renderer = {
	render: (src: string, opts?: Record<string, unknown>) => Promise<{ code: string }>
}
let renderer: Renderer

beforeAll(async () => {
	renderer = (await createSatteriMarkdownProcessor({
		features: { directive: true },
		mdastPlugins: [calloutMdastPlugin, noteMdastPlugin, linksMdastPlugin] as never,
	})) as unknown as Renderer
})

describe('demo :::links corpus', () => {
	for (const key of KEYS) {
		it(`renders every links directive in ${key} as a semantic list with intact links`, async () => {
			const { code } = await renderer.render(body(key), {
				fileURL: new URL(`file:///docs/${key}`),
			})

			const directiveCount = (source(key).match(/^:::links\b/gm) ?? []).length
			expect(directiveCount).toBeGreaterThan(0)
			expect((code.match(/class="links links--/g) ?? []).length).toBe(directiveCount)
			expect((code.match(/<ul class="links__list">/g) ?? []).length).toBe(directiveCount)
			expect(code).toContain('class="note note--')
			expect(code).not.toContain('<blockquote')

			const { occurrences, diagnostics } = extractLegacyLinks(body(key))
			expect(diagnostics).toEqual([])
			expect(occurrences.length).toBeGreaterThan(0)
			for (const link of occurrences) {
				expect(code).toContain(
					`<a href="${link.rawHref}" target="_blank" rel="noopener noreferrer">${link.label}</a>`,
				)
			}
		})
	}

	it('keeps the same link destinations in every locale of the article', () => {
		const [first, ...rest] = KEYS.map((key) =>
			extractLegacyLinks(body(key)).occurrences.map((link) => link.rawHref),
		)
		for (const hrefs of rest) expect(hrefs).toEqual(first)
	})
})
