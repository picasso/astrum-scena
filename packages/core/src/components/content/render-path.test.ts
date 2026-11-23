import { readFileSync } from 'node:fs'
import path from 'node:path'

import { getContainerRenderer } from '@astrojs/mdx/container-renderer'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { loadRenderers } from 'astro:container'
import { beforeAll, describe, expect, it } from 'vitest'

import { CORE_ROOT } from '../../core-root.ts'
import DocumentBody from './document-body.astro'
import { MDX_COMPONENTS } from './mdx-components.ts'
import { Content as FixtureContent } from './test-fixtures/block-render-path.mdx'
import TestBlock from './test-fixtures/test-block.astro'

let container: AstroContainer

beforeAll(async () => {
	container = await AstroContainer.create({
		renderers: await loadRenderers([getContainerRenderer()]),
	})
})

// a pre-rendered entry is enough: `render(entry)` → `<Content />` is the same path as on a detail route
function entry(html: string) {
	return {
		collection: 'articles',
		id: 'glass-and-light-en',
		data: { title: 'Glass and light' },
		rendered: { html, metadata: {} },
	}
}

describe('document render path', () => {
	it('renders the document body', async () => {
		const html = await container.renderToString(DocumentBody, {
			props: { entry: entry('<p>Body text.</p>') },
		})
		expect(html).toContain('<p>Body text.</p>')
	})

	// a block lightbox boots only where the loader is included; portfolio routes include it themselves,
	// documents share no other place, so the body carries it
	it('carries the PhotoSwipe loader on every document route', async () => {
		const html = await container.renderToString(DocumentBody, {
			props: { entry: entry('') },
		})
		expect(html).toContain('photoswipe-loader.astro')
	})

	// the registry arrives as a prop, so no `.mdx` needs its own `import`
	it('provides registered components to MDX without an import in the document', async () => {
		const html = await container.renderToString(FixtureContent, {
			props: { components: { ...MDX_COMPONENTS, TestBlock } },
		})
		expect(html).toContain('data-test-block')
		expect(html).toContain('from the registry')
		expect(html).toContain('Plain paragraph.')
	})

	// the `components` prop leaves no trace in the HTML and a faked entry skips the MDX branch of
	// `render()`, so the wiring is checked in the source; without it a registered block would never
	// reach a document while the tests stayed green
	it('passes the shared registry into the document content', () => {
		const source = readFileSync(
			path.join(CORE_ROOT, 'src/components/content/document-body.astro'),
			'utf8',
		)
		expect(source).toMatch(/<Content[^>]*\scomponents=\{MDX_COMPONENTS\}/)
	})

	it('registers block components that MDX documents use without an import', () => {
		expect(Object.keys(MDX_COMPONENTS)).toContain('WrapAround')
	})
})
