import type { Locale } from '../../../config/locale-schema.ts'
import type { MoreDocsKind, MoreDocumentsConfig, SiteConfig } from '../../../config/site-schema.ts'
import type { UIKey } from '../../../i18n/dictionaries.ts'
import { loadPublishedCourses } from '../../../modules/courses/build-data.ts'
import { coursesConfig } from '../../../modules/courses/config.ts'
import { COURSES_COLLECTION } from '../../../modules/courses/manifest.ts'
import { courseHref } from '../../../modules/courses/routes.ts'
import type { BannerDocumentCollection } from '../../banner/select.ts'
import { type ContentSiteConfig, loadPublishedArticles, loadPublishedPages } from '../build-data.ts'
import { articleHref, pageHref } from '../routes.ts'

export type MoreDocsSiteConfig = ContentSiteConfig & Pick<SiteConfig, 'moreDocs' | 'modules'>

// a kind's block: the core's under `moreDocs`, a module's in its own section
export const moreDocumentsRegistry = {
	article: {
		load: loadPublishedArticles,
		href: articleHref,
		collection: 'articles',
		config: (site) => site.moreDocs.article,
		hasPublishedDate: true,
		headingKey: 'moreDocuments.article.heading',
		labelKey: 'moreDocuments.article.label',
	},
	course: {
		load: loadPublishedCourses,
		href: courseHref,
		collection: COURSES_COLLECTION,
		config: (site) => coursesConfig(site).moreDocs,
		hasPublishedDate: false,
		headingKey: 'courses.moreDocuments.heading',
		labelKey: 'courses.moreDocuments.label',
	},
	page: {
		load: loadPublishedPages,
		href: pageHref,
		collection: 'pages',
		config: (site) => site.moreDocs.page,
		hasPublishedDate: false,
		headingKey: 'moreDocuments.page.heading',
		labelKey: 'moreDocuments.page.label',
	},
} as const satisfies Record<
	MoreDocsKind,
	{
		load: (config: MoreDocsSiteConfig) => Promise<readonly unknown[]>
		href: (slug: string, locale: Locale) => string
		collection: BannerDocumentCollection
		config: (site: MoreDocsSiteConfig) => MoreDocumentsConfig
		hasPublishedDate: boolean
		headingKey: UIKey
		labelKey: UIKey
	}
>

export function getMoreDocumentsKind(kind: string) {
	const entry = moreDocumentsRegistry[kind as MoreDocsKind]
	if (!entry) throw new Error(`unknown MoreDocuments kind "${kind}"`)
	return entry
}
