import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { siteRoot } from '../../config/site-root.ts'
import { loadImageCatalog, loadProductionImageCatalog, resolveCatalogEnv } from './catalog'
import { parseManifest, serializeManifest } from './manifest'
import {
	IMAGES_PUBLIC_RELATIVE_PATH,
	loadImagePublicConfig,
	serializeImagePublicConfig,
} from './public-config'
import {
	buildReleaseDescriptor,
	releaseDescriptorPath,
	releaseManifestPath,
	serializeReleaseDescriptor,
} from './release'

const scratch: string[] = []
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})
const tempDir = (prefix: string): string => {
	const dir = mkdtempSync(path.join(tmpdir(), prefix))
	scratch.push(dir)
	return dir
}

// a site root with an active release of the synthetic ladder fixture and the demo's public config
function fixtureSiteRoot(): string {
	const root = tempDir('catalog-site-')
	const fixture = new URL('./__fixtures__/s9-ladder-manifest.json', import.meta.url)
	const manifest = parseManifest(JSON.parse(readFileSync(fixture, 'utf8')))
	mkdirSync(path.dirname(releaseDescriptorPath(root)), { recursive: true })
	writeFileSync(
		releaseDescriptorPath(root),
		serializeReleaseDescriptor(buildReleaseDescriptor({ active: true, manifest })),
	)
	copyFileSync(
		path.join(siteRoot, IMAGES_PUBLIC_RELATIVE_PATH),
		path.join(root, IMAGES_PUBLIC_RELATIVE_PATH),
	)
	return root
}

const root = fixtureSiteRoot()

describe('loadProductionImageCatalog', () => {
	const catalog = loadProductionImageCatalog(root)

	it('sources the URL base and rights from the public config projection', () => {
		const { config } = loadImagePublicConfig(root)
		expect(catalog.originBase).toBe(config.publicPath)
		expect(catalog.credit).toBe(config.credit)
		expect(catalog.copyright).toBe(config.copyright)
	})

	it('sources the manifest from the active release descriptor', () => {
		// no exact count: the photo set is whatever release is active (ADR-0012)
		expect(catalog.manifest.schemaVersion).toBe(3)
		expect(Object.keys(catalog.manifest.photos).length).toBeGreaterThan(0)
	})

	it('takes the origin as the URL base of a site on an external image host', () => {
		const hosted = fixtureSiteRoot()
		const { config } = loadImagePublicConfig(hosted)
		const { schemaVersion, copyright, credit, ladder } = config
		writeFileSync(
			path.join(hosted, IMAGES_PUBLIC_RELATIVE_PATH),
			serializeImagePublicConfig({
				schemaVersion,
				copyright,
				credit,
				ladder,
				publicOrigin: 'https://media.example.com',
			}),
		)
		expect(loadProductionImageCatalog(hosted).originBase).toBe('https://media.example.com')
	})

	it('never carries private rights internals', () => {
		const keys = Object.keys(catalog)
		expect(keys.sort()).toEqual(['copyright', 'credit', 'manifest', 'originBase'])
	})
})

describe('resolveCatalogEnv (image env contract)', () => {
	it('selects production when no local image env is present', () => {
		expect(resolveCatalogEnv({})).toEqual({ mode: 'production' })
	})

	it('selects local images only in dev with the complete pair', () => {
		expect(
			resolveCatalogEnv(
				{
					IMAGES_LOCAL_MANIFEST: '/abs/local-manifest.json',
					IMAGES_LOCAL_ORIGIN: 'http://127.0.0.1:4324',
				},
				{ dev: true },
			),
		).toEqual({
			mode: 'local',
			manifestPath: '/abs/local-manifest.json',
			origin: 'http://127.0.0.1:4324',
		})
	})

	it('rejects local mode in build and preview and partial pairs', () => {
		const local = {
			IMAGES_LOCAL_MANIFEST: '/abs/local-manifest.json',
			IMAGES_LOCAL_ORIGIN: 'http://127.0.0.1:4324',
		}
		expect(() => resolveCatalogEnv(local, { dev: false })).toThrow(/dev-only/)
		expect(() => resolveCatalogEnv({ IMAGES_LOCAL_MANIFEST: '/m' }, { dev: true })).toThrow(
			/requires/,
		)
		expect(() =>
			resolveCatalogEnv({ IMAGES_LOCAL_ORIGIN: 'http://127.0.0.1:4324' }, { dev: true }),
		).toThrow(/requires/)
		expect(() =>
			resolveCatalogEnv(
				{ ...local, IMAGES_LOCAL_ORIGIN: 'https://example.com' },
				{ dev: true },
			),
		).toThrow(/127\.0\.0\.1/)
		expect(() =>
			resolveCatalogEnv({ ...local, IMAGES_LOCAL_ORIGIN: '127.0.0.1:4324' }, { dev: true }),
		).toThrow(/must use local HTTP/)
	})
})

describe('loadImageCatalog (env-aware)', () => {
	it('matches the production adapter when no local image env is set', () => {
		expect(loadImageCatalog(root, {})).toEqual(loadProductionImageCatalog(root))
	})

	it('reads a local release manifest in dev mode', () => {
		const dir = tempDir('catalog-local-')
		const manifestPath = releaseManifestPath(dir)
		writeFileSync(
			manifestPath,
			serializeManifest(loadProductionImageCatalog(root).manifest),
			'utf8',
		)
		const catalog = loadImageCatalog(
			root,
			{
				IMAGES_LOCAL_MANIFEST: manifestPath,
				IMAGES_LOCAL_ORIGIN: 'http://127.0.0.1:4324',
			},
			{ dev: true },
		)
		expect(catalog.originBase).toBe('http://127.0.0.1:4324')
		expect(catalog.manifest).toEqual(loadProductionImageCatalog(root).manifest)
	})
})
