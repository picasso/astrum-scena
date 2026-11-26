import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'

import { withCoursesModule } from './fixtures/courses-module-upgrade.ts'
import { buildSiteConfig, contentConfig } from './fixtures/site-config.ts'
import { writeSiteConfig, writeSiteFiles } from './fixtures/site-files.ts'
import {
	loadSeoConfig,
	loadSiteConfig,
	loadSiteSection,
	SITE_LOCK_ENV,
	siteLockPath,
} from './loader.ts'
import { effectiveCatalog } from './locale-schema.ts'
import { COLLECTION_VERSIONS, RETIRED_CONFIG_FILES, SITE_LOCK_PATH } from './lock.ts'
import { siteRoot } from './site-root.ts'
import { type SiteConfig, siteSchema } from './site-schema.ts'
import { DEFAULT_TAXONOMY } from './taxonomy.ts'

// loadImageConfig of lib/images/build is this slice; config tests do not import lib
const loadImageConfig = (root: string) => loadSiteSection(root, 'images')

const roots: string[] = []

const makeRoot = (files: Record<string, string> = {}): string => {
	const root = mkdtempSync(path.join(tmpdir(), 'config-loader-'))
	roots.push(root)
	for (const [relativePath, content] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true })
		writeFileSync(path.join(root, relativePath), content)
	}
	return root
}

// a site resolved from the fixture config, its lock then edited as a hand edit would
type Lock = Record<string, unknown> & { site: Record<string, unknown> }
const lockedRoot = (edit: (lock: Lock) => void = () => {}): string => {
	const root = writeSiteFiles(makeRoot(), buildSiteConfig())
	const file = path.join(root, SITE_LOCK_PATH)
	const lock = parse(readFileSync(file, 'utf8')) as Lock
	edit(lock)
	writeFileSync(file, stringify(lock))
	return root
}

const object = (value: unknown) => value as Record<string, unknown>

// the default-path cases must not inherit an ambient override
beforeAll(() => {
	vi.stubEnv(SITE_LOCK_ENV, '')
})

