import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parse as parseYaml } from 'yaml'

import { loadImageSets } from '../packages/core/src/lib/blocks/gallery/image-sets.ts'
import type { GalleryProps } from '../packages/core/src/lib/blocks/gallery/schema.ts'
import {
	collectPublishedDocuments,
	documentCourseStatus,
	documentIn,
	documentUnlisted,
} from '../packages/core/src/lib/content/documents.ts'
import { loadContentSnapshot } from '../packages/core/src/lib/content/files.ts'
import {
	albumHref,
	articleHref,
	pageHref,
	photoHref,
} from '../packages/core/src/lib/content/routes.ts'
import type { PhotoData } from '../packages/core/src/lib/content/schemas.ts'
import {
	imageUrlBase,
	loadImagePublicConfig,
} from '../packages/core/src/lib/images/public-config.ts'
import { projectPhotoText } from '../packages/core/src/lib/portfolio/locale.ts'
import {
	getPublishedAlbums,
	indexById,
	resolveAlbumPhotos,
} from '../packages/core/src/lib/portfolio/publication.ts'
import { courseHref } from '../packages/core/src/modules/courses/routes.ts'
import { DEMO_ROOT, demoConfig, type Lang } from './helpers.ts'

// the demo content as the core reads it: published documents with their routes, albums with their
// photos, and the public image config the pages were built with

const snapshot = await loadContentSnapshot(DEMO_ROOT)
const { content } = demoConfig

export type DemoDocument = {
	kind: 'article' | 'course' | 'page'
	slug: string
	unlisted: boolean
	courseStatus?: 'archive' | 'current'
	href: (lang: Lang) => string
}

const articles: DemoDocument[] = collectPublishedDocuments(snapshot.articles, content).map(
	(document) => ({
		kind: 'article',
		slug: document.slug,
		unlisted: documentUnlisted(documentIn(document, content.referenceLocale).data),
		href: (lang) => articleHref(document.slug, lang),
	}),
)

const courses: DemoDocument[] = collectPublishedDocuments(snapshot.courses, content).map(
	(document) => {
		const reference = documentIn(document, content.referenceLocale).data
		return {
			kind: 'course',
			slug: document.slug,
			unlisted: documentUnlisted(reference),
			courseStatus: documentCourseStatus(reference),
			href: (lang) => courseHref(document.slug, lang),
		}
	},
)

const pages: DemoDocument[] = collectPublishedDocuments(snapshot.pages, content).map(
	(document) => ({
		kind: 'page',
		slug: document.slug,
		unlisted: documentUnlisted(documentIn(document, content.referenceLocale).data),
		href: (lang) => pageHref(document.slug, lang),
	}),
)

export const documents: DemoDocument[] = [...articles, ...courses, ...pages]

export function firstDocument(
	kind: DemoDocument['kind'],
	match: (document: DemoDocument) => boolean = () => true,
): DemoDocument {
	const document = documents.find((entry) => entry.kind === kind && match(entry))
	if (!document) throw new Error(`the demo content has no matching published ${kind}`)
	return document
}

// courses that exist only as drafts: their reference entry is a draft
export const draftCourseSlugs: string[] = snapshot.courses
	.filter(
		(entry) => entry.data.locale === content.referenceLocale && entry.data.status === 'draft',
	)
	.map((entry) => entry.data.slug)

export type DemoAlbum = {
	id: string
	href: (lang: Lang) => string
	photos: { id: string; data: PhotoData; href: (lang: Lang) => string }[]
}

const photosById = indexById(snapshot.photos)

export const albums: DemoAlbum[] = getPublishedAlbums(snapshot.albums).map((album) => ({
	id: album.id,
	href: (lang) => albumHref(album.id, lang),
	photos: resolveAlbumPhotos(album, photosById).map((photo) => ({
		id: photo.id,
		data: photo.data,
		href: (lang) => photoHref(album.id, photo.id, lang),
	})),
}))

export function photoById(id: string): PhotoData {
	const photo = photosById.get(id)
	if (!photo) throw new Error(`the demo content has no photo "${id}"`)
	return photo.data
}

// every viewer slide has a caption: the localized caption, else the title
export function viewerCaption(photo: PhotoData, lang: Lang): string {
	const text = projectPhotoText(photo, lang)
	return text.caption ?? text.title
}

export const imagePublicConfig = loadImagePublicConfig(DEMO_ROOT).config

// the photo id is the first path segment after the image base (`<base>/<photoId>/<width>w-…`),
// whether the base is an origin or a path of the site
export function photoIdOfImage(src: string): string {
	const base = new URL(`${imageUrlBase(imagePublicConfig).replace(/\/+$/, '')}/`, src).href
	if (!src.startsWith(base)) throw new Error(`${src} is not served from the image base ${base}`)
	return src.slice(base.length).split('/')[0]!
}

