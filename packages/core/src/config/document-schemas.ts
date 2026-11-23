import { z } from 'astro/zod'

import { CARD_PRESENTATIONS } from './variants.ts'

// the document settings shared by the core's sections and the modules' own (a module's `modules.<id>`
// section reuses them), kept apart from site-schema.ts so a module manifest can import them without a
// cycle through the module registry

// `newest` sorts by publishedAt descending and `title` alphabetically; the legacy `modified` order is
// meaningless in a static build
export const articlesOrderSchema = z.enum(['newest', 'title'])

const moreDocsLayoutSchema = z.enum(['grid', 'masonry', 'list'])
export const moreDocsConfigSchema = z
	.object({
		source: z.enum(['siblings', 'off']),
		layout: moreDocsLayoutSchema,
		width: z.enum(['prose', 'medium', 'wide']),
		heading: z.enum(['on', 'off']),
		media: z.enum(['on', 'off']),
		excerpt: z.enum(['on', 'off']),
		// the same card looks as `portfolio.card` (variants.ts)
		card: z.enum(CARD_PRESENTATIONS),
		ratio: z.enum(['pano', 'vista', 'landscape', 'square', 'portrait', 'original']).optional(),
		columns: z.number().int().positive().optional(),
		// gap between cards in px; like columns, only for grid and masonry
		gap: z.number().int().min(0).max(64).optional(),
		order: z.enum(['newest', 'title']).optional(),
		limit: z.union([z.number().int().positive(), z.literal('all')]).optional(),
	})
	.strict()
	.superRefine((value, context) => {
		const issue = (path: string, message: string) =>
			context.addIssue({ code: 'custom', path: [path], message })
		if (value.source === 'siblings' && (!value.order || value.limit === undefined)) {
			issue('source', 'siblings source requires order and limit')
		}
		if (value.source === 'off' && (value.order || value.limit !== undefined)) {
			issue('source', 'off source forbids order and limit')
		}
		if (value.layout === 'list' && value.columns !== undefined)
			issue('columns', 'list forbids columns')
		if (value.layout !== 'list' && value.columns === undefined)
			issue('columns', 'grid and masonry require columns')
		if (value.layout === 'list' && value.gap !== undefined) issue('gap', 'list forbids gap')
		if (value.layout !== 'list' && value.gap === undefined)
			issue('gap', 'grid and masonry require gap')
		if (value.media === 'on' && !value.ratio) issue('ratio', 'media on requires ratio')
		if (value.media === 'off' && value.ratio) issue('ratio', 'media off forbids ratio')
		if (value.layout === 'masonry' && value.ratio !== 'original')
			issue('ratio', 'masonry requires original ratio')
		if (value.layout !== 'masonry' && value.ratio === 'original')
			issue('ratio', 'only masonry supports original ratio')
		// a compact card puts the title over the image or in a strip under it: a list row (thumbnail left,
		// text right) cannot take that look, a compact card has no excerpt and is empty without media, so
		// contradictory combinations are rejected rather than silently ignored
		if (value.card !== 'details') {
			if (value.layout === 'list')
				issue('card', 'compact presentations require grid or masonry')
			if (value.excerpt === 'on') issue('card', 'compact presentations require excerpt: off')
			if (value.media === 'off') issue('card', 'compact presentations require media: on')
		}
	})

// any tier of the ADR-0008 ladder: prose for reading, medium for documents, standard (1200) for card
// indexes, which hold cards rather than running text so the prose readability cap does not apply
// (ADR-0008 addendum of 2026-09-09), and gallery for photos. standard is also the base layout default
// for pages with no width assigned
export const surfaceWidthSchema = z.enum(['prose', 'medium', 'standard', 'gallery'])

// how a surface lays out its collection. It is independent of width, so the schema does not tie a kind
// to a width, but each surface accepts only the kinds it implements, as with `portfolio.layout` and
// `album.layout`: the config must not accept a value the runtime silently ignores. Photo grids follow
// the photos' geometry, while document sections lay out cards or a list from the same model
export const documentSurfaceKindSchema = z.enum(['grid', 'masonry', 'list'])

// `ratio` is the card preview frame, with the same set and rules as moreDocs: masonry takes only
// `original` (the cover's natural height), grid and list a fixed frame. Without a fixed frame a card
// with no cover would collapse its placeholder to its own height
type DocumentSurfaceDefaults = {
	width: z.infer<typeof surfaceWidthSchema>
	kind: z.infer<typeof documentSurfaceKindSchema>
	ratio: 'pano' | 'vista' | 'landscape' | 'square' | 'portrait' | 'original'
}
export const documentSurfaceSchema = (defaults: DocumentSurfaceDefaults) =>
	z
		.object({
			width: surfaceWidthSchema.default(defaults.width),
			kind: documentSurfaceKindSchema.default(defaults.kind),
			ratio: z
				.enum(['pano', 'vista', 'landscape', 'square', 'portrait', 'original'])
				.default(defaults.ratio),
		})
		.strict()
		.superRefine((value, context) => {
			const masonry = value.kind === 'masonry'
			if (masonry !== (value.ratio === 'original')) {
				context.addIssue({
					code: 'custom',
					path: ['ratio'],
					message: masonry
						? 'masonry requires original ratio'
						: 'only masonry supports original ratio',
				})
			}
		})
		.prefault({})

export type ArticlesOrder = z.infer<typeof articlesOrderSchema>
export type MoreDocumentsConfig = z.infer<typeof moreDocsConfigSchema>
// includes the default `standard`
export type ContentWidth = z.infer<typeof surfaceWidthSchema>
export type DocumentSurfaceKind = z.infer<typeof documentSurfaceKindSchema>
