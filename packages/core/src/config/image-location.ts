import { z } from 'astro/zod'

// where a site serves its derivatives from: the image config of site.yaml and its public projection
// share these fields

const HTTPS_URL_PATTERN = /^https:\/\//

// segments of unreserved characters only, so `..`, `//`, a trailing slash and a host never pass
const PUBLIC_PATH_PATTERN = /^(?:\/[A-Za-z0-9._~-]+)+$/

// derivatives served by an external host such as a custom R2 domain
export const publicOriginSchema = z
	.url()
	.min(1)
	.regex(HTTPS_URL_PATTERN, 'publicOrigin must be an https URL')
	.refine((value) => !value.endsWith('/'), 'publicOrigin must not have a trailing slash')

// derivatives served by the site itself, from a path under its root (its `public/` directory)
export const publicPathSchema = z
	.string()
	.regex(
		PUBLIC_PATH_PATTERN,
		'publicPath must be a root-relative path such as /media, without a trailing slash',
	)
	.refine(
		(value) => value.split('/').every((segment) => segment !== '.' && segment !== '..'),
		'publicPath must not contain "." or ".." segments',
	)

export const imageLocationShape = {
	publicOrigin: publicOriginSchema.optional(),
	publicPath: publicPathSchema.optional(),
}

export type ImageLocation = { publicOrigin?: string; publicPath?: string }

// exactly one of the two fields says where the derivatives are served from
export function refineImageLocation(value: ImageLocation, context: z.RefinementCtx): void {
	const hasOrigin = value.publicOrigin !== undefined
	const hasPath = value.publicPath !== undefined
	if (hasOrigin === hasPath) {
		context.addIssue({
			code: 'custom',
			message: hasOrigin
				? 'publicOrigin and publicPath are mutually exclusive; set only one'
				: 'set publicOrigin (an external https origin) or publicPath (a site path)',
			path: [hasOrigin ? 'publicPath' : 'publicOrigin'],
		})
	}
}
