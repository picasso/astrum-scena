import { z } from 'astro/zod'

import { KEBAB_CASE_PATTERN } from '../../config/kebab-case.ts'
import { type Locale, localeCodeSchema } from '../../config/locale-schema.ts'
import { type LocalizedText, localizedText } from '../../config/localized-text.ts'
import { sha256HexSchema } from '../../config/sha256-schema.ts'
import { ALBUM_LAYOUTS } from '../../config/variants.ts'

export { type Locale, localeCodeSchema, type LocalizedText, sha256HexSchema }

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/
// capture date is `YYYY` or `YYYY-MM` only: the year comes from the archive folder, and day, time
// and timezone are deliberately not recorded
const PARTIAL_CAPTURED_AT_PATTERN = /^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

function isValidIsoDate(value: string): boolean {
	if (!ISO_DATE_PATTERN.test(value)) return false
	const parsed = new Date(value)
	if (Number.isNaN(parsed.valueOf())) return false
	if (value.length === 10) return parsed.toISOString().slice(0, 10) === value
	const canonical = value.includes('.') ? value : value.replace(/Z$/, '.000Z')
	return parsed.toISOString() === canonical
}

export const statusSchema = z.enum(['draft', 'published'])
export const kebabIdSchema = z.string().regex(KEBAB_CASE_PATTERN)
// an unquoted `YYYY-MM-DD` parses to a string in the `yaml` package but to a `Date` in Astro's
// loader (js-yaml, YAML 1.1 timestamps); both normalize to one canonical string so a single schema
// serves both readers without touching the file
export const isoDateSchema = z
	.union([z.string(), z.date()])
	.superRefine((value, context) => {
		if (value instanceof Date) {
			if (Number.isNaN(value.valueOf())) {
				context.addIssue({ code: 'custom', message: 'Invalid date' })
			}
			return
		}
		if (!isValidIsoDate(value)) {
			context.addIssue({ code: 'custom', message: 'Invalid ISO date or datetime' })
		}
	})
	.transform((value) => {
		if (value instanceof Date) {
			const iso = value.toISOString()
			return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
		}
		return value.length === 10 ? value : new Date(value).toISOString()
	})
// only for the photo's `capturedAt`; `publishedAt` keeps requiring a full date or datetime
export const partialCapturedAtSchema = z
	.string()
	.regex(PARTIAL_CAPTURED_AT_PATTERN, 'capturedAt must be YYYY or YYYY-MM')

// editorial crop focus in percent (docs/blocks/gallery.md, "Focal point"), center when absent; it
// lives on the photo record rather than the generated manifest and steers every fixed-ratio crop
export const focalPointSchema = z
	.object({
		x: z.number().min(0).max(100),
		y: z.number().min(0).max(100),
	})
	.strict()

// pixel-master identity: WordPress-era content carries `legacyId`, a new master its byte `sha256`
// plus `master`, a bare basename because the resolver owns the year-organized layout under
// mastersRoot and Git content must not carry paths; at most one identity per record
export const sourceIdentityFields = {
	legacyId: z.string().min(1).optional(),
	sha256: sha256HexSchema.optional(),
	master: z
		.string()
		.min(1)
		.regex(/^[^/\\]+$/)
		.optional(),
} as const

export function refineSourceIdentity(
	value: { legacyId?: string; sha256?: string; master?: string },
	context: z.RefinementCtx,
): void {
	if (
		value.legacyId !== undefined &&
		(value.sha256 !== undefined || value.master !== undefined)
	) {
		context.addIssue({
			code: 'custom',
			message: 'legacyId is mutually exclusive with sha256/master',
			path: ['legacyId'],
		})
	}
	if ((value.sha256 !== undefined) !== (value.master !== undefined)) {
		context.addIssue({
			code: 'custom',
			message: 'sha256 and master must be provided together',
			path: [value.sha256 === undefined ? 'sha256' : 'master'],
		})
	}
}

export function sourceLegacyId(
	value: { legacyId?: string } | undefined | null,
): string | undefined {
	return value?.legacyId ?? undefined
}

