import { getCollection } from 'astro:content'

import { siteRoot } from '../../config/site-root.ts'
import type { BannerModel } from '../banner/select.ts'
import { buildSourceContext } from '../blocks/gallery/build-data.ts'
import { loadImageSets } from '../blocks/gallery/image-sets.ts'
import type { CardModel } from '../cards/select.ts'
import { extractBlockPhotoIds } from '../content/block-photos.ts'
import type { FooterPromoContext } from './footer-promo.ts'
import { indexById } from './publication.ts'

// each route passes its page key and everything it already shows to Base, so the footer never has
// to guess the context from the pathname

type Shown = string | undefined | readonly (string | undefined)[]

export function footerPromoContext(pageKey: string, ...shown: Shown[]): FooterPromoContext {
	const ids = shown.flatMap((item) => (Array.isArray(item) ? item : [item]))
	return {
		pageKey,
		excludePhotoIds: new Set(ids.filter((id): id is string => id !== undefined)),
	}
}

export function bannerPhotoId(banner: BannerModel | undefined): string | undefined {
	return banner?.media.photoId
}

export function cardPhotoIds(cards: readonly Pick<CardModel, 'photoId'>[] | undefined): string[] {
	return (cards ?? []).flatMap((card) => (card.photoId ? [card.photoId] : []))
}

// blocks exist only in `.mdx`; `.md` renders without JSX
export async function documentBlockPhotoIds(entry: {
	filePath?: string
	body?: string
}): Promise<string[]> {
	if (!entry.body || !entry.filePath?.endsWith('.mdx')) return []
	const [albums, photos, imageSets] = await Promise.all([
		getCollection('albums'),
		getCollection('photos'),
		loadImageSets(siteRoot),
	])
	const ctx = buildSourceContext({ albums, photos, photosById: indexById(photos), imageSets })
	return extractBlockPhotoIds(entry.body, ctx)
}
