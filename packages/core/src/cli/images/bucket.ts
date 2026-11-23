import type { ImageConfig } from '../../lib/images/build/config.ts'
import type { CliContext } from '../context.ts'
import type { BucketOptions, R2Client } from './r2-client.ts'
import { R2_ENV_VARS, resolveR2Credentials } from './r2-env.ts'
import { openS3Bucket } from './s3-client.ts'
import { type SiteEnv, siteEnv } from './site-env.ts'

// the credentials are read first, so a site without them fails naming the variables before the S3
// SDK is loaded or any request is made. The endpoint embeds the account id and SDK errors quote it,
// so every error of the bucket client names a credential by its variable, never by its value

type Redact = (error: unknown) => unknown

function redactor(env: SiteEnv): Redact {
	const secrets = R2_ENV_VARS.flatMap((name) => {
		const value = env[name]
		return value ? [{ name, value }] : []
	}).sort((a, b) => b.value.length - a.value.length)
	return (error) => {
		if (!(error instanceof Error)) return error
		const message = secrets.reduce(
			(text, { name, value }) => text.replaceAll(value, name),
			error.message,
		)
		return message === error.message ? error : new Error(message)
	}
}

const guarded =
	<A extends unknown[], R>(redact: Redact, call: (...args: A) => Promise<R>) =>
	async (...args: A): Promise<R> => {
		try {
			return await call(...args)
		} catch (error) {
			throw redact(error)
		}
	}

export async function openBucket(
	context: Pick<CliContext, 'root' | 'env' | 'openBucket'>,
	options: BucketOptions,
): Promise<R2Client> {
	const env = siteEnv(context)
	const redact = redactor(env)
	const open = context.openBucket ?? openS3Bucket()
	const client = await guarded(redact, open)(resolveR2Credentials(env), options)
	return {
		head: guarded(redact, client.head),
		put: guarded(redact, client.put),
		openReadStream: guarded(redact, client.openReadStream),
		list: guarded(redact, client.list),
	}
}

// the origin the bucket is served from; a site that serves its derivatives itself has no bucket
export function bucketOrigin(config: ImageConfig): string {
	if (config.publicOrigin !== undefined) return config.publicOrigin
	throw new Error(
		`the images section serves the derivatives from publicPath ${config.publicPath ?? '(unset)'}; ` +
			'the bucket commands need publicOrigin',
	)
}
