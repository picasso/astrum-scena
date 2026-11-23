import { type CollectionEntry, getCollection } from 'astro:content'

import type { SiteConfig } from '../../config/site-schema.ts'
import {
	collectPublishedDocuments,
	type DocumentEntry,
	documentStaticPaths,
	documentUnlisted,
	findPublishedDocument,
	orderByPublishedAt,
	type PublishedDocument,
	selectListableDocuments,
} from './documents.ts'
import type { Locale } from './schemas.ts'

// the single place that loads the core's document collections (articles, pages such as `about`) and
// resolves publication, so locale pages stay thin; the courses module loads its own collection the same
// way (modules/courses/build-data.ts). Fail-closed: getStaticPaths emits only published slugs and the
// resolver throws on a draft or a forged slug, so such a route 404s

export type ArticleEntry = CollectionEntry<'articles'>
export type PageEntry = CollectionEntry<'pages'>

export type ContentSiteConfig = Pick<SiteConfig, 'content'>

export async function loadPublishedArticles(
	config: ContentSiteConfig,
): Promise<PublishedDocument<ArticleEntry>[]> {
	return orderByPublishedAt(
		collectPublishedDocuments(await getCollection('articles'), config.content),
		config.content.referenceLocale,
	)
}

export async function loadPublishedPages(
	config: ContentSiteConfig,
): Promise<PublishedDocument<PageEntry>[]> {
	return collectPublishedDocuments(
		await getCollection('pages'),
		config.content,
		(data) => data.slug !== 'home',
	)
}

// published minus `unlisted` (ADR-0010), for index pages only: document routes come from
// `loadPublished*`/`documentStaticPaths`, so an unlisted document stays reachable by direct link
export async function loadListableArticles(
	config: ContentSiteConfig,
): Promise<PublishedDocument<ArticleEntry>[]> {
	return selectListableDocuments(
		await loadPublishedArticles(config),
		config.content.referenceLocale,
	)
}

// for `/{locale}/articles/{slug}/`
export async function articleStaticPaths(
	config: ContentSiteConfig,
): Promise<{ params: { slug: string } }[]> {
	return documentStaticPaths(await loadPublishedArticles(config))
}

// getStaticPaths for `/{locale}/{slug}/`. Serves every published generic page including `about`.
// `contacts` keeps its own dedicated route (custom form layout, not a content page) and `home` is the
// index route, so neither collides with this dynamic path.
export async function pageStaticPaths(
	config: ContentSiteConfig,
): Promise<{ params: { slug: string } }[]> {
	return documentStaticPaths(await loadPublishedPages(config))
}

export function resolvePublished<E extends DocumentEntry>(
	documents: readonly PublishedDocument<E>[],
	slug: string,
	locale: Locale,
	family: string,
): E {
	const document = findPublishedDocument(documents, slug)
	if (!document) throw new Error(`no published ${family} "${slug}"`)
	return document.byLocale[locale]
}

export async function resolvePublishedArticle(
	slug: string,
	locale: Locale,
	config: ContentSiteConfig,
): Promise<ArticleEntry> {
	return resolvePublished(await loadPublishedArticles(config), slug, locale, 'article')
}

// generic pages receive a flat published route
export async function resolvePublishedPage(
	slug: string,
	locale: Locale,
	config: ContentSiteConfig,
): Promise<PageEntry> {
	return resolvePublished(await loadPublishedPages(config), slug, locale, 'page')
}

const RESOLVE_PUBLISHED = {
	article: resolvePublishedArticle,
	page: resolvePublishedPage,
}

// `unlisted` is a reference-locale field (ADR-0010/0013): every locale of an unlisted document keeps
// its route but opts out of indexing
export async function isUnlistedDocument(
	family: keyof typeof RESOLVE_PUBLISHED,
	slug: string,
	config: ContentSiteConfig,
): Promise<boolean> {
	const reference = await RESOLVE_PUBLISHED[family](slug, config.content.referenceLocale, config)
	return documentUnlisted(reference.data)
}