afterAll(() => {
	vi.unstubAllEnvs()
})

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('config loader', () => {
	it("validates the demo site's lock against the schema with every required key", () => {
		const shipped = loadSiteConfig(siteRoot)
		const required = Object.entries(siteSchema.in.shape)
			.filter(([, schema]) => !schema.safeParse(undefined).success)
			.map(([key]) => key)

		expect(siteSchema.safeParse(shipped).success).toBe(true)
		expect(required.length).toBeGreaterThan(0)
		for (const key of required) expect(shipped).toHaveProperty(key)
	})

	it('gives every section slice of the demo as the full tree holds it', () => {
		const tree = loadSiteConfig(siteRoot)

		for (const key of Object.keys(siteSchema.in.shape) as (keyof typeof tree)[])
			expect(loadSiteSection(siteRoot, key)).toEqual(tree[key])
		expect(loadSeoConfig(siteRoot)).toEqual(tree.seo)
		expect(loadImageConfig(siteRoot)).toEqual(tree.images)
	})

	it('loads the effective config resolved from the site config at the given root', () => {
		const fixture = buildSiteConfig({
			content: contentConfig(['ru', 'en'], 'en'),
		})
		const root = writeSiteFiles(makeRoot(), fixture)

		expect(loadSiteConfig(root)).toEqual(fixture)
		expect(loadSiteSection(root, 'content')).toEqual(fixture.content)
	})

	it('reads only the lock, never the site config it was resolved from', () => {
		const root = writeSiteFiles(makeRoot(), buildSiteConfig())
		const locked = loadSiteConfig(root)
		writeSiteConfig(root, 'theme:\n  defualt: light\n')

		expect(loadSiteConfig(root)).toEqual(locked)
	})

	it('fails without a lock, naming it and the command that writes it', () => {
		const root = writeSiteFiles(makeRoot(), buildSiteConfig())
		unlinkSync(path.join(root, SITE_LOCK_PATH))
		const message = `${SITE_LOCK_PATH}: missing; run astrum-scena config resolve`

		for (const load of [loadSiteConfig, loadSeoConfig, loadImageConfig])
			expect(() => load(root)).toThrow(message)
		expect(() => loadSiteConfig(makeRoot())).toThrow(message)
	})

	it('takes the lock path from the environment, defaulting to the shipped one', () => {
		expect(SITE_LOCK_PATH).toBe('site.lock.yaml')
		expect(siteLockPath({})).toBe(SITE_LOCK_PATH)
		expect(siteLockPath({ [SITE_LOCK_ENV]: '' })).toBe(SITE_LOCK_PATH)
		expect(siteLockPath({ [SITE_LOCK_ENV]: 'other/site.lock.yaml' })).toBe(
			'other/site.lock.yaml',
		)
	})

	it('loads a lock from an explicit path, relative to the root or absolute', () => {
		const resolved = readFileSync(path.join(lockedRoot(), SITE_LOCK_PATH), 'utf8')
		const root = makeRoot({ 'other/one.lock.yaml': resolved })
		const absolute = path.join(makeRoot({ 'one.yaml': resolved }), 'one.yaml')

		expect(loadSiteSection(root, 'content', 'other/one.lock.yaml')).toEqual(
			buildSiteConfig().content,
		)
		expect(loadSiteSection(makeRoot(), 'content', absolute)).toEqual(buildSiteConfig().content)
		expect(() => loadSiteSection(root, 'content', 'missing.yaml')).toThrow(
			'missing.yaml: missing; run astrum-scena config resolve',
		)
		vi.stubEnv(SITE_LOCK_ENV, absolute)
		try {
			expect(loadSiteConfig(makeRoot())).toEqual(buildSiteConfig())
		} finally {
			vi.stubEnv(SITE_LOCK_ENV, '')
		}
	})

	it('rejects a lock that leaves out a branch with a default, naming its path', () => {
		const viewer = lockedRoot((lock) => delete object(lock.site.viewer).counter)
		const theme = lockedRoot((lock) => delete lock.site.theme)
		// a branch a transform fills in rather than a field default
		const images = lockedRoot((lock) => delete object(lock.site.images).publicPath)

		for (const load of [loadSiteConfig, loadSeoConfig])
			expect(() => load(viewer)).toThrow(
				`${SITE_LOCK_PATH}: site.viewer.counter: missing; run astrum-scena config resolve`,
			)
		expect(() => loadSiteConfig(theme)).toThrow(`${SITE_LOCK_PATH}: site.theme: missing`)
		expect(() => loadImageConfig(images)).toThrow(
			`${SITE_LOCK_PATH}: site.images.publicPath: missing`,
		)
	})

	it('rejects a value parsing would change, naming its path', () => {
		const root = lockedRoot((lock) => {
			object(object(lock.site.identity).title).en = '  Padded  '
		})

		expect(() => loadSiteConfig(root)).toThrow(
			`${SITE_LOCK_PATH}: site.identity.title.en: not in its resolved form`,
		)
	})

	it('rejects an unknown key in the lock at any depth with its path', () => {
		const message = (key: string) => `${SITE_LOCK_PATH}: ${key}: unrecognized key`

		expect(() => loadSiteConfig(lockedRoot((lock) => (lock.site.extra = 1)))).toThrow(
			message('site.extra'),
		)
		expect(() => loadSiteConfig(lockedRoot((lock) => (lock.extra = 1)))).toThrow(
			message('extra'),
		)
		const ladder = lockedRoot((lock) => {
			object(object(lock.site.images).ladder).widthz = [1]
		})
		expect(() => loadImageConfig(ladder)).toThrow(message('site.images.ladder.widthz'))
	})

	it('keeps the path of an unknown key inside a union branch', () => {
		const root = lockedRoot((lock) => {
			object(object(lock.site.footer).recentWorks).countz = 6
		})

		expect(() => loadSiteConfig(root)).toThrow(
			`${SITE_LOCK_PATH}: site.footer.recentWorks.countz: unrecognized key`,
		)
	})

	it('rejects a collection version the core does not read, listing the ones it does', () => {
		const root = lockedRoot((lock) => (object(lock.collections).albums = 1))
		const supported = COLLECTION_VERSIONS.albums!.join(', ')

		for (const load of [loadSiteConfig, loadSeoConfig])
			expect(() => load(root)).toThrow(
				`${SITE_LOCK_PATH}: collections.albums: version 1 is not supported; supported: ${supported}; see UPGRADING.md`,
			)
	})

	it('requires the version of every collection of the core and of the enabled modules, and no other', () => {
		const missing = lockedRoot((lock) => delete object(lock.collections).photos)
		const unknown = lockedRoot((lock) => (object(lock.collections).tours = 1))
		const none = lockedRoot((lock) => delete lock.collections)
		const moduleMissing = lockedRoot((lock) => delete object(lock.collections).courses)
		const moduleDisabled = lockedRoot((lock) => {
			lock.site.modules = {}
			lock.site.menu = {
				...object(lock.site.menu),
				items: (object(lock.site.menu).items as { segment: string }[]).filter(
					(item) => item.segment !== 'courses',
				),
			}
		})

		expect(() => loadSiteConfig(missing)).toThrow(
			`${SITE_LOCK_PATH}: collections.photos: missing; run astrum-scena config resolve`,
		)
		expect(() => loadSiteConfig(unknown)).toThrow(
			`${SITE_LOCK_PATH}: collections.tours: unrecognized key`,
		)
		expect(() => loadSiteConfig(none)).toThrow(`${SITE_LOCK_PATH}: collections: missing`)
		expect(() => loadSiteConfig(moduleMissing)).toThrow(
			`${SITE_LOCK_PATH}: collections.courses: missing; run astrum-scena config resolve`,
		)
		expect(() => loadSiteConfig(moduleDisabled)).toThrow(
			`${SITE_LOCK_PATH}: collections.courses: module "courses" is not enabled; run astrum-scena config resolve`,
		)
	})

	it('checks the versions of the lock and of its site config before the schema', () => {
		const lockVersion = lockedRoot((lock) => (lock.schemaVersion = 2))
		const noVersion = lockedRoot((lock) => delete lock.schemaVersion)
		const siteVersion = lockedRoot((lock) => (lock.site.schemaVersion = 1))

		expect(() => loadSiteConfig(lockVersion)).toThrow(
			`${SITE_LOCK_PATH}: schemaVersion 2 is not supported; supported: 1`,
		)
		expect(() => loadSiteConfig(noVersion)).toThrow(
			`${SITE_LOCK_PATH}: missing schemaVersion; supported: 1`,
		)
		expect(() => loadSiteConfig(siteVersion)).toThrow(
			`${SITE_LOCK_PATH}: site: schemaVersion 1 is not supported; supported: 4; see UPGRADING.md`,
		)
	})

	it.each(Object.entries(RETIRED_CONFIG_FILES))(
		'fails while %s is left beside the site config, naming it and the migration',
		(file, fate) => {
			const root = lockedRoot()
			mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
			writeFileSync(path.join(root, file), 'schemaVersion: 1\n')

			for (const load of [loadSiteConfig, loadSeoConfig, loadImageConfig])
				expect(() => load(root)).toThrow(`${file}: ${fate}; see UPGRADING.md`)
		},
	)

	it('names each retired file with the section it went to', () => {
		expect(RETIRED_CONFIG_FILES).toEqual({
			'src/config/site.yaml': 'moved to site.yaml at the site root',
			'src/config/seo.yaml': 'folded into site.yaml (seo)',
			'config/images.yaml': 'folded into site.yaml (images)',
		})
	})
})

