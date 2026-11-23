import type { ArticlesOrder } from '../../config/document-schemas.ts'
import {
	documentCourseStatus,
	type DocumentEntry,
	orderDocuments,
	type PublishedDocument,
} from '../../lib/content/documents.ts'
import type { Locale } from '../../lib/content/schemas.ts'

// same `order` as articles (undated courses sort last under `newest`); `currentFirst: on` moves
// current courses ahead while keeping that order inside each group
export function orderCourses<E extends DocumentEntry>(
	documents: readonly PublishedDocument<E>[],
	config: { order: ArticlesOrder; currentFirst: 'on' | 'off' },
	locale: Locale,
	referenceLocale: Locale,
): PublishedDocument<E>[] {
	const ordered = orderDocuments(documents, config.order, locale, referenceLocale)
	if (config.currentFirst === 'off') return ordered
	const isCurrent = (document: PublishedDocument<E>) =>
		documentCourseStatus(document.byLocale[referenceLocale].data) === 'current'
	return [...ordered.filter(isCurrent), ...ordered.filter((document) => !isCurrent(document))]
}
