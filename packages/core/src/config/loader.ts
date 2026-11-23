import { existsSync } from 'node:fs'
import path from 'node:path'

import type { ConsumerEnvName } from '../consumer-env.ts'
import { assertNoRetiredFiles, parseSiteLock, RESOLVE_HINT, SITE_LOCK_PATH } from './lock.ts'
import type { SiteConfig } from './site-schema.ts'
import { readYaml } from './yaml-file.ts'

// the only reader of the site's config: site.lock.yaml, the effective config resolve wrote from
// site.yaml (config/lock.ts); its sections (`seo`, `images` and the rest) are slices of the same read.
// It never compares the lock with site.yaml, which is the drift gate's job, and applies no defaults.
// It reads from disk relative to the site root it is given, so the same module serves Astro/Vite
// prerendering, plain Node CLIs, gates, migration and e2e.

// builds from another lock (e.g. a test's); a relative path resolves against the root, an absolute
// one is taken as is
export const SITE_LOCK_ENV = 'SITE_LOCK_PATH' satisfies ConsumerEnvName
export const siteLockPath = (
	env: Readonly<Record<string, string | undefined>> = process.env,
): string => env[SITE_LOCK_ENV] || SITE_LOCK_PATH

export const loadSiteConfig = (root: string, lockPath = siteLockPath()): SiteConfig => {
	assertNoRetiredFiles(root)
	if (!existsSync(path.resolve(root, lockPath)))
		throw new Error(`${lockPath}: missing; ${RESOLVE_HINT}`)
	return parseSiteLock(readYaml(root, lockPath), lockPath).site
}

// a section of the whole lock, which is checked as a whole: a lock is strict in every branch
export const loadSiteSection = <K extends keyof SiteConfig>(
	root: string,
	key: K,
	lockPath = siteLockPath(),
): SiteConfig[K] => loadSiteConfig(root, lockPath)[key]

export const loadSeoConfig = (root: string): SiteConfig['seo'] => loadSiteSection(root, 'seo')