// standalone parser of a master's flat identity for image CLIs (colormode/build) that read a photo's
// identity in isolation. NOT strict: it accepts the whole photo record and drops extra keys, keeping
// only `legacyId`/`sha256`/`master`; `refineSourceIdentity` still rejects a mixed/unpaired shape
// (fail-closed).
export const sourceIdentitySchema = z.object(sourceIdentityFields).superRefine(refineSourceIdentity)
export type SourceIdentity = z.infer<typeof sourceIdentitySchema>

// the identity a new master must carry; add-album's `buildNewSource` writes exactly this pair
export const newSourceSchema = z
	.object({
		sha256: sha256HexSchema,
		master: z
			.string()
			.min(1)
			.regex(/^[^/\\]+$/),
	})
	.strict()
export type NewSource = z.infer<typeof newSourceSchema>

const moreDocsTargetSchema = z
	.object({ kind: z.enum(['article', 'course', 'page']), slug: kebabIdSchema })
	.strict()

export const moreDocsFrontmatterSchema = z.union([
	z.literal('off'),
	z
		.object({ docs: z.array(moreDocsTargetSchema).min(1) })
		.strict()
		.superRefine((value, context) => {
			const seen = new Set<string>()
			for (const [index, item] of value.docs.entries()) {
				const key = `${item.kind}:${item.slug}`
				if (seen.has(key))
					context.addIssue({
						code: 'custom',
						path: ['docs', index],
						message: 'moreDocs docs must be unique',
					})
				seen.add(key)
			}
		}),
])

export const mediaDescriptorSchema = z
	.object({
		assetKey: kebabIdSchema,
		width: z.number().int().positive(),
		height: z.number().int().positive(),
		dominantColor: z.string().regex(HEX_COLOR_PATTERN),
		derivatives: z
			.object({
				widths: z.array(z.number().int().positive()).min(1),
				formats: z.array(z.enum(['avif', 'webp', 'jpg'])).min(1),
			})
			.strict(),
	})
	.strict()
	.superRefine((value, context) => {
		if (new Set(value.derivatives.widths).size !== value.derivatives.widths.length) {
			context.addIssue({
				code: 'custom',
				message: 'Derivative widths must be unique',
				path: ['derivatives', 'widths'],
			})
		}
		if (
			value.derivatives.widths.some(
				(width, index) => index > 0 && width <= value.derivatives.widths[index - 1]!,
			)
		) {
			context.addIssue({
				code: 'custom',
				message: 'Derivative widths must be strictly ascending',
				path: ['derivatives', 'widths'],
			})
		}
		if (new Set(value.derivatives.formats).size !== value.derivatives.formats.length) {
			context.addIssue({
				code: 'custom',
				message: 'Derivative formats must be unique',
				path: ['derivatives', 'formats'],
			})
		}
	})

// the localized data schemas are built from the site's `content.locales` (its lock): a text has
// exactly the active locales, so a one-locale site writes one text per field

export const photoSchemaFor = (locales: readonly Locale[]) =>
	z
		.object({
			title: localizedText(locales, { required: true }),
			description: localizedText(locales).optional(),
			caption: localizedText(locales).optional(),
			alt: localizedText(locales).optional(),
			status: statusSchema,
			placeId: kebabIdSchema.optional(),
			capturedAt: partialCapturedAtSchema.optional(),
			publishedAt: isoDateSchema.optional(),
			colorMode: z.enum(['color', 'black-and-white']).optional(),
			// the build resolver merges it with the manifest entry, which stays the source of files
			focalPoint: focalPointSchema.optional(),
			favorite: z.boolean().default(false),
			// independent visibility axis (ADR-0010): an unlisted photo is published and embeddable but
			// left out of portfolio grids (the legacy `_private` tag); no `.default`, so re-serialized
			// records do not gain `unlisted: false`
			unlisted: z.boolean().optional(),
			tags: z.array(kebabIdSchema).default([]),
			media: mediaDescriptorSchema.optional(),
			...sourceIdentityFields,
		})
		.strict()
		.superRefine((value, context) => {
			refineSourceIdentity(value, context)
			// `colorMode` is not required here: it is auto-detected from pixels when not authored and
			// must not block publication (ADR-0010/ADR-0012)
			if (value.status === 'published' && !value.publishedAt) {
				context.addIssue({
					code: 'custom',
					message: 'Published photo requires publishedAt',
					path: ['publishedAt'],
				})
			}
			if (new Set(value.tags).size !== value.tags.length) {
				context.addIssue({
					code: 'custom',
					message: 'Photo tags must be unique',
					path: ['tags'],
				})
			}
		})

