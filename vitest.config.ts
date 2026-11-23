import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		projects: [
			{ test: { name: 'scripts', include: ['scripts/**/*.test.ts'] } },
			// the Playwright specs (`*.spec.ts`) run in `pnpm test:e2e`, only their helpers here
			{ test: { name: 'e2e', include: ['e2e/**/*.test.ts'] } },
			'packages/core/vitest.config.ts',
			'packages/core/vitest.no-brand.config.ts',
		],
	},
})
