// `*.pages.dev` (the project alias and every per-deployment host) sits outside the site zone, so the
// zone's WAF rate limit on the form never sees requests sent there; a fully-qualified host with a trailing
// dot is served too
export function isPagesDevHost(url: string): boolean {
	return new URL(url).hostname.replace(/\.$/, '').endsWith('.pages.dev')
}

// a bare 403 on `*.pages.dev` keeps API Functions from running there; any other host goes on to them
export async function guardApiHost(
	request: Request,
	next: () => Promise<Response>,
): Promise<Response> {
	if (isPagesDevHost(request.url)) return new Response(null, { status: 403 })
	return next()
}