// the three files of the old shape (a copy of the demo's before the merge) and the steps of
// UPGRADING.md: nest seo.yaml and images.yaml under `seo` and `images` without their schemaVersion,
// raise the site's to 2, write the result to the site root, delete the old three and resolve the lock;
// then the later step to 3, the course settings moved into `modules.courses`
describe('upgrade from the three-file shape', () => {
	const legacyRoot = path.join(import.meta.dirname, '__fixtures__', 'three-file-site')
	const readLegacy = (file: string) =>
		parse(readFileSync(path.join(legacyRoot, file), 'utf8')) as Record<string, unknown>
	const without = (value: object, ...keys: string[]) =>
		Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)))
	const unversioned = (file: string) => without(readLegacy(file), 'schemaVersion')

	// the step from 3 to 4 changes only the number on a two-locale site
	const upgraded = (): string =>
		writeSiteFiles(makeRoot(), {
			...withCoursesModule({
				...readLegacy('src/config/site.yaml'),
				schemaVersion: 2,
				seo: unversioned('src/config/seo.yaml'),
				images: unversioned('config/images.yaml'),
			}),
			schemaVersion: 4,
		})

	it('fails on the old shape, naming the first file to move', () => {
		expect(() => loadSiteConfig(legacyRoot)).toThrow(
			'src/config/site.yaml: moved to site.yaml at the site root; see UPGRADING.md',
		)
	})

	it('keeps the effective site, seo and image config, equal to the demo after the merge', () => {
		const root = upgraded()
		const { seo, images } = loadSiteConfig(root)

		const site = without(loadSiteConfig(root), 'schemaVersion', 'seo', 'images') as {
			theme: Record<string, unknown>
			content: SiteConfig['content']
		}
		// defaults the core gained after the merge are not in the old file
		const { favicon, ...theme } = site.theme
		expect(favicon).toEqual({ background: '#1b1b1f', foreground: '#fcbf00' })
		const { catalog, taxonomy, ...content } = site.content
		expect(catalog).toEqual(effectiveCatalog(content.locales, {}))
		expect(taxonomy).toEqual(DEFAULT_TAXONOMY)
		expect({ ...site, theme, content }).toEqual(
			without(withCoursesModule(unversioned('src/config/site.yaml')), 'schemaVersion'),
		)
		expect(seo).toEqual(unversioned('src/config/seo.yaml'))
		expect(loadSeoConfig(root)).toEqual(seo)
		expect(images).toEqual(unversioned('config/images.yaml'))
		expect(loadImageConfig(root)).toEqual(images)
		expect(loadSiteConfig(root)).toEqual(loadSiteConfig(siteRoot))
	})
})
