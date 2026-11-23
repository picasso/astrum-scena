/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'

import { getViteConfig } from 'astro/config'

import astrumScena from './src/index.ts'

// `getViteConfig` wires Astro's Vite plugins and the integration, so `.astro` components render
// through the Container API and `astro:content` and the core's virtual modules resolve. The site is
// the synthetic demo; the integration comes from source, so the tests need no build.
const CORE_DIR = fileURLToPath(new URL('.', import.meta.url))
const DEMO_ROOT = fileURLToPath(new URL('../../demo/', import.meta.url))

export default getViteConfig(
	{
		test: {
			name: 'core',
			// the Vite root is the site root, as in a site build: root-relative site files resolve from it
			root: DEMO_ROOT,
			dir: CORE_DIR,
			include: ['src/**/*.test.{ts,tsx}'],
			// they need a site without brand logos (vitest.no-brand.config.ts)
			exclude: ['**/node_modules/**', 'src/**/*.no-brand.test.ts'],
		},
	},
	{ root: DEMO_ROOT, configFile: false, integrations: [astrumScena()] },
)
