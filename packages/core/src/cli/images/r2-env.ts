import type { SiteEnv } from './site-env.ts'

// the bucket credentials of a site come from the environment or its gitignored `.env` locally and
// from secrets in CI; an error names a missing variable but never prints a value

export const R2_ENV_VARS = [
	'R2_IMAGES_ACCOUNT_ID',
	'R2_IMAGES_ACCESS_KEY_ID',
	'R2_IMAGES_SECRET_ACCESS_KEY',
	'R2_IMAGES_BUCKET',
] as const

export type R2Credentials = {
	accountId: string
	accessKeyId: string
	secretAccessKey: string
	bucket: string
	endpoint: string
}

export function resolveR2Credentials(env: SiteEnv): R2Credentials {
	const accountId = env.R2_IMAGES_ACCOUNT_ID
	const accessKeyId = env.R2_IMAGES_ACCESS_KEY_ID
	const secretAccessKey = env.R2_IMAGES_SECRET_ACCESS_KEY
	const bucket = env.R2_IMAGES_BUCKET
	if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
		const missing = R2_ENV_VARS.filter((name) => !env[name])
		throw new Error(
			`R2 credentials missing; set ${missing.join(', ')} in the environment or in .env at the ` +
				'site root (CI: in its secrets). Values are never printed.',
		)
	}
	return {
		accountId,
		accessKeyId,
		secretAccessKey,
		bucket,
		endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
	}
}