export const albumSchemaFor = (locales: readonly Locale[]) =>
	z
		.object({
			category: z.enum(['series', 'places']),
			title: localizedText(locales, { required: true }),
			description: localizedText(locales),
			// card excerpt for the Portfolio index `details` mode; when absent or empty in a locale it
			// is derived from description in whole sentences, like document excerpts
			excerpt: localizedText(locales).optional(),
			// overrides the site default `album.layout`; the modes' numeric settings stay shared in
			// site.yaml instead of being copied per album
			layout: z.enum(ALBUM_LAYOUTS).optional(),
			status: statusSchema,
			coverId: kebabIdSchema,
			photoIds: z.array(kebabIdSchema).min(1),
			// see the photo's `unlisted`
			unlisted: z.boolean().optional(),
			...sourceIdentityFields,
		})
		.strict()
		.superRefine((value, context) => {
			refineSourceIdentity(value, context)
			if (new Set(value.photoIds).size !== value.photoIds.length) {
				context.addIssue({
					code: 'custom',
					message: 'Album photoIds must be unique',
					path: ['photoIds'],
				})
			}
			if (!value.photoIds.includes(value.coverId)) {
				context.addIssue({
					code: 'custom',
					message: 'Album coverId must be included in photoIds',
					path: ['coverId'],
				})
			}
		})

export const localizedDocumentBaseSchema = z
	.object({
		translationKey: kebabIdSchema,
		locale: localeCodeSchema,
		slug: kebabIdSchema,
		title: z.string().trim().min(1),
		excerpt: z.string().optional(),
		status: statusSchema,
		// an unlisted document keeps its route but is left out of indexes (ADR-0010);
		// reference-locale only (ADR-0013), which integrity enforces since a per-file schema cannot
		// see the pair
		unlisted: z.boolean().optional(),
		moreDocs: moreDocsFrontmatterSchema.optional(),
		...sourceIdentityFields,
		// a photo id whose media and alt resolve from the manifest and `photos`, as for an album
		// cover; reference-locale only (ADR-0013), enforced by integrity and banner build-data
		coverId: kebabIdSchema.optional(),
		// staleness marker on translations: sha256 of the reference-locale body at translation
		// time; integrity forbids it on the reference locale
		translatedFromDigest: sha256HexSchema.optional(),
	})
	.strict()

export const articleSchema = localizedDocumentBaseSchema
	.extend({
		publishedAt: isoDateSchema.optional(),
	})
	.strict()
	// "published needs publishedAt" is checked by pair-level integrity on the reference locale
	// (ADR-0013), because a translation file must not carry `publishedAt` at all
	.superRefine(refineSourceIdentity)

// courses are a collection of their own (src/modules/courses), not a kind of page
export const pageSchema = localizedDocumentBaseSchema
	.extend({
		// optional for pages
		publishedAt: isoDateSchema.optional(),
	})
	.strict()
	.superRefine(refineSourceIdentity)

// legal texts (`src/content/legal/<key>.<locale>.md`, e.g. the /rights/ page): rendered by their own
// route, outside [slug] routing, /status/, translation and factcheck
export const legalSchema = z.object({ title: z.string().trim().min(1) }).strict()

export const categorySchemaFor = (locales: readonly Locale[]) =>
	z
		.object({
			id: z.enum(['series', 'places']),
			label: localizedText(locales),
		})
		.strict()

export const placeSchemaFor = (locales: readonly Locale[]) =>
	z
		.object({
			id: kebabIdSchema,
			name: localizedText(locales),
			kind: z.enum(['country', 'region', 'locality']),
			parentId: kebabIdSchema.optional(),
		})
		.strict()

export const tagSchemaFor = (locales: readonly Locale[]) =>
	z
		.object({
			id: kebabIdSchema,
			label: localizedText(locales),
			kind: z.enum(['subject', 'condition', 'motif', 'moment', 'technique']),
		})
		.strict()

