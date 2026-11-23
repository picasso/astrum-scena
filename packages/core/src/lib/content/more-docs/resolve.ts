import type { MoreDocsKind, MoreDocumentsConfig, SiteConfig } from '../../../config/site-schema.ts'
import type { UIKey } from '../../../i18n/dictionaries.ts'
import { resolveMoreDocumentCard } from '../../cards/build-data.ts'
import { documentCardSurface } from '../../cards/select.ts'
import { moreDocumentsSizes } from '../../portfolio/sizes.ts'
import {
	type DocumentEntry,
	orderDocuments,
	type PublishedDocument,
	selectListableDocuments,
} from '../documents.ts'
import type { Locale } from '../schemas.ts'
import { getMoreDocumentsKind } from './registry.ts'

export type MoreDocumentsResult = {
	heading: string
	label: string
	config: MoreDocumentsConfig
	cards: Awaited<ReturnType<typeof resolveMoreDocumentCard>>[]
}

type SelectedDocument = { document: PublishedDocument<DocumentEntry>; kind: MoreDocsKind }

type Translation = (key: UIKey) => string

export async function resolveMoreDocuments({
	kind,
	translationKey,
	slug,
	locale,
	frontmatter,
	t,
	siteConfig,
}: {
	kind: MoreDocsKind
	translationKey: string
	slug: string
	locale: Locale
	frontmatter: DocumentEntry['data']['moreDocs']
	t: Translation
	siteConfig: Pick<SiteConfig, 'moreDocs' | 'content' | 'banners' | 'modules'>
}): Promise<MoreDocumentsResult | undefined> {
	if (frontmatter === 'off') return undefined
	const current = getMoreDocumentsKind(kind)
	const config = current.config(siteConfig)
	if (config.order === 'newest' && !current.hasPublishedDate) {
		throw new Error(`MoreDocuments kind "${kind}" does not support newest order`)
	}
	let selected: readonly SelectedDocument[]
	if (frontmatter && 'docs' in frontmatter) {
		selected = await Promise.all(
			frontmatter.docs.map(async (target) => {
				const targetKind = getMoreDocumentsKind(target.kind)
				const document = (
					(await targetKind.load(
						siteConfig,
					)) as readonly PublishedDocument<DocumentEntry>[]
				).find((item) => item.slug === target.slug)
				if (!document)
					throw new Error(
						`MoreDocuments manual target "${target.kind}:${target.slug}" is not published`,
					)
				if (target.kind === kind && document.translationKey === translationKey)
					throw new Error(
						`MoreDocuments manual target "${target.kind}:${target.slug}" references itself`,
					)
				return { document, kind: target.kind }
			}),
		)
	} else if (config.source === 'siblings') {
		// an automatic list is a discovery surface, so `unlisted` is dropped as in the indexes
		// (ADR-0010); manual `docs` targets above are not, since an explicit owner link is an allowed embed
		const documents = selectListableDocuments(
			(await current.load(siteConfig)) as readonly PublishedDocument<DocumentEntry>[],
			siteConfig.content.referenceLocale,
		)
		selected = orderDocuments(
			documents.filter((item) => item.slug !== slug),
			config.order!,
			locale,
			siteConfig.content.referenceLocale,
		).map((document) => ({ document, kind }))
		if (config.limit !== 'all') selected = selected.slice(0, config.limit!)
	} else {
		return undefined
	}
	if (selected.length === 0) return undefined
	const cards = await Promise.all(
		selected.map(({ document, kind: targetKind }) => {
			const target = getMoreDocumentsKind(targetKind)
			return resolveMoreDocumentCard(document, locale, {
				href: (targetSlug) => target.href(targetSlug, locale),
				surface: documentCardSurface(config.layout),
				collection: target.collection,
				sizes: moreDocumentsSizes(config.layout, config.width, config.columns),
				includeExcerpt: config.excerpt === 'on',
				includeMedia: config.media === 'on',
				ratio: config.ratio,
				siteConfig,
			})
		}),
	)
	return { heading: t(current.headingKey), label: t(current.labelKey), config, cards }
}
