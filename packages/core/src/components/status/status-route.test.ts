import { readFileSync } from 'node:fs'
import path from 'node:path'

import { getContainerRenderer } from '@astrojs/react/container-renderer'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { loadRenderers } from 'astro:container'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { SERVICE_COPY_LOCALE } from '../../config/locale-schema.ts'
import { defaultLocale, site } from '../../config/site.ts'
import { siteRoot } from '../../config/site-root.ts'
import { loadContentSnapshot } from '../../lib/content/files.ts'
import { articleHref } from '../../lib/content/routes.ts'
import { loadReleaseDescriptor } from '../../lib/images/release.ts'
import { getPublishedAlbums, getPublishedPhotos } from '../../lib/portfolio/publication.ts'
import Status from '../../pages/status.astro'

// the page renders under a test-built config with a substituted origin, so neither a hardcoded domain
// nor a real site.yaml origin can pass; the locales are the demo's, so its documents pair up
const ORIGIN = vi.hoisted(() => 'https://other.test')
vi.mock('../../config/site.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../config/site.ts')>()
	const { buildSiteConfig } = await import('../../config/fixtures/site-config.ts')
	return {
		...actual,
		site: buildSiteConfig({ origin: ORIGIN, content: actual.site.content }),
	}
})

// `astro:content` is empty in the vitest container, so the collections are the demo's own entries
vi.mock('astro:content', async () => {
	const { siteRoot } = await import('../../config/site-root.ts')
	const { loadContentSnapshot } = await import('../../lib/content/files.ts')
	const snapshot = await loadContentSnapshot(siteRoot)
	const collections: Record<string, readonly unknown[]> = {
		articles: snapshot.articles,
		pages: snapshot.pages,
		photos: snapshot.photos,
		albums: snapshot.albums,
	}
	return {
		getCollection: async (name: string, filter?: (entry: unknown) => boolean) => {
			const entries = collections[name] ?? []
			return filter ? entries.filter(filter) : entries
		},
	}
})

// `/status/` is a language-neutral service page with a narrow SEO boundary; its model needs no network,
// so the whole page renders in the vitest container
let html: string
beforeAll(async () => {
	const container = await AstroContainer.create({
		renderers: await loadRenderers([getContainerRenderer()]),
	})
	html = await container.renderToString(Status, {
		request: new Request('https://site.test/status/'),
	})
})

const badge = (tone: string, value: number | string) =>
	new RegExp(`site-status__tone-${tone} site-status__badge--sm"\\s*>${value}<`)

describe('status route SEO boundary', () => {
	it('marks the heading and main as service copy, keeping the document on the default locale', () => {
		expect(html).toContain(`<html lang="${defaultLocale(site)}"`)
		expect(html).toMatch(new RegExp(`<div data-menu-inert lang="${SERVICE_COPY_LOCALE}"[^>]*>`))
		expect(html).toMatch(new RegExp(`<main data-menu-inert lang="${SERVICE_COPY_LOCALE}"`))
		expect(html).toContain('class="site-status"')
		expect(html).toContain('Site status')
	})

	it('opts into noindex,follow without changing global SEO', () => {
		expect(html).toContain('<meta name="robots" content="noindex,follow">')
	})

	it('is self-canonical at the language-neutral /status/ URL', () => {
		expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/status/">`)
	})

	it('omits privacy links and the language switcher', () => {
		const locales = site.content.locales.join('|')
		expect(html).not.toMatch(new RegExp(`<a\\b[^>]*href="/(?:${locales})/privacy/`))
		expect(html).not.toContain('<link rel="alternate"')
		expect(html).not.toContain('language-switcher')
	})

	it('does not link to itself from any navigation chrome', () => {
		expect(html).not.toContain('href="/status/"')
	})
})

describe('status route model', () => {
	it('shows the demo content, the release and the site version', async () => {
		const snapshot = await loadContentSnapshot(siteRoot)
		const display = defaultLocale(site)
		const articles = snapshot.articles.filter(
			(entry) => entry.data.locale === display && entry.data.status === 'published',
		)
		expect(articles.length).toBeGreaterThan(0)
		for (const article of articles) {
			expect(html).toContain(`href="${articleHref(article.data.slug, display)}"`)
		}
		expect(html).toMatch(badge('photos', getPublishedPhotos(snapshot.photos).length))
		expect(html).toMatch(badge('albums', getPublishedAlbums(snapshot.albums).length))
		const { descriptor } = loadReleaseDescriptor(siteRoot)
		expect(html).toMatch(badge('assets', Object.keys(descriptor.manifest.photos).length))
		const { version } = JSON.parse(
			readFileSync(path.join(siteRoot, 'package.json'), 'utf8'),
		) as {
			version: string
		}
		expect(html).toContain(`>v${version}</span`)
	})
})
