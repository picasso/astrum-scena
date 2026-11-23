import type { Manifest } from '../../lib/images/manifest.ts'
import { listManifestObjects, type ManifestObject } from './manifest-objects.ts'
import { contentTypeForFormat } from './r2-client.ts'

// a supplementary check of public delivery through the configured public origin, after the
// authoritative bucket check: a HEAD of `${publicOrigin}/${objectKey}` for each object must answer
// 2xx with the content type of its format, immutable caching and, when the server sends one, the
// manifest's length. Bytes are not verified here (the bucket check does that). Everything fails
// closed: the public origin is the only public path, so an unreachable origin or a wrong header
// blocks the release

export type FetchLike = (
	url: string,
	init: { method: 'HEAD'; redirect: 'manual' },
) => Promise<{ ok: boolean; status: number; headers: { get: (name: string) => string | null } }>

export type PublicDomainCheckResult = {
	ok: boolean
	errors: string[]
	verified: number
	total: number
}

async function headProblem(
	fetchImpl: FetchLike,
	publicOrigin: string,
	object: ManifestObject,
): Promise<string | undefined> {
	const key = object.objectKey
	let response
	try {
		response = await fetchImpl(`${publicOrigin}/${key}`, { method: 'HEAD', redirect: 'manual' })
	} catch (error) {
		return `public HEAD "${key}" failed: ${(error as Error).message}`
	}
	// a redirect may lead to another host, so the origin itself must serve the object
	if (response.status >= 300 && response.status < 400)
		return `public HEAD "${key}" redirected with status ${response.status}`
	if (!response.ok) return `public HEAD "${key}" returned status ${response.status}`
	const expectedType = contentTypeForFormat(object.format)
	const actualType = response.headers.get('content-type')
	if (actualType !== expectedType)
		return `public object "${key}" content-type ${actualType ?? '(none)'} != ${expectedType}`
	const cacheControl = response.headers.get('cache-control') ?? ''
	const directives = cacheControl.split(',').map((directive) => directive.trim().toLowerCase())
	if (!directives.includes('immutable') || directives.includes('no-store'))
		return `public object "${key}" cache-control "${cacheControl}" is not immutable`
	const contentLength = response.headers.get('content-length')
	if (contentLength !== null && Number(contentLength) !== object.byteSize)
		return `public object "${key}" content-length ${contentLength} != manifest ${object.byteSize}`
	return undefined
}

export async function checkPublicDomain(options: {
	manifest: Manifest
	publicOrigin: string
	fetchImpl: FetchLike
}): Promise<PublicDomainCheckResult> {
	const objects = listManifestObjects(options.manifest)
	const errors: string[] = []
	for (const object of objects) {
		const problem = await headProblem(options.fetchImpl, options.publicOrigin, object)
		if (problem !== undefined) errors.push(problem)
	}
	return {
		ok: errors.length === 0,
		errors,
		verified: objects.length - errors.length,
		total: objects.length,
	}
}
