import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSiteConfig } from '../config/fixtures/site-config.ts'
import { siteRoot } from '../config/site-root.ts'
import type { SiteConfig } from '../config/site-schema.ts'
import { languageName, useTranslations } from '../i18n/ui.ts'
import { loadContentSnapshot } from '../lib/content/files.ts'
import { articleHref } from '../lib/content/routes.ts'
import type { AlbumData } from '../lib/content/schemas.ts'
import { footerPromoContext } from '../lib/portfolio/footer-promo-build.ts'
import type { AlbumEntry } from '../lib/portfolio/publication.ts'
import MoreDocuments from './content/more-documents.astro'
import AlbumList from './portfolio/album-list.astro'
import SiteFooter from './site-footer.astro'

// `astro:content` is empty in the vitest container, so the collections are the demo's own albums and
// photos; every photo is in the demo's active release, so footerThumb resolves
vi.mock('astro:content', async () => {
	const { siteRoot } = await import('../config/site-root.ts')
	const { loadContentSnapshot } = await import('../lib/content/files.ts')
	const snapshot = await loadContentSnapshot(siteRoot)
	return {
		getCollection: async (name: string) =>
			name === 'albums' ? snapshot.albums : name === 'photos' ? snapshot.photos : [],
	}
})

// components read the site singleton; every case renders under a test-built config set fresh before it
const config = vi.hoisted(() => ({ site: undefined as unknown as SiteConfig }))
vi.mock('../config/site.ts', async () => ({
	...(await import('../config/site-schema.ts')),
	get site() {
		return config.site
	},
}))
beforeEach(() => {
	config.site = buildSiteConfig()
})

const snapshot = await loadContentSnapshot(siteRoot)
const albums = snapshot.albums
const allPhotoIds = snapshot.photos.map((photo) => photo.id)

let container: AstroContainer

beforeAll(async () => {
	container = await AstroContainer.create()
})

