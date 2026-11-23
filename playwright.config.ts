import { defineConfig, devices } from '@playwright/test'

import { demoConfig } from './e2e/helpers.ts'
import { PACKED_DEMO_DIR, packedSite, siteAstroBin } from './scripts/build-demo-from-pack.ts'

// e2e of the core against the demo built from the packed core (`pnpm test:e2e` builds it first,
// `--no-build` reuses it) and served by `astro preview` of that installed site. The visual baselines
// are rendered only in the Linux Playwright image, so their path has no platform segment

const isCI = !!process.env.CI
// not 4321: a running astro dev server there injects its dev toolbar (shadow DOM) into the markup
const PORT = 4322
const site = packedSite(PACKED_DEMO_DIR)

// touch input runs only on the touch device projects, and those run nothing else
const TOUCH_SPEC = '**/viewer-touch.spec.ts'

// specs read `metadata.width` to enable scenarios only where they apply (the drawer below 1024px)
const viewport = (name: string, width: number, height: number) => ({
	name,
	use: { ...devices['Desktop Chrome'], viewport: { width, height } },
	metadata: { width },
	testIgnore: TOUCH_SPEC,
})

// isMobile and hasTouch devices of the Chromium family: the touch spec drives swipes through CDP
const touchDevice = (name: string, device: string) => ({
	name,
	use: { ...devices[device] },
	metadata: { width: devices[device]!.viewport.width },
	testMatch: TOUCH_SPEC,
})

export default defineConfig({
	testDir: 'e2e',
	// `*.test.ts` in e2e/ are the Vitest tests of the helpers
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	forbidOnly: isCI,
	// CI retries only to record a trace; a test that passes on a retry still fails the run
	retries: isCI ? 2 : 0,
	failOnFlakyTests: isCI,
	reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: { baseURL: `http://localhost:${PORT}`, trace: 'on-first-retry' },
	snapshotPathTemplate: 'e2e/__screenshots__/{testFileName}/{projectName}-{arg}{ext}',
	// a pixel counts as changed past a YIQ distance of 0.02, so a token shift of a few levels fails; the
	// default 0.2 lets the page background drift by ~50 levels unnoticed
	expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.02 } },
	// CI only compares: a missing baseline fails there instead of being written; locally (in Docker)
	// a new surface gets its baseline, and `test:e2e:docker:update` rewrites the existing ones
	updateSnapshots: isCI ? 'none' : 'missing',
	projects: [
		viewport('mobile-375', 375, 812),
		viewport('tablet-768', 768, 1024),
		viewport('desktop-1440', 1440, 900),
		viewport('wide-1920', 1920, 1080),
		touchDevice('mobile-touch', 'Pixel 5'),
		touchDevice('tablet-touch', 'Galaxy Tab S4'),
	],
	// the root redirect lives in `_redirects`, which `astro preview` ignores, so readiness waits on the
	// reference locale's home; cwd is the build's work dir, as in the build itself. `--ignore-lock`
	// keeps the server in the foreground, where Playwright owns it: run by an AI agent, astro preview
	// otherwise detaches into a background server and the command exits at once
	webServer: {
		command: `${JSON.stringify(siteAstroBin(site))} preview --root ${JSON.stringify(site)} --port ${PORT} --ignore-lock`,
		cwd: PACKED_DEMO_DIR,
		url: `http://localhost:${PORT}/${demoConfig.content.referenceLocale}/`,
		// always the fresh packed build, never a stale or unrelated server on the port
		reuseExistingServer: false,
		timeout: 60_000,
	},
})