const imageSets = await loadImageSets(DEMO_ROOT)

// the published entry of a document in one locale, frontmatter as the core parses it
function documentEntry(collection: 'articles' | 'pages' | 'courses', slug: string, lang: Lang) {
	const entry = snapshot[collection].find(
		(item) => item.data.slug === slug && item.data.locale === lang,
	)
	if (!entry) throw new Error(`the demo content has no ${collection} entry "${slug}" in ${lang}`)
	return entry
}

export function pageData(slug: string, lang: Lang) {
	return documentEntry('pages', slug, lang).data
}

export function courseData(slug: string, lang: Lang) {
	return documentEntry('courses', slug, lang).data
}

const COLLECTION_OF_KIND = { article: 'articles', course: 'courses', page: 'pages' } as const

// a published document of the demo by kind and slug, with its title in one locale
export function documentByKind(kind: DemoDocument['kind'], slug: string, lang: Lang) {
	const document = documents.find((entry) => entry.kind === kind && entry.slug === slug)
	if (!document) throw new Error(`the demo content has no published ${kind} "${slug}"`)
	return {
		href: document.href(lang),
		title: documentEntry(COLLECTION_OF_KIND[kind], slug, lang).data.title,
	}
}

// `name="text"` or `name={literal}` with balanced braces
function jsxAttributes(text: string): Record<string, unknown> {
	const props: Record<string, unknown> = {}
	let index = 0
	const fail = () => {
		throw new Error(`cannot read the JSX attributes at "${text.slice(index, index + 40)}"`)
	}
	while (index < text.length) {
		if (/\s/.test(text[index]!)) {
			index += 1
			continue
		}
		const name = /^(\w+)=/.exec(text.slice(index))
		if (!name) fail()
		index += name![0].length
		if (text[index] === '"') {
			const end = text.indexOf('"', index + 1)
			if (end < 0) fail()
			props[name![1]!] = text.slice(index + 1, end)
			index = end + 1
		} else if (text[index] === '{') {
			let depth = 0
			const start = index
			do {
				if (text[index] === '{') depth += 1
				else if (text[index] === '}') depth -= 1
				index += 1
			} while (depth > 0 && index < text.length)
			if (depth > 0) fail()
			props[name![1]!] = parseYaml(text.slice(start + 1, index - 1))
		} else fail()
	}
	return props
}

export type BlockUse = { component: string; props: Record<string, unknown> }

// the typed blocks of an MDX page as authored, each under the nearest `data-testid` before it, so a
// spec reads a block's props from the page it opens. Attribute values are a string or a JS literal
// (number, boolean, array of plain objects), which YAML flow syntax parses
export function pageBlocks(slug: string, lang: Lang): Map<string, BlockUse> {
	const { translationKey } = pageData(slug, lang)
	const source = readFileSync(
		path.join(DEMO_ROOT, 'src/content/pages', `${translationKey}.${lang}.mdx`),
		'utf8',
	)
	const blocks = new Map<string, BlockUse>()
	let testId: string | undefined
	for (const match of source.matchAll(
		/data-testid="([^"]+)"|<([A-Z][A-Za-z]*)\b([\s\S]*?)\/>/g,
	)) {
		if (match[1]) {
			testId = match[1]
			continue
		}
		if (!testId)
			throw new Error(`<${match[2]}> in ${slug}.${lang}.mdx has no test id before it`)
		blocks.set(testId, { component: match[2]!, props: jsxAttributes(match[3]!) })
	}
	return blocks
}

// the photo ids a Gallery draws from, by its top-priority source as the core resolves it
export function galleryPool(props: GalleryProps): string[] {
	const published = new Set(
		snapshot.photos
			.filter((photo) => photo.data.status === 'published')
			.map((photo) => photo.id),
	)
	let ids: string[]
	if (props.imageSetId) {
		const set = imageSets[props.imageSetId]
		if (!set) throw new Error(`the demo has no image set "${props.imageSetId}"`)
		ids = [
			...new Set([
				...(set.albumIds ?? []).flatMap(
					(id) =>
						albums.find((album) => album.id === id)?.photos.map((photo) => photo.id) ??
						[],
				),
				...(set.photoIds ?? []),
			]),
		]
	} else if (props.albumId) {
		const album = albums.find((entry) => entry.id === props.albumId)
		if (!album) throw new Error(`the demo has no published album "${props.albumId}"`)
		ids = album.photos.map((photo) => photo.id)
	} else {
		ids = (props.images ?? []).map((image) => image.imageId)
	}
	return ids.filter((id) => published.has(id) && !props.exclude.includes(id))
}

// the demo page that shows the image blocks and the `page` MoreDocuments slot
export const blocksPage = firstDocument('page', (document) => document.slug === 'blocks')
