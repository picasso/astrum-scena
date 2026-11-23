// every environment variable the core reads. `public` ones belong to the site's API: it sets them in its
// build or Cloudflare environment. `internal` ones serve the core's own builds, gates and e2e and may
// change in any release. `pnpm check:api-snapshot` fails on a name the core reads that is not listed
// here, and only the public names enter the API snapshot.
export const CONSUMER_ENV = {
	// contact form: the Turnstile widget key, inlined at build time
	PUBLIC_TURNSTILE_SITE_KEY: 'public',
	// contact form runtime secrets; they live only in Cloudflare, never in the repo or with values in
	// `.env.example`
	TURNSTILE_SECRET_KEY: 'public',
	TELEGRAM_BOT_TOKEN: 'public',
	TELEGRAM_CHAT_ID: 'public',
	// the expected hostname defaults to the request's own: the form is served from its own domain
	TURNSTILE_EXPECTED_ACTION: 'public',
	TURNSTILE_EXPECTED_HOSTNAME: 'public',
	// mock upstreams for the contact e2e, honoured only with CONTACT_E2E_MOCK_UPSTREAMS=1, so a binding
	// left behind in production cannot send the bot token or the Turnstile check elsewhere
	CONTACT_E2E_MOCK_UPSTREAMS: 'internal',
	TURNSTILE_VERIFY_URL: 'internal',
	TELEGRAM_API_BASE: 'internal',
	// the masters and the year-organized archive of the image commands, outside the site; an option
	// of the command or the site's `.env` may give them instead
	IMAGES_MASTERS_ROOT: 'public',
	IMAGES_ARCHIVE_ROOT: 'public',
	// the bucket of the image bucket commands (sync, prune, check-live); never printed
	R2_IMAGES_ACCOUNT_ID: 'public',
	R2_IMAGES_ACCESS_KEY_ID: 'public',
	R2_IMAGES_SECRET_ACCESS_KEY: 'public',
	R2_IMAGES_BUCKET: 'public',
	// builds the site from another site.lock.yaml (e.g. a test's)
	SITE_LOCK_PATH: 'internal',
	// a local image manifest and origin for the dev server and e2e
	IMAGES_LOCAL_MANIFEST: 'internal',
	IMAGES_LOCAL_ORIGIN: 'internal',
	// vite's own flag, not set by a site
	DEV: 'internal',
	// set by GitHub Actions: the fact-check warnings become annotations of the run
	GITHUB_ACTIONS: 'internal',
	// set by CI services: the gate core-version then requires the core installed from the lockfile
	CI: 'internal',
} as const satisfies Record<string, 'public' | 'internal'>

export type ConsumerEnvName = keyof typeof CONSUMER_ENV
