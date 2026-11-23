import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
	buildPackedDemo,
	PACKED_DEMO_DIR,
	packedSite,
	siteAstroBin,
} from './build-demo-from-pack.ts'

// `pnpm test:e2e`: builds the demo from the packed core into PACKED_DEMO_DIR, then runs Playwright
// against `astro preview` of that build. `--no-build` reuses the last build; every other argument
// goes to `playwright test`.

export const NO_BUILD = '--no-build'

export function parseE2EArgs(argv: readonly string[]): { build: boolean; playwright: string[] } {
	return {
		build: !argv.includes(NO_BUILD),
		playwright: argv.filter((arg) => arg !== NO_BUILD),
	}
}

// the preview needs both the installed site (its astro binary) and its dist
export function missingBuild(site: string): string | undefined {
	for (const path of [siteAstroBin(site), join(site, 'dist')])
		if (!existsSync(path))
			return `no packed demo build at ${site} (${path} is missing); run pnpm test:e2e without ${NO_BUILD}`
	return undefined
}

function main(): void {
	const { build, playwright } = parseE2EArgs(process.argv.slice(2))
	if (build) buildPackedDemo({ out: PACKED_DEMO_DIR })
	const missing = missingBuild(packedSite(PACKED_DEMO_DIR))
	if (missing) {
		console.error(missing)
		process.exitCode = 1
		return
	}
	try {
		execFileSync('pnpm', ['exec', 'playwright', 'test', ...playwright], { stdio: 'inherit' })
	} catch {
		// the report is already printed by Playwright
		process.exitCode = 1
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
