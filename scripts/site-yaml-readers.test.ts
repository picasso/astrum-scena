import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// site.yaml is read only by resolve (config/lock.ts): the build, commands, gates and e2e read the lock
// through the loader. A file naming site.yaml in code is a second reader, except the ones listed
describe('readers of site.yaml', () => {
	const REPO = fileURLToPath(new URL('..', import.meta.url))
	const SCANNED_TREES = ['packages/core/src', 'scripts', 'e2e', 'demo']
	const ALLOWED = new Set([
		// resolve, its tests and the test helper that writes a site's site.yaml
		'packages/core/src/config/lock.ts',
		'packages/core/src/config/lock.test.ts',
		'packages/core/src/config/fixtures/site-files.ts',
		// the CLI dispatcher takes a directory for a site root only when it holds site.yaml
		'packages/core/src/cli/run.ts',
		// the API snapshot keys the schema of site.yaml by the file's name
		'scripts/lib/api-surface.ts',
		'scripts/lib/api-surface.test.ts',
	])
	const CODE_FILE = /\.(?:[cm]?[jt]sx?|astro)$/
	// a string literal or the constant; comments name the file in backticks
	const NAMES_SITE_YAML = /(['"])site\.yaml\1|\bSITE_CONFIG_PATH\b/

	it('is named in code only by resolve, its tests, the CLI root check and the API snapshot', () => {
		const files = execFileSync(
			'git',
			[
				'ls-files',
				'-z',
				'--cached',
				'--others',
				'--exclude-standard',
				'--',
				...SCANNED_TREES,
			],
			{ cwd: REPO, encoding: 'utf8' },
		)
			.split('\0')
			.filter((file) => CODE_FILE.test(file) && existsSync(path.join(REPO, file)))
		const readers = files.filter(
			(file) =>
				!ALLOWED.has(file) &&
				NAMES_SITE_YAML.test(readFileSync(path.join(REPO, file), 'utf8')),
		)

		expect(files).toContain('packages/core/src/config/loader.ts')
		expect(readers).toEqual([])
	})
})
