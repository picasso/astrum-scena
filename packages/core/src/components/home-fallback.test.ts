import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { defaultTreeAdapter, type DefaultTreeAdapterTypes, parse } from 'parse5'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { localizedLabel } from '../config/localized-label.ts'
import { site } from '../config/site.ts'
import { localizedHref } from '../i18n/ui'
import type * as Featured from '../lib/featured.ts'
import HomePage from '../pages/[locale]/index.astro'

// the demo has `featured/home.yaml`; without the file the home page is the fallback
vi.mock('../lib/featured.ts', async (importOriginal) => ({
	...(await importOriginal<typeof Featured>()),
	loadFeaturedHome: async () => undefined,
}))

type Element = DefaultTreeAdapterTypes.Element
type Node = DefaultTreeAdapterTypes.Node

const descendants = (node: Node): Element[] =>
	('childNodes' in node ? node.childNodes : []).flatMap((child) =>
		defaultTreeAdapter.isElementNode(child)
			? [child, ...descendants(child)]
			: descendants(child),
	)

const attribute = (element: Element, name: string) =>
	element.attrs.find((attr) => attr.name === name)?.value

const hasClass = (element: Element, name: string) =>
	(attribute(element, 'class') ?? '').split(/\s+/).includes(name)

const text = (node: Node): string =>
	defaultTreeAdapter.isTextNode(node)
		? node.value
		: 'childNodes' in node
			? node.childNodes.map(text).join('')
			: ''

// the menu overlay renders the same links, so every assertion stays inside the fallback block
let container: AstroContainer
beforeAll(async () => {
	container = await AstroContainer.create()
})

describe('the home page of a site without featured slides', () => {
	it.each(site.content.locales)('shows the site title and its sections in %s', async (locale) => {
		const html = await container.renderToString(HomePage, {
			props: { locale },
			request: new Request(`${site.origin}/${locale}/`),
			locals: {},
		})
		const fallback = descendants(parse(html)).find((element) =>
			hasClass(element, 'home-fallback'),
		)
		expect(fallback).toBeDefined()
		const inside = descendants(fallback!)
		const title = inside.find((element) => element.tagName === 'h1')
		expect(title && text(title)).toBe(localizedLabel(site.identity.title, locale))
		const links = inside
			.filter((element) => element.tagName === 'nav')
			.flatMap(descendants)
			.filter((element) => element.tagName === 'a')
			.map((link) => ({ href: attribute(link, 'href'), label: text(link).trim() }))
		for (const item of site.menu.items) {
			expect(links).toContainEqual({
				href: localizedHref(locale, item.segment),
				label: localizedLabel(item.label, locale),
			})
		}
		expect(html).not.toContain('hero-swiper')
	})
})
