import { isMap, parseDocument } from 'yaml'

import { LOCALE_FILE_PATTERN } from '../../config/locale-schema.ts'
import { SHA256_HEX_PATTERN } from '../../config/sha256-schema.ts'
import { courseSchema } from '../../modules/courses/schema.ts'
import type { DocumentData } from './documents.ts'
import { articleSchema, type Locale, pageSchema } from './schemas.ts'
import { digestTranslationSource } from './translation-freshness.ts'

const DOCUMENT_SCHEMAS = { articles: articleSchema, pages: pageSchema, courses: courseSchema }

// writer of the `translatedFromDigest` marker. Pure layer: no fs, prettier or CLI (those live in the
// `astrum-scena content translation-marker` commands); it only parses locales/pairs and surgically
// changes one frontmatter scalar of a translation document, keeping the body byte-for-byte and
// authored text intact

// `courses` is the courses module's collection
export type DocumentCollection = 'articles' | 'pages' | 'courses'

export type ParsedDocumentFile = {
	collection: DocumentCollection
	filename: string
	translationKey: string
	locale: Locale
	data: DocumentData
	// the digest source when this is the reference-locale document
	body: string
	// input for the surgical insert and prettier
	raw: string
	marker: string | undefined
}

// parses one localized file. translationKey/locale come FROM the frontmatter (schema-validated), and
// the filename must agree with them — otherwise fail-closed (never mark the wrong pair).
export function parseDocumentFile(input: {
	collection: DocumentCollection
	filename: string
	raw: string
}): ParsedDocumentFile {
	const match = LOCALE_FILE_PATTERN.exec(input.filename)
	if (!match) throw new Error(`invalid localized filename: ${input.filename}`)
	const [, fileKey, fileLocale] = match

	const normalized = input.raw.replace(/\r\n?/g, '\n')
	if (!normalized.startsWith('---\n')) {
		throw new Error(`${input.filename}: entry must start with frontmatter`)
	}
	const end = normalized.indexOf('\n---\n', 4)
	if (end < 0) throw new Error(`${input.filename}: no closing frontmatter delimiter`)
	const frontmatterDoc = parseDocument(normalized.slice(4, end))
	if (frontmatterDoc.errors.length > 0) {
		throw new Error(`${input.filename}: ${frontmatterDoc.errors[0]!.message}`)
	}
	const schema = DOCUMENT_SCHEMAS[input.collection]
	const data = schema.parse(frontmatterDoc.toJS() ?? {}) as DocumentData

	if (data.translationKey !== fileKey || data.locale !== fileLocale) {
		throw new Error(
			`${input.filename}: frontmatter (${data.translationKey}/${data.locale}) does not match filename (${fileKey}/${fileLocale})`,
		)
	}
	return {
		collection: input.collection,
		filename: input.filename,
		translationKey: data.translationKey,
		locale: data.locale,
		data,
		body: normalized.slice(end + 5),
		raw: input.raw,
		marker: data.translatedFromDigest,
	}
}

// a reference-locale document and one of its translations; a one-locale site has no pairs
export type DocumentPair = {
	collection: DocumentCollection
	translationKey: string
	reference: ParsedDocumentFile
	translation: ParsedDocumentFile
}

// one pair per non-reference active locale the document has. A duplicate or inactive locale fails
// closed, and so does a missing one of a published document, as the content gate does: the whole set
// must be valid before anything is written. A draft not yet translated has no pair for its missing
// locales, and none at all without its reference locale
export function buildDocumentPairs(
	files: readonly ParsedDocumentFile[],
	content: { locales: readonly Locale[]; referenceLocale: Locale },
): DocumentPair[] {
	const translationLocales = content.locales.filter(
		(locale) => locale !== content.referenceLocale,
	)
	const groups = new Map<string, Map<Locale, ParsedDocumentFile>>()
	for (const file of files) {
		const key = `${file.collection}/${file.translationKey}`
		let byLocale = groups.get(key)
		if (!byLocale) {
			byLocale = new Map()
			groups.set(key, byLocale)
		}
		if (byLocale.has(file.locale)) {
			throw new Error(`duplicate locale "${file.locale}" for document "${key}"`)
		}
		if (!content.locales.includes(file.locale)) {
			throw new Error(`document "${key}" has the inactive locale "${file.locale}"`)
		}
		byLocale.set(file.locale, file)
	}

	const pairs: DocumentPair[] = []
	for (const [key, byLocale] of groups) {
		const missing = content.locales.find((locale) => !byLocale.has(locale))
		const published = [...byLocale.values()].some((file) => file.data.status === 'published')
		if (missing && published)
			throw new Error(`document "${key}" is missing the "${missing}" locale`)
		const reference = byLocale.get(content.referenceLocale)
		if (!reference) continue
		if (reference.marker !== undefined) {
			throw new Error(
				`${reference.filename}: translatedFromDigest is not allowed on the reference locale "${content.referenceLocale}"`,
			)
		}
		for (const locale of translationLocales.filter((locale) => byLocale.has(locale))) {
			pairs.push({
				collection: reference.collection,
				translationKey: reference.translationKey,
				reference,
				translation: byLocale.get(locale)!,
			})
		}
	}
	return pairs.sort((left, right) =>
		`${left.collection}/${left.translationKey}/${left.translation.locale}`.localeCompare(
			`${right.collection}/${right.translationKey}/${right.translation.locale}`,
		),
	)
}

// inserts or refreshes `translatedFromDigest` in the frontmatter of a translation file; a new scalar goes last,
// the body stays byte-identical, and an already current value returns the original bytes. The CLI
// canonicalizes the result with prettier.
export function confirmTranslatedFromDigest(raw: string, digest: string): string {
	if (!SHA256_HEX_PATTERN.test(digest)) {
		throw new Error('translatedFromDigest must be a lowercase 64-hex sha256')
	}
	const normalized = raw.replace(/\r\n?/g, '\n')
	if (!normalized.startsWith('---\n')) throw new Error('entry must start with frontmatter')
	const end = normalized.indexOf('\n---\n', 4)
	if (end < 0) throw new Error('no closing frontmatter delimiter')

	const doc = parseDocument(normalized.slice(4, end), { keepSourceTokens: true })
	if (doc.errors.length > 0) throw new Error(doc.errors[0]!.message)
	if (!isMap(doc.contents)) throw new Error('frontmatter is not a mapping')
	if (doc.get('translatedFromDigest') === digest) return raw
	doc.set('translatedFromDigest', digest)
	return `---\n${doc.toString({ lineWidth: 0 })}---\n${normalized.slice(end + 5)}`
}

// digest of the current reference body of a pair — the single source for `confirm` and `compute`.
export function pairSourceDigest(pair: DocumentPair): string {
	return digestTranslationSource(pair.reference.body)
}
