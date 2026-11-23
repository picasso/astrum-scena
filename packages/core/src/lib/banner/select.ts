import type { BannerAccent, SiteConfig, TopSectionConfig } from '../../config/site-schema.ts'
import { enabledModules } from '../../modules/registry.ts'
import type { PhotoMedia } from '../images/media.ts'

// pure core: astro:content and the manifest stay in build-data.ts

// `album` and `document` take their image from content (album cover, reference-locale `coverId`,
// ADR-0013), not from the config; a document needs `collection` because `translationKey` is unique
// only within its collection
export type BannerTarget =
	| { kind: 'album' }
	| { kind: 'surface'; surface: string }
	| { kind: 'document'; collection: BannerDocumentCollection; translationKey: string }

// the document collections with a cover: the core's and the courses module's
export type BannerDocumentCollection = 'articles' | 'pages' | 'courses'

// photo id or `off` of every surface: the core's (`banners.surfaces`) and those of the enabled
// modules' pages, which each module takes from its own section
export type SurfaceBanners = Readonly<Record<string, string>>

export function surfaceBanners(config: Pick<SiteConfig, 'banners' | 'modules'>): SurfaceBanners {
	const modules = config.modules as Readonly<Record<string, unknown>>
	return Object.assign(
		{},
		config.banners.surfaces,
		...enabledModules(config).map(
			(module) =>
				(module.surfaceBanners as ((section: unknown) => SurfaceBanners) | undefined)?.(
					modules[module.id],
				) ?? {},
		),
	)
}

export type BannerModel = {
	media: PhotoMedia
	originBase: string
	alt: string
	accent: BannerAccent
}

// feeds the whole-config check: the resolver touches only the targets a page asks for, so a stray
// assignment would go unnoticed and its surface would quietly render a text header
export function listSurfaceBannerAssignments(
	surfaces: SurfaceBanners,
): { target: BannerTarget; photoId: string }[] {
	return Object.entries(surfaces).flatMap(([surface, photoId]) =>
		photoId === 'off' ? [] : [{ target: { kind: 'surface' as const, surface }, photoId }],
	)
}

// undefined means a text header; album and document covers come from content, never from here. A
// surface no section declares is a core bug, so it fails instead of quietly rendering a text header
export function selectBannerPhotoId(
	surfaces: SurfaceBanners,
	target: BannerTarget,
): string | undefined {
	if (target.kind !== 'surface') return undefined
	const assigned = surfaces[target.surface]
	if (assigned === undefined) throw new Error(`no banner surface "${target.surface}"`)
	return assigned === 'off' ? undefined : assigned
}

export function selectBannerAccent(
	accent: TopSectionConfig['accent'],
	target: BannerTarget,
): BannerAccent {
	return target.kind === 'album' ? accent.album : accent.section
}
