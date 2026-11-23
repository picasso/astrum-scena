import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { siteAstroBin } from './build-demo-from-pack.ts'
import { missingBuild, parseE2EArgs } from './run-e2e.ts'

describe('parseE2EArgs', () => {
	it('builds by default and passes every argument to Playwright', () => {
		expect(parseE2EArgs(['home', '--project=mobile-375'])).toEqual({
			build: true,
			playwright: ['home', '--project=mobile-375'],
		})
	})

	it('skips the build with --no-build and keeps it from Playwright', () => {
		expect(parseE2EArgs(['--no-build', 'viewer'])).toEqual({
			build: false,
			playwright: ['viewer'],
		})
	})
})

describe('missingBuild', () => {
	const withSite = (files: string[], check: (site: string) => void) => {
		const site = mkdtempSync(join(tmpdir(), 'e2e-site-'))
		try {
			for (const file of files) {
				mkdirSync(dirname(join(site, file)), { recursive: true })
				writeFileSync(join(site, file), '')
			}
			check(site)
		} finally {
			rmSync(site, { recursive: true, force: true })
		}
	}
	const BIN = 'node_modules/.bin/astro'

	it('accepts an installed site with its dist', () => {
		withSite([BIN, 'dist/index.html'], (site) => expect(missingBuild(site)).toBeUndefined())
	})

	it('names the missing piece and how to build it', () => {
		withSite(['dist/index.html'], (site) =>
			expect(missingBuild(site)).toContain(`${siteAstroBin(site)} is missing`),
		)
		withSite([BIN], (site) => {
			const message = missingBuild(site)
			expect(message).toContain(`${join(site, 'dist')} is missing`)
			expect(message).toContain('without --no-build')
		})
	})
})

// the browsers of the container must be the ones @playwright/test drives, so the image tag carries
// its exact version, and CI and the local docker runs (compare and update) use one image pinned by
// digest: the baselines they write are the ones CI compares
describe('Playwright image', () => {
	const IMAGE = /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-[a-z]+@sha256:[0-9a-f]{64}/g
	const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
		scripts: Record<string, string>
		devDependencies: Record<string, string>
	}
	const images = (text: string) => [...text.matchAll(IMAGE)]

	it('matches the exact @playwright/test version in CI and in both docker scripts', () => {
		const version = manifest.devDependencies['@playwright/test']
		expect(version).toMatch(/^\d+\.\d+\.\d+$/)
		const ci = images(readFileSync('.github/workflows/ci.yml', 'utf8'))
		const docker = ['test:e2e:docker', 'test:e2e:docker:update'].flatMap((name) => {
			const found = images(manifest.scripts[name] ?? '')
			expect(found, name).toHaveLength(1)
			return found
		})
		expect(ci.length).toBeGreaterThan(0)
		const found = [...ci, ...docker]
		for (const [image, imageVersion] of found) {
			expect(imageVersion, image).toBe(version)
			expect(image).toBe(found[0]![0])
		}
	})
})

describe('run-e2e.ts', () => {
	it('exits non-zero when Playwright fails', () => {
		const demo = mkdtempSync(join(tmpdir(), 'e2e-demo-'))
		try {
			for (const file of ['site/node_modules/.bin/astro', 'site/dist/index.html']) {
				mkdirSync(dirname(join(demo, file)), { recursive: true })
				writeFileSync(join(demo, file), '')
			}
			// an unknown option makes `playwright test` fail before it starts the preview
			const result = spawnSync(
				process.execPath,
				[
					'--experimental-strip-types',
					'scripts/run-e2e.ts',
					'--no-build',
					'--no-such-playwright-option',
				],
				{ encoding: 'utf8', env: { ...process.env, E2E_DEMO_DIR: demo } },
			)
			expect(result.stderr).not.toContain('no packed demo build')
			expect(result.stderr).toContain('no-such-playwright-option')
			expect(result.status).not.toBe(0)
		} finally {
			rmSync(demo, { recursive: true, force: true })
		}
	})
})

// CI must fail on a missing baseline rather than write it; elsewhere a new surface gets its baseline
describe('playwright.config.ts', () => {
	const loadConfig = async (ci: string | undefined) => {
		vi.resetModules()
		vi.stubEnv('CI', ci)
		try {
			return (await import('../playwright.config.ts')).default
		} finally {
			vi.unstubAllEnvs()
		}
	}

	it('only compares baselines in CI and writes missing ones elsewhere', async () => {
		expect((await loadConfig('true')).updateSnapshots).toBe('none')
		expect((await loadConfig('')).updateSnapshots).toBe('missing')
	})

	// touch input needs a touch device, and the touch devices run nothing but the touch spec
	it('runs the touch spec only on the touch projects', async () => {
		const projects = (await loadConfig('')).projects ?? []
		const touch = projects.filter((project) => project.use?.hasTouch)
		expect(touch.map((project) => project.name)).toEqual(['mobile-touch', 'tablet-touch'])
		for (const project of touch) {
			expect(project.use?.isMobile).toBe(true)
			expect(project.testMatch).toBe('**/viewer-touch.spec.ts')
		}
		for (const project of projects.filter((entry) => !entry.use?.hasTouch))
			expect(project.testIgnore).toBe('**/viewer-touch.spec.ts')
	})
})

describe('test:e2e:docker:update', () => {
	it('is test:e2e:docker that rewrites the baselines', () => {
		const scripts = (
			JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
		).scripts
		expect(scripts['test:e2e:docker:update']).toBe(
			scripts['test:e2e:docker']!.replace(
				'pnpm test:e2e"',
				'pnpm test:e2e --update-snapshots"',
			),
		)
	})
})
