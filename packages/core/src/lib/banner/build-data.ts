import { getCollection } from 'astro:content'

import { siteRoot } from '../../config/site-root.ts'
import type { SiteConfig } from '../../config/site-schema.ts'
import { isCollectionDefined } from '../../modules/registry.ts'
import type { DocumentData } from '../content/documents.ts'
import type { Locale } from '../content/schemas.ts'
import { type ImageCatalog, loadImageCatalog } from '../images/catalog.ts'
import { resolvePhotoAlt } from '../portfolio/locale.ts'
import { indexById, type PhotoEntry } from '../portfolio/publication.ts'
import { resolveSurfaceMedia } from '../portfolio/surface.ts'
import {
	type BannerDocumentCollection,
	type BannerModel,
	type BannerTarget,
	listSurfaceBannerAssignments,
	selectBannerAccent,
	selectBannerPhotoId,
	surfaceBanners,
} from './select.ts'

// an unknown, draft or `hero`-less photo id fails the build rather than fall back to a text header,
// otherwise a typo would ship unnoticed; document covers live in the document itself (ADR-0013)

type AccentConfig = { topSection: Pick<SiteConfig['topSection'], 'accent'> }

export type BannerSiteConfig = Pick<SiteConfig, 'banners' | 'content' | 'modules'> & AccentConfig

function describeTarget(target: BannerTarget): string {
	if (target.kind === 'album') return 'album'
	if (target.kind === 'surface') return `surface "${target.surface}"`
	return `document "${target.collection}/${target.translationKey}"`
}

// albums and documents pass their own cover
export function buildBanner(
	catalog: ImageCatalog,
	photo: PhotoEntry,
	locale: Locale,
	target: BannerTarget,
	config: AccentConfig,
): BannerModel {
	return {
		media: resolveSurfaceMedia(catalog.manifest, photo.id, 'bannerHero'),
		originBase: catalog.originBase,
		alt: resolvePhotoAlt(photo.data, locale),
		accent: selectBannerAccent(config.topSection.accent, target),
	}
}

// an album banner is its content cover, not a config assignment
export function resolveAlbumBanner(
	catalog: ImageCatalog,
	cover: PhotoEntry,
	locale: Locale,
	config: AccentConfig,
): BannerModel {
	return buildBanner(catalog, cover, locale, { kind: 'album' }, config)
}

// an unknown id or a draft photo fails the build; document cards reuse it because a document cover
// (`coverId`) is also its banner
export function requirePublishedPhoto(
	photosById: ReadonlyMap<string, PhotoEntry>,
	photoId: string,
	target: BannerTarget,
): PhotoEntry {
	const photo = photosById.get(photoId)
	if (!photo) {
		throw new Error(
			`banner for ${describeTarget(target)} references unknown photo "${photoId}"`,
		)
	}
	if (photo.data.status !== 'published') {
		throw new Error(`banner for ${describeTarget(target)} references draft photo "${photoId}"`)
	}
	return photo
}

type DocumentCollection = BannerDocumentCollection
type DocumentCover = { collection: DocumentCollection; translationKey: string; coverId: string }

// only the reference-locale entry carries `coverId` (a Tier-1 field, ADR-0013), so it alone is
// enough for the media checks
function collectDocumentCovers(
	collection: DocumentCollection,
	entries: readonly { data: DocumentData }[],
	referenceLocale: Locale,
): DocumentCover[] {
	const covers: DocumentCover[] = []
	for (const entry of entries) {
		if (entry.data.locale !== referenceLocale) continue
		if (entry.data.status !== 'published') continue
		if (!entry.data.coverId) continue
		covers.push({
			collection,
			translationKey: entry.data.translationKey,
			coverId: entry.data.coverId,
		})
	}
	return covers
}

function findDocumentCover(
	covers: readonly DocumentCover[],
	collection: DocumentCollection,
	translationKey: string,
): string | undefined {
	return covers.find(
		(cover) => cover.collection === collection && cover.translationKey === translationKey,
	)?.coverId
}

// checks the WHOLE surface assignment map plus the covers of all published documents, not only the
// target a page asked for: a stale assignment (a removed document, a cover without the role) has no
// consumer, so on its own it would silently degrade to a text header. The verdict is kept per `banners`
// object and reference locale: a build checks once, while a different input is still checked.
const assignmentsChecked = new WeakMap<SiteConfig['banners'], Map<Locale, Promise<void>>>()

// a disabled module has no collection to read
const documentEntries = async (
	collection: DocumentCollection,
	config: Pick<SiteConfig, 'modules'>,
): Promise<readonly { data: DocumentData }[]> =>
	isCollectionDefined(config, collection) ? getCollection(collection) : []

export function assertBannerAssignments(
	config: Pick<SiteConfig, 'banners' | 'content' | 'modules'>,
): Promise<void> {
	const { referenceLocale } = config.content
	let byLocale = assignmentsChecked.get(config.banners)
	if (!byLocale) {
		byLocale = new Map()
		assignmentsChecked.set(config.banners, byLocale)
	}
	const cached = byLocale.get(referenceLocale)
	if (cached) return cached
	const checked = (async () => {
		const [photos, articles, pages, courses] = await Promise.all([
			getCollection('photos'),
			documentEntries('articles', config),
			documentEntries('pages', config),
			documentEntries('courses', config),
		])

		const photosById = indexById(photos)
		const { manifest } = loadImageCatalog(siteRoot)

		for (const { target, photoId } of listSurfaceBannerAssignments(surfaceBanners(config))) {
			requirePublishedPhoto(photosById, photoId, target)
			resolveSurfaceMedia(manifest, photoId, 'bannerHero')
		}

		// a document cover also feeds the index card (`documentCard`); checking it here keeps the
		// index from failing later than the document page itself
		const covers = [
			...collectDocumentCovers('articles', articles, referenceLocale),
			...collectDocumentCovers('pages', pages, referenceLocale),
			...collectDocumentCovers('courses', courses, referenceLocale),
		]
		for (const cover of covers) {
			const target: BannerTarget = {
				kind: 'document',
				collection: cover.collection,
				translationKey: cover.translationKey,
			}
			requirePublishedPhoto(photosById, cover.coverId, target)
			resolveSurfaceMedia(manifest, cover.coverId, 'bannerHero')
			resolveSurfaceMedia(manifest, cover.coverId, 'documentCard')
		}
	})()
	byLocale.set(referenceLocale, checked)
	return checked
}

// inner surfaces use the assignment map, documents use the reference-locale `coverId`; undefined
// means no cover, and the surface renders a text header
export async function resolveBanner(
	target: BannerTarget,
	locale: Locale,
	config: BannerSiteConfig,
): Promise<BannerModel | undefined> {
	await assertBannerAssignments(config)

	let photoId: string | undefined
	if (target.kind === 'document') {
		const entries = await documentEntries(target.collection, config)
		photoId = findDocumentCover(
			collectDocumentCovers(target.collection, entries, config.content.referenceLocale),
			target.collection,
			target.translationKey,
		)
	} else {
		photoId = selectBannerPhotoId(surfaceBanners(config), target)
	}
	if (!photoId) return undefined

	const photosById = indexById(await getCollection('photos'))
	const photo = requirePublishedPhoto(photosById, photoId, target)
	return buildBanner(loadImageCatalog(siteRoot), photo, locale, target, config)
}
