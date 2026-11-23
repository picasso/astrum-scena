import { getContainerRenderer } from '@astrojs/mdx/container-renderer'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import type { AstroComponentFactory } from 'astro/runtime/server/index.js'
import { loadRenderers } from 'astro:container'
import { beforeAll, describe, expect, it } from 'vitest'

import { defaultLocale, site } from '../../config/site.ts'
import { type Lang, useTranslations } from '../../i18n/ui.ts'
import { buildLocaleMeta } from '../../lib/portfolio/page-meta.ts'
import { privacyControllerModel } from '../../lib/privacy/controller.ts'
import { createSitemapFilter } from '../../lib/sitemap.ts'
import { MDX_COMPONENTS } from './mdx-components.ts'

// the demo's privacy pages, root-relative to the Vite root (the demo); locales and the contact come
// from the demo's site.yaml
const PAGES = import.meta.glob<{ Content: AstroComponentFactory }>(
	'/src/content/pages/privacy.*.mdx',
	{ eager: true },
)
const { locales } = site.content

const privacyPage = (locale: string): AstroComponentFactory => {
	const page = PAGES[`/src/content/pages/privacy.${locale}.mdx`]
	if (!page) throw new Error(`the demo has no privacy page for "${locale}"`)
	return page.Content
}

// the locale's own dictionary as the build merges it
const contactFormLabel = (locale: Lang): string => useTranslations(locale)('privacy.contactForm')

let container: AstroContainer

beforeAll(async () => {
	container = await AstroContainer.create({
		renderers: await loadRenderers([getContainerRenderer()]),
		astroConfig: {
			i18n: {
				locales: [...locales],
				defaultLocale: defaultLocale(site),
				routing: { prefixDefaultLocale: true },
			},
		},
	})
})

describe('privacy pages', () => {
	it('renders the controller and contact link in every language context', async () => {
		for (const locale of locales) {
			const controller = privacyControllerModel(site.privacy.controller, locale)
			const html = await container.renderToString(privacyPage(locale), {
				props: { components: MDX_COMPONENTS },
				request: new Request(`https://site.test/${locale}/privacy/`),
			})
			const anchor = html.match(
				new RegExp(`<a href="${controller.contactHref}"[^>]*>([^<]*)</a>`),
			)
			expect(anchor?.[1]?.trim(), locale).toBe(contactFormLabel(locale))
			expect(controller.contactHref, locale).toBe(`/${locale}/contacts/`)
			expect(html, locale).toContain(controller.name)
			expect(html, locale).not.toContain('undefined')
		}
	})

	it('uses reciprocal canonical metadata and remains in sitemap', () => {
		for (const locale of locales) {
			const href = `https://site.test/${locale}/privacy/`
			const meta = buildLocaleMeta(`/${locale}/privacy/`, 'https://site.test/', locales)
			expect(meta.canonical).toBe(href)
			for (const other of locales.filter((code) => code !== locale)) {
				expect(meta.alternates).toContainEqual({
					hreflang: other,
					href: `https://site.test/${other}/privacy/`,
				})
			}
			expect(createSitemapFilter(new Set())(href)).toBe(true)
		}
	})
})
