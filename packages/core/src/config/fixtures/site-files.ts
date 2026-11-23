import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { stringify } from 'yaml'

import { resolveSiteLock, SITE_CONFIG_PATH, SITE_LOCK_PATH } from '../lock.ts'

// the site's site.yaml (an object or its text) as a site edits it, without resolving the lock
export function writeSiteConfig(root: string, config: object | string): string {
	mkdirSync(root, { recursive: true })
	writeFileSync(
		path.join(root, SITE_CONFIG_PATH),
		typeof config === 'string' ? config : stringify(config),
	)
	return root
}

// the site's site.yaml rewritten by `edit`, as a site edits it, without resolving the lock
export function editSiteConfig(root: string, edit: (source: string) => string): string {
	const file = path.join(root, SITE_CONFIG_PATH)
	writeFileSync(file, edit(readFileSync(file, 'utf8')))
	return root
}

// site.yaml and the lock resolve makes of it, as a site commits both; a test that needs a site config
// builds it here instead of writing a lock by hand
export function writeSiteFiles(root: string, config: object | string): string {
	writeSiteConfig(root, config)
	writeFileSync(path.join(root, SITE_LOCK_PATH), resolveSiteLock(root))
	return root
}