describe('AlbumList', () => {
	it('links every given album in the given locale', async () => {
		const html = await container.renderToString(AlbumList, {
			props: { albums, locale: 'ru', label: 'Альбомы' },
		})
		expect([...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual(
			albums.map((album) => `/ru/portfolio/${album.id}/`),
		)
		for (const album of albums) expect(html).toContain(album.data.title.ru)
		expect(html).toContain('aria-label="Альбомы"')
	})

	// the portfolio index has no current album, an album page has exactly one
	it('marks the current album for assistive tech and for the accent modifier', async () => {
		const index = await container.renderToString(AlbumList, {
			props: { albums, locale: 'en', label: 'Albums' },
		})
		expect(index).not.toContain('aria-current')
		expect(index).not.toContain('album-list__link--current')

		const currentId = albums.at(-1)!.id
		const inAlbum = await container.renderToString(AlbumList, {
			props: { albums, locale: 'en', label: 'Albums', currentAlbumId: currentId },
		})
		expect(inAlbum.match(/aria-current="page"/g)).toHaveLength(1)
		expect(inAlbum.match(/album-list__link--current/g)).toHaveLength(1)
		const anchors = [...inAlbum.matchAll(/<a\b[^>]*>/g)].map((match) => match[0])
		expect(anchors).toHaveLength(albums.length)
		for (const anchor of anchors) {
			const isCurrent = anchor.includes(`href="/en/portfolio/${currentId}/"`)
			expect(anchor.includes('aria-current="page"')).toBe(isCurrent)
			expect(anchor.includes('album-list__link--current')).toBe(isCurrent)
		}
		expect(
			anchors.filter((anchor) => anchor.includes(`href="/en/portfolio/${currentId}/"`)),
		).toHaveLength(1)
	})

	it('has more than one demo album to choose from', () => {
		expect(albums.length).toBeGreaterThan(1)
	})
})

// the demo has fewer albums than the threshold, so the fold is checked on synthetic entries; the
// threshold comes from the test-built config
describe('AlbumList folding', () => {
	const syntheticAlbums = (count: number): AlbumEntry[] =>
		Array.from({ length: count }, (_, index) => ({
			id: `album-${index + 1}`,
			data: {
				category: 'series',
				title: { en: `Album ${index + 1}`, ru: `Альбом ${index + 1}` },
				description: { en: 'Synthetic album.', ru: 'Синтетический альбом.' },
				status: 'published',
				coverId: allPhotoIds[0]!,
				photoIds: [allPhotoIds[0]!],
			} as AlbumData,
		}))
	const render = (entries: AlbumEntry[], currentAlbumId?: string) =>
		container.renderToString(AlbumList, {
			props: { albums: entries, locale: 'en', label: 'Albums', currentAlbumId },
		})
	const linksOf = (html: string) =>
		[...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1])
	const listOf = (html: string, pattern: RegExp) => html.match(pattern)?.[0] ?? ''

	it('stays one open list just below albumList.collapseFrom', async () => {
		const entries = syntheticAlbums(config.site.albumList.collapseFrom - 1)
		const html = await render(entries)
		expect(html).not.toContain('<details')
		expect(html).not.toContain('album-list__items--wide')
		expect(linksOf(html)).toEqual(entries.map((album) => `/en/portfolio/${album.id}/`))
	})

	it('folds into a disclosure from albumList.collapseFrom with a counted summary', async () => {
		const count = config.site.albumList.collapseFrom
		const entries = syntheticAlbums(count)
		const current = entries.at(-1)!
		const html = await render(entries, current.id)
		const summary = listOf(html, /<summary[\s\S]*?<\/summary>/)
		expect(summary).toMatch(
			new RegExp(`Albums\\s*<span class="album-list__summary-count"[^>]*>\\(${count}\\)<`),
		)
		expect(summary).toMatch(
			new RegExp(`album-list__summary-current"[^>]*>${current.data.title.en}<`),
		)
		const hrefs = entries.map((album) => `/en/portfolio/${album.id}/`)
		const disclosure = listOf(html, /<details[\s\S]*?<\/details>/)
		const open = html.slice(html.indexOf('</details>'))
		expect(open).toContain('album-list__items--wide')
		for (const list of [disclosure, open]) {
			expect(linksOf(list)).toEqual(hrefs)
			expect(list.match(/aria-current="page"/g)).toHaveLength(1)
			expect(list).toMatch(
				new RegExp(`href="/en/portfolio/${current.id}/"[^>]*aria-current="page"`),
			)
		}
	})

	it('names no current album in the summary on the portfolio index', async () => {
		const html = await render(syntheticAlbums(config.site.albumList.collapseFrom))
		expect(html).toContain('<details')
		expect(html).not.toContain('album-list__summary-current')
		expect(html).not.toContain('aria-current')
	})
})

describe('MoreDocuments', () => {
	const article = snapshot.articles.find(
		(entry) => entry.data.slug === 'reading-the-light' && entry.data.locale === 'en',
	)!

	it('renders the heading and one link per sibling document', async () => {
		const href = articleHref(article.data.slug, 'en')
		const html = await container.renderToString(MoreDocuments, {
			props: {
				more: {
					heading: 'More articles',
					label: 'More articles',
					config: {
						...buildSiteConfig().moreDocs.article,
						layout: 'list',
						width: 'prose',
						columns: undefined,
					},
					cards: [{ href, title: article.data.title }],
				},
			},
		})
		expect(href).toBe('/en/articles/reading-the-light/')
		expect(html).toContain('More articles')
		expect(html).toContain(`href="${href}"`)
		expect(html).toContain(article.data.title)
	})

	// the prose width keeps the block in the text column, so it gets no breakout modifier
	it('keeps a prose-width block in the text column', async () => {
		const html = await container.renderToString(MoreDocuments, {
			props: {
				more: {
					heading: 'More articles',
					label: 'More articles',
					config: { ...buildSiteConfig().moreDocs.article, width: 'prose' },
					cards: [
						{ href: articleHref(article.data.slug, 'en'), title: article.data.title },
					],
				},
			},
		})
		expect(html).toMatch(/class="more-documents more-documents--prose"/)
		expect(html).not.toMatch(/more-documents--(medium|wide)/)
	})

	// without a heading the navigation is named by the label; without media no card has a frame
	it('renders a headingless masonry without media as a labelled navigation', async () => {
		const base = buildSiteConfig().moreDocs.article
		const cards = snapshot.articles
			.filter((entry) => entry.data.locale === 'en')
			.map((entry) => ({
				href: articleHref(entry.data.slug, 'en'),
				title: entry.data.title,
				excerpt: entry.data.excerpt,
			}))
		const html = await container.renderToString(MoreDocuments, {
			props: {
				more: {
					heading: 'Hidden heading',
					label: 'More pages',
					config: {
						...base,
						layout: 'masonry',
						columns: 2,
						gap: 16,
						width: 'wide',
						heading: 'off',
						media: 'off',
						ratio: undefined,
						excerpt: 'on',
						card: 'details',
					},
					cards,
				},
			},
		})
		expect(html).toMatch(/<nav[^>]*aria-label="More pages"/)
		expect(html).not.toContain('aria-labelledby')
		expect(html).not.toMatch(/<h2\b/)
		expect(html).not.toContain('Hidden heading')
		expect(html).toContain('card-masonry')
		expect(html).not.toContain('card__media')
		expect(html.match(/<a\b[^>]*class="card\b/g)).toHaveLength(cards.length)
	})

	// a lone published article must not get an empty "more articles" block
	it('renders nothing when there is no sibling document', async () => {
		const html = await container.renderToString(MoreDocuments, {
			props: {},
		})
		expect(html).not.toContain('more-documents')
	})
})

// the legacy order puts the copyright above the columns; the column count only changes the layout,
// so content is checked independently of a site.yaml value
describe('SiteFooter', () => {
	const promo = footerPromoContext('test:footer')

	it('puts the copyright above the columns', async () => {
		const html = await container.renderToString(SiteFooter, { props: { lang: 'en', promo } })
		expect(html).toContain('site-footer__copyright')
		expect(html).toContain('footer-columns')
		expect(html.indexOf('site-footer__copyright')).toBeLessThan(html.indexOf('footer-columns'))
	})

	// behaviour variants render under a test-built config with the footer overrides applied
	const withFooter = <T>(
		overrides: Partial<SiteConfig['footer']>,
		render: () => Promise<T>,
		social?: SiteConfig['social'],
	): Promise<T> => {
		const base = buildSiteConfig()
		config.site = buildSiteConfig({
			footer: { ...base.footer, ...overrides },
			social: social ?? base.social,
		})
		return render()
	}
	const PROMO_ON = { count: 6, favorites: 2, freshness: 10 }
	const ONE_SOCIAL: SiteConfig['social'] = [
		{
			id: 'github',
			href: 'https://github.com/example',
			label: { en: 'GitHub' },
			icon: 'github',
			hover: '#181717',
		},
	]
	const renderFooter = (props: Record<string, unknown> = {}) =>
		container.renderToString(SiteFooter, { props: { lang: 'en', promo, ...props } })
	const itemCount = (html: string) => html.match(/class="footer-columns__item[ "]/g)?.length ?? 0
	const label = (text: string) => new RegExp(`</span>\\s*${text}\\s*<`)

	it('stacks the menu links in their own column', async () => {
		const html = await renderFooter()
		expect(html).toContain('footer-columns__item--links')
		expect(html).toContain('footer-menu')
	})

	// footer.lang shares menu.lang's modes but is set independently
	it('renders the locale switch in the configured mode', async () => {
		const full = await withFooter({ lang: 'full' }, () => renderFooter())
		expect(full).toContain('lang-switch')
		expect(full).toMatch(label(languageName('en', 'ru')))
		// an English page names languages in English, Cyrillic stays out of the switcher
		expect(full.match(/<nav[^>]*lang-switch[\s\S]*?<\/nav>/)?.[0]).not.toMatch(
			/[\u0400-\u04ff]/,
		)
		const code = await withFooter({ lang: 'code' }, () => renderFooter())
		expect(code).toContain('lang-switch')
		expect(code).toMatch(/>\s*RU\s*</)
		// the code is the visible label; the full name stays only as the link's accessible name
		expect(code).not.toMatch(label(languageName('en', 'ru')))
		const off = await withFooter({ lang: 'off' }, () => renderFooter())
		expect(off).not.toContain('lang-switch')
		expect(off).toContain('footer-menu')
	})

	// a language-neutral page (`/rights/`, `/status/`) has no counterpart to switch to
	it('drops the locale switch on a language-neutral page whatever the mode', async () => {
		for (const lang of ['full', 'code'] as const) {
			const html = await withFooter({ lang }, () => renderFooter({ localeNeutral: true }))
			expect(html).not.toContain('lang-switch')
			expect(html).toContain('footer-menu')
		}
	})

	it('footer.social off removes the footer icons but keeps the quote column', async () => {
		const html = await withFooter(
			{ quote: 'on', social: 'off' },
			() => renderFooter(),
			ONE_SOCIAL,
		)
		expect(html).not.toContain('social-icons')
		expect(html).toContain('footer-quote')
		const on = await withFooter({ social: 'on' }, () => renderFooter(), ONE_SOCIAL)
		expect(on).toContain('social-icons')
	})

	it('drops the first column when the quote is off and the shared social list is empty', async () => {
		const html = await withFooter(
			{ columns: 3, quote: 'off', social: 'on', recentWorks: 'off' },
			() => renderFooter(),
			[],
		)
		expect(html).not.toContain('social-icons')
		expect(itemCount(html)).toBe(1)
	})

	// a disabled or empty column is not rendered and the layout shrinks to the visible columns
	it('never leaves an empty column at any configured count', async () => {
		for (const columns of [1, 2, 3] as const) {
			const onlyMenu = await withFooter(
				{ columns, quote: 'off', social: 'off', recentWorks: 'off' },
				() => renderFooter(),
			)
			expect(itemCount(onlyMenu)).toBe(1)
			expect(onlyMenu).toContain('footer-columns--1')
			expect(onlyMenu).toContain('footer-columns__item--links')

			const menuAndPromo = await withFooter(
				{ columns, quote: 'off', social: 'off', recentWorks: PROMO_ON },
				() => renderFooter(),
			)
			expect(itemCount(menuAndPromo)).toBe(2)
			expect(menuAndPromo).toContain(`footer-columns--${Math.min(columns, 2)}`)
			expect(menuAndPromo.indexOf('footer-columns__item--links')).toBeLessThan(
				menuAndPromo.indexOf('footer-recent'),
			)

			// promo is on but the page already showed every photo, so the empty promo column shrinks too
			const exhaustedPromo = await withFooter(
				{ columns, quote: 'on', social: 'on', recentWorks: PROMO_ON },
				() => renderFooter({ promo: footerPromoContext('test:all', allPhotoIds) }),
				ONE_SOCIAL,
			)
			expect(exhaustedPromo).not.toContain('footer-recent')
			expect(itemCount(exhaustedPromo)).toBe(2)
			expect(exhaustedPromo).toContain(`footer-columns--${Math.min(columns, 2)}`)
		}
	})

	it('projects the configured column count into the layout modifier when every column shows', async () => {
		for (const columns of [1, 2, 3] as const) {
			const html = await withFooter(
				{ columns, quote: 'on', social: 'on', recentWorks: PROMO_ON },
				() => renderFooter(),
				ONE_SOCIAL,
			)
			expect(itemCount(html)).toBe(3)
			expect(html).toContain(`footer-columns--${columns}`)
		}
	})

	// photos the page already showed never reach the footer; if all are excluded the promo column is
	// not rendered. The ids come from the demo's photos, not a live collection
	it('never shows photos the page already showed and hides an empty promo column', async () => {
		const shown = allPhotoIds.slice(0, 3)
		const html = await withFooter({ recentWorks: PROMO_ON }, () =>
			renderFooter({ promo: footerPromoContext('test:shown', shown) }),
		)
		expect(html).toContain('footer-recent')
		for (const id of shown) expect(html).not.toContain(`/${id}/"`)
		const rest = allPhotoIds.filter((id) => !shown.includes(id))
		expect(rest.some((id) => html.includes(`/${id}/"`))).toBe(true)

		const empty = await withFooter({ recentWorks: PROMO_ON }, () =>
			renderFooter({ lang: 'ru', promo: footerPromoContext('test:all', allPhotoIds) }),
		)
		expect(empty).not.toContain('footer-recent')
		expect(empty).toContain('footer-menu')
	})

	it('links promo photos to a localized photo route and names the section', async () => {
		const html = await withFooter({ recentWorks: PROMO_ON }, () => renderFooter({ lang: 'ru' }))
		const albumIds = albums.map((album) => album.id).join('|')
		expect(html).toMatch(
			new RegExp(
				`class="footer-recent__link" href="/ru/portfolio/(${albumIds})/[a-z0-9-]+/"`,
			),
		)
		expect(html).toContain(`aria-label="${useTranslations('ru')('footer.recentWorks')}"`)
	})
})