export const categoriesConfigSchemaFor = (locales: readonly Locale[]) =>
	z
		.object({
			schemaVersion: z.literal(2),
			categories: z.array(categorySchemaFor(locales)),
		})
		.strict()

export const placesConfigSchemaFor = (locales: readonly Locale[]) =>
	z
		.object({
			schemaVersion: z.literal(2),
			places: z.array(placeSchemaFor(locales)),
		})
		.strict()

export const tagsConfigSchemaFor = (locales: readonly Locale[]) =>
	z
		.object({
			schemaVersion: z.literal(2),
			tags: z.array(tagSchemaFor(locales)),
		})
		.strict()

export const featuredInlineCopySchemaFor = (locales: readonly Locale[]) =>
	z
		.object({
			title: localizedText(locales, { required: true }),
			description: localizedText(locales),
		})
		.strict()

export const featuredItemSchemaFor = (locales: readonly Locale[]) =>
	z
		.object({
			id: kebabIdSchema,
			align: z.enum(['left', 'right']),
			target: z
				.object({
					collection: z.enum(['albums', 'articles', 'pages']),
					slug: kebabIdSchema,
					linkKind: z.enum(['album', 'page']),
				})
				.strict(),
			copySource: z.enum(['target', 'media', 'inline']),
			// slide copy written in home.yaml regardless of the target type; required exactly when
			// `copySource: inline`
			copy: featuredInlineCopySchemaFor(locales).optional(),
			// `target` takes the album's `coverId`, or the document's reference-locale `coverId`
			// (ADR-0013); a document without one fails at build time
			mediaSource: z.union([
				z.literal('target'),
				z
					.object({
						photoSlug: kebabIdSchema,
					})
					.strict(),
			]),
		})
		.strict()
		.superRefine((value, context) => {
			if (value.copySource === 'inline') {
				if (!value.copy) {
					context.addIssue({
						code: 'custom',
						message: 'Inline copySource requires an inline copy block',
						path: ['copy'],
					})
				}
			} else if (value.copy) {
				context.addIssue({
					code: 'custom',
					message: 'copy is only allowed with copySource: inline',
					path: ['copy'],
				})
			}
			if (value.target.collection === 'albums') {
				if (value.target.linkKind !== 'album') {
					context.addIssue({
						code: 'custom',
						message: 'Album target requires album linkKind',
						path: ['target', 'linkKind'],
					})
				}
				return
			}
			if (value.target.linkKind !== 'page') {
				context.addIssue({
					code: 'custom',
					message: 'Article/page target requires page linkKind',
					path: ['target', 'linkKind'],
				})
			}
		})

export const featuredConfigSchemaFor = (locales: readonly Locale[]) =>
	z
		.object({
			schemaVersion: z.literal(2),
			slides: z.array(featuredItemSchemaFor(locales)).min(1),
		})
		.strict()
		.superRefine((value, context) => {
			const ids = value.slides.map((slide) => slide.id)
			if (new Set(ids).size !== ids.length) {
				context.addIssue({
					code: 'custom',
					message: 'Featured slide IDs must be unique',
					path: ['slides'],
				})
			}
		})

export type AlbumSchema = ReturnType<typeof albumSchemaFor>
export type PhotoSchema = ReturnType<typeof photoSchemaFor>

export type AlbumData = z.infer<AlbumSchema>
export type ArticleData = z.infer<typeof articleSchema>
export type Category = z.infer<ReturnType<typeof categorySchemaFor>>
export type FeaturedConfig = z.infer<ReturnType<typeof featuredConfigSchemaFor>>
export type FeaturedInlineCopy = z.infer<ReturnType<typeof featuredInlineCopySchemaFor>>
export type FocalPoint = z.infer<typeof focalPointSchema>
export type MediaDescriptor = z.infer<typeof mediaDescriptorSchema>
export type PageData = z.infer<typeof pageSchema>
export type PhotoData = z.infer<PhotoSchema>
export type Place = z.infer<ReturnType<typeof placeSchemaFor>>
export type Tag = z.infer<ReturnType<typeof tagSchemaFor>>
