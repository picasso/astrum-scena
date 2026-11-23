/// <reference types="vitest/config" />
import { cpSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getViteConfig } from 'astro/config'

import astrumScena from './src/index.ts'

// a site without `src/assets/brand/`: the synthetic demo copied without its brand directory into the
// gitignored `.astro/`, so the logo globs, which resolve from the Vite root, find nothing; its `logo`
// replacement stays behind too, since it would fill the slot without a brand file
const CORE_DIR = fileURLToPath(new URL('.', import.meta.url))
const DEMO_ROOT = fileURLToPath(new URL('../../demo/', import.meta.url))
const SITE_ROOT = path.join(CORE_DIR, '.astro', 'fixture-sites', 'no-brand')
const NOT_COPIED = new Set([
	'node_modules',
	'dist',
	'.astro',
	path.join('src', 'assets', 'brand'),
	path.join('src', 'overrides'),
])

rmSync(SITE_ROOT, { recursive: true, force: true })
cpSync(DEMO_ROOT, SITE_ROOT, {
	recursive: true,
	filter: (source) => !NOT_COPIED.has(path.relative(DEMO_ROOT, source)),
})

export default getViteConfig(
	{
		test: {
			name: 'core-no-brand',
			root: SITE_ROOT,
			dir: CORE_DIR,
			include: ['src/**/*.no-brand.test.ts'],
		},
	},
	{ root: SITE_ROOT, configFile: false, integrations: [astrumScena()] },
)
