import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GATES, IMAGE_COMMANDS } from '../packages/core/src/cli/registry.ts'
import { loadSiteConfig, loadSiteSection } from '../packages/core/src/config/loader.ts'
import { type CoreManifest, declaredSpecifiers } from '../packages/core/src/eslint.ts'
import { slugCollisions } from '../packages/core/src/modules/collisions.ts'
import { coursesModule } from '../packages/core/src/modules/courses/manifest.ts'
import { REPLACEMENT_POINTS } from '../packages/core/src/overrides/points.ts'
import {
	AGENTS_BLOCK_MARKERS,
	allowBuildsSection,
	assertBuildRejectsBadTheme,
	assertBuildRejectsDisabledModuleContent,
	assertBuildRejectsSlugCollision,
	assertBuildRejectsUnknownPoint,
	assertContentCommands,
	assertCoreOnlyClass,
	assertCoreVersionGate,
	assertDemoImages,
	assertDemoPages,
	assertFactcheckCommands,
	assertImageCommands,
	assertInstall,
	assertNoCourses,
	assertSiteEslint,
	assertSiteFormatters,
	assertSiteGates,
	BAD_THEME_ERROR,
	BAD_THEME_TOKEN,
	type BinRunner,
	CORE_ONLY_CLASS,
	CORE_VERSION_PROBE,
	type DemoAlbum,
	DISABLED_MODULE_CONTENT_ERROR,
	ESLINT_PROBE,
	expectedCorePages,
	expectedDemoPages,
	exportTargets,
	INLINE_CONFIG_RULE,
	INSTALLED_CONFIGS,
	INTERNAL_SPECIFIER,
	LEGAL_FILES,
	loadDemoAlbums,
	loadFeaturedSlideCount,
	MARKDOWN_PROBE,
	missingLegalFiles,
	outArg,
	packageExportProblems,
	portableManifest,
	presetProblems,
	presetVerdicts,
	PRETTIER_PROBE,
	PRETTIER_PROBE_FORMATTED,
	resolveFromSite,
	SITE_GATES_SCRIPT,
	SITE_LINT_PACKAGES,
	siteCoreBin,
	siteLintDevDependencies,
	SLUG_COLLISION_ERROR,
	SLUG_COLLISION_PAGE,
	UNKNOWN_POINT_ERROR,
	UNKNOWN_POINT_FILE,
	withoutCoursesModule,
} from './build-demo-from-pack.ts'

const ALBUMS: DemoAlbum[] = [{ id: 'dunes', photoIds: ['dawn', 'dusk'] }]

const withDist = (files: Record<string, string>, check: (dist: string) => void) => {
	const dist = mkdtempSync(join(tmpdir(), 'demo-dist-'))
	try {
		for (const [file, content] of Object.entries(files)) {
			mkdirSync(dirname(join(dist, file)), { recursive: true })
			writeFileSync(join(dist, file), content)
		}
		check(dist)
	} finally {
		rmSync(dist, { recursive: true, force: true })
	}
}

const emptyPages = (pages: string[]): Record<string, string> =>
	Object.fromEntries(pages.map((page) => [page, '']))

describe('assertDemoPages', () => {
	it('passes when every expected page is built', () => {
		withDist(emptyPages(expectedDemoPages(['en', 'ru'], ALBUMS)), (dist) =>
			expect(() => assertDemoPages(dist, ['en', 'ru'], ALBUMS)).not.toThrow(),
		)
	})

	it('names the missing document pages', () => {
		const pages = expectedDemoPages(['en', 'ru'], ALBUMS).filter(
			(page) =>
				!page.startsWith('ru/privacy/') && page !== 'en/portfolio/dunes/dusk/index.html',
		)
		withDist(emptyPages(pages), (dist) =>
			expect(() => assertDemoPages(dist, ['en', 'ru'], ALBUMS)).toThrow(
				'dist lacks demo pages: ru/privacy/index.html, en/portfolio/dunes/dusk/index.html',
			),
		)
	})
})

describe('expectedCorePages', () => {
	it('expects the home, portfolio, articles, courses and contacts of every locale, then rights and status', () => {
		expect(expectedCorePages(['en', 'ru'])).toEqual([
			'en/index.html',
			'en/portfolio/index.html',
			'en/articles/index.html',
			'en/courses/index.html',
			'en/contacts/index.html',
			'ru/index.html',
			'ru/portfolio/index.html',
			'ru/articles/index.html',
			'ru/courses/index.html',
			'ru/contacts/index.html',
			'rights/index.html',
			'status/index.html',
		])
	})
})

describe('expectedDemoPages', () => {
	it('adds the documents, the albums and their photos of every locale to the core pages', () => {
		expect(expectedDemoPages(['en', 'ru'], ALBUMS)).toEqual([
			...expectedCorePages(['en', 'ru']),
			'en/privacy/index.html',
			'en/articles/reading-the-light/index.html',
			'en/courses/night-sky-workshop/index.html',
			'ru/privacy/index.html',
			'ru/articles/reading-the-light/index.html',
			'ru/courses/night-sky-workshop/index.html',
			'en/portfolio/dunes/index.html',
			'en/portfolio/dunes/dawn/index.html',
			'en/portfolio/dunes/dusk/index.html',
			'ru/portfolio/dunes/index.html',
			'ru/portfolio/dunes/dawn/index.html',
			'ru/portfolio/dunes/dusk/index.html',
		])
	})
})

describe('loadDemoAlbums', () => {
	it('reads the albums of the demo and their photos', () => {
		const albums = loadDemoAlbums('demo')
		expect(albums.length).toBeGreaterThan(0)
		for (const album of albums) expect(album.photoIds.length).toBeGreaterThan(0)
	})

	it('reads .yml albums too, with the id lacking either extension', () => {
		withDist(
			{
				'src/content/albums/dunes.yaml': 'photoIds: [dawn]\n',
				'src/content/albums/tides.yml': 'photoIds: [ebb]\n',
			},
			(site) =>
				expect(loadDemoAlbums(site)).toEqual([
					{ id: 'dunes', photoIds: ['dawn'] },
					{ id: 'tides', photoIds: ['ebb'] },
				]),
		)
	})
})

describe('assertDemoImages', () => {
	const picture = (url: string) =>
		`<picture><source type="image/avif" srcset="${url}.avif 200w"><source type="image/webp" srcset="${url}.webp 200w"><img src="${url}.webp"></picture>`
	const URL = '/media/dawn/200w-a'
	const SLIDE = '<div class="swiper-slide"></div>'
	const slider = (...slides: string[]) =>
		`<div class="swiper hero-swiper"><div class="swiper-wrapper">${SLIDE}${slides.join('')}</div></div>`
	const site = (overrides: Record<string, string> = {}): Record<string, string> => {
		const pages = ['en', 'ru'].flatMap((locale) =>
			['dunes/', 'dunes/dawn/', 'dunes/dusk/'].map(
				(page) => `${locale}/portfolio/${page}index.html`,
			),
		)
		return {
			...Object.fromEntries(pages.map((page) => [page, picture(URL)])),
			'en/index.html': slider(`<div class="swiper-slide">${picture(URL)}</div>`),
			'ru/index.html': slider(SLIDE),
			[`${URL.slice(1)}.avif`]: '',
			[`${URL.slice(1)}.webp`]: '',
			...overrides,
		}
	}

	it('passes when every page has its picture and every image is built', () => {
		withDist(site(), (dist) =>
			expect(() => assertDemoImages(dist, ['en', 'ru'], ALBUMS, 2)).not.toThrow(),
		)
	})

	it('names a page without a picture, a fallback home page and a missing image', () => {
		const files = site({
			'ru/portfolio/dunes/dusk/index.html': '<img src="/media/dusk/200w-b.webp">',
			'ru/index.html': '<nav class="home-fallback"></nav>',
		})
		withDist(files, (dist) => {
			let message = ''
			try {
				assertDemoImages(dist, ['en', 'ru'], ALBUMS, 2)
			} catch (error) {
				message = (error as Error).message
			}
			expect(message).toContain('ru/portfolio/dunes/dusk/index.html has no <picture>')
			expect(message).toContain(
				'ru/portfolio/dunes/dusk/index.html lacks <source type="image/avif" srcset="/media/',
			)
			expect(message).toContain('ru/index.html shows the fallback home page')
			expect(message).toContain('dist lacks images: /media/dusk/200w-b.webp')
		})
	})

	it('names a home page whose slider lacks the featured slides', () => {
		withDist(site({ 'ru/index.html': slider() }), (dist) =>
			expect(() => assertDemoImages(dist, ['en', 'ru'], ALBUMS, 2)).toThrow(
				'ru/index.html renders 1 slides, featured/home.yaml has 2',
			),
		)
		const empty = '<div class="swiper hero-swiper"><div class="swiper-wrapper"></div></div>'
		withDist(site({ 'en/index.html': empty }), (dist) =>
			expect(() => assertDemoImages(dist, ['en', 'ru'], ALBUMS, 2)).toThrow(
				'en/index.html renders 0 slides, featured/home.yaml has 2',
			),
		)
	})
})

describe('assertCoreOnlyClass', () => {
	// the sources a site and the core feed to Tailwind, without the tests and fixtures the package
	// leaves out
	const sources = (directory: string): string[] =>
		readdirSync(directory, { recursive: true, encoding: 'utf8' })
			.filter(
				(file) =>
					/\.(?:astro|tsx?|css|mdx?|ya?ml)$/.test(file) &&
					!/\.test\.tsx?$|__fixtures__|test-fixtures|config\/fixtures/.test(file),
			)
			.map((file) => readFileSync(join(directory, file), 'utf8'))

	it('names a class the core uses and the demo does not', () => {
		const pattern = new RegExp(`(?<![\\w-])${CORE_ONLY_CLASS}(?![\\w-])`)
		expect(sources('packages/core/src').some((text) => pattern.test(text))).toBe(true)
		expect(sources('demo/src').some((text) => pattern.test(text))).toBe(false)
	})

	it('passes when the CSS has the rule and fails without it', () => {
		const rule = `.${CORE_ONLY_CLASS}{color:var(--color-menulink)}`
		withDist({ '_astro/shell.css': `.a{}${rule}` }, (dist) =>
			expect(() => assertCoreOnlyClass(dist)).not.toThrow(),
		)
		// a longer class or the name in the markup is not the rule
		const longer = `.${CORE_ONLY_CLASS}-hover{color:var(--color-menulink-hover)}`
		withDist({ '_astro/shell.css': longer, 'index.html': rule }, (dist) =>
			expect(() => assertCoreOnlyClass(dist)).toThrow(
				`the CSS of dist/_astro lacks .${CORE_ONLY_CLASS}`,
			),
		)
	})

	it('takes the class only as a selector of a rule, never in a comment or a string', () => {
		withDist({ '_astro/shell.css': `.a,.${CORE_ONLY_CLASS}:hover{color:red}` }, (dist) =>
			expect(() => assertCoreOnlyClass(dist)).not.toThrow(),
		)
		for (const css of [
			`/* .${CORE_ONLY_CLASS}{color:red} */.a{}`,
			`.a{content:".${CORE_ONLY_CLASS}{"}`,
			`.a{color:red}.${CORE_ONLY_CLASS}`,
		])
			withDist({ '_astro/shell.css': css }, (dist) =>
				expect(() => assertCoreOnlyClass(dist), css).toThrow(
					`the CSS of dist/_astro lacks .${CORE_ONLY_CLASS}`,
				),
			)
	})
})

describe('assertBuildRejectsBadTheme', () => {
	const THEME = ':root {\n\t--color-accent: #fff;\n}\n'
	const withSite = (check: (site: string, theme: string) => void) =>
		withDist({ 'src/theme/theme.css': THEME }, (site) =>
			check(site, join(site, 'src', 'theme', 'theme.css')),
		)

	it('passes when the build fails naming the token, and restores the theme', () => {
		withSite((site, theme) => {
			let built = ''
			assertBuildRejectsBadTheme(site, () => {
				built = readFileSync(theme, 'utf8')
				return { status: 1, output: `[ERROR]\n  ${BAD_THEME_ERROR}\n` }
			})
			expect(built).toContain(`${BAD_THEME_TOKEN}: red;`)
			expect(readFileSync(theme, 'utf8')).toBe(THEME)
		})
	})

	it('fails when the build passes or fails for another reason', () => {
		withSite((site, theme) => {
			expect(() =>
				assertBuildRejectsBadTheme(site, () => ({ status: 0, output: '' })),
			).toThrow(`the packed demo built with ${BAD_THEME_TOKEN} in its theme`)
			expect(() =>
				assertBuildRejectsBadTheme(site, () => ({ status: 1, output: 'out of memory' })),
			).toThrow(`failed without "${BAD_THEME_ERROR}"`)
			expect(readFileSync(theme, 'utf8')).toBe(THEME)
		})
	})

	it('restores the theme when the build throws', () => {
		withSite((site, theme) => {
			expect(() =>
				assertBuildRejectsBadTheme(site, () => {
					throw new Error('spawn failed')
				}),
			).toThrow('spawn failed')
			expect(readFileSync(theme, 'utf8')).toBe(THEME)
		})
	})
})

describe('assertBuildRejectsUnknownPoint', () => {
	const LOGO = '<b>mark</b>\n'
	const withSite = (check: (site: string) => void) =>
		withDist({ 'src/overrides/logo.astro': LOGO }, check)

	it('expects the message the core gives for its own points', () => {
		expect(UNKNOWN_POINT_ERROR).toContain(`known: ${REPLACEMENT_POINTS.join(', ')}`)
	})

	it('passes when the build fails naming the file, and removes the file', () => {
		withSite((site) => {
			let present = false
			assertBuildRejectsUnknownPoint(site, () => {
				present = existsSync(join(site, UNKNOWN_POINT_FILE))
				return { status: 1, output: `[ERROR]\n  ${UNKNOWN_POINT_ERROR}\n` }
			})
			expect(present).toBe(true)
			expect(existsSync(join(site, UNKNOWN_POINT_FILE))).toBe(false)
			expect(readFileSync(join(site, 'src/overrides/logo.astro'), 'utf8')).toBe(LOGO)
		})
	})

	it('fails when the build passes or fails for another reason, or the file exists', () => {
		withSite((site) => {
			expect(() =>
				assertBuildRejectsUnknownPoint(site, () => ({ status: 0, output: '' })),
			).toThrow(`the packed demo built with ${UNKNOWN_POINT_FILE}, an unknown point`)
			expect(() =>
				assertBuildRejectsUnknownPoint(site, () => ({
					status: 1,
					output: 'out of memory',
				})),
			).toThrow(`failed without "${UNKNOWN_POINT_ERROR}"`)
			expect(existsSync(join(site, UNKNOWN_POINT_FILE))).toBe(false)
			writeFileSync(join(site, UNKNOWN_POINT_FILE), '')
			expect(() =>
				assertBuildRejectsUnknownPoint(site, () => ({ status: 1, output: '' })),
			).toThrow('already exists')
		})
	})

	it('removes the file when the build throws', () => {
		withSite((site) => {
			expect(() =>
				assertBuildRejectsUnknownPoint(site, () => {
					throw new Error('spawn failed')
				}),
			).toThrow('spawn failed')
			expect(existsSync(join(site, UNKNOWN_POINT_FILE))).toBe(false)
		})
	})
})

describe('loadFeaturedSlideCount', () => {
	it('counts the slides of the demo home page', () => {
		expect(loadFeaturedSlideCount('demo')).toBe(3)
	})
})

describe('allowBuildsSection', () => {
	it('copies only the allowBuilds block of the workspace file', () => {
		const yaml =
			'packages:\n    - demo\nallowBuilds:\n    esbuild: true\n    sharp: true\nother: 1\n'
		expect(allowBuildsSection(yaml)).toBe('allowBuilds:\n    esbuild: true\n    sharp: true\n')
	})

	it('reads the real pnpm-workspace.yaml and fails without the block', () => {
		expect(allowBuildsSection(readFileSync('pnpm-workspace.yaml', 'utf8'))).toMatch(
			/^allowBuilds:\n/,
		)
		expect(() => allowBuildsSection('packages:\n    - demo\n')).toThrow('allowBuilds')
	})
})

describe('outArg', () => {
	it('keeps the temp-dir build without --out', () => {
		expect(outArg(['node', 'build-demo-from-pack.ts', '--keep'])).toBeUndefined()
	})

	it('resolves the lasting directory against cwd', () => {
		expect(outArg(['node', 'build-demo-from-pack.ts', '--out', '.cache/demo'])).toBe(
			resolve('.cache/demo'),
		)
	})

	it('fails on --out without a directory', () => {
		for (const argv of [['--out'], ['--out', '--keep']])
			expect(() => outArg(argv)).toThrow('--out needs a directory')
	})
})

describe('packed package exports', () => {
	const NAME = '@picasso-ai/astrum-scena'
	const EXPORTS = {
		'.': { types: './dist/index.d.ts', default: './dist/index.js' },
		'./collections': { types: './dist/collections.d.ts', default: './dist/collections.js' },
	}
	const SHIPPED = [
		'dist/index.d.ts',
		'dist/index.js',
		'dist/collections.d.ts',
		'dist/collections.js',
		'src/index.ts',
	]
	// a site with the package installed under node_modules, as the tarball install leaves it
	const withPackage = <T>(
		exports: Record<string, unknown>,
		files: Record<string, string>,
		check: (site: string, packageDir: string, manifest: CoreManifest) => T,
	): T => {
		const site = realpathSync(mkdtempSync(join(tmpdir(), 'packed-exports-')))
		try {
			const packageDir = join(site, 'node_modules', ...NAME.split('/'))
			const manifest: CoreManifest = { name: NAME, exports }
			for (const [file, content] of Object.entries(files)) {
				mkdirSync(dirname(join(packageDir, file)), { recursive: true })
				writeFileSync(join(packageDir, file), content)
			}
			writeFileSync(
				join(packageDir, 'package.json'),
				JSON.stringify({ ...manifest, type: 'module' }),
			)
			return check(site, packageDir, manifest)
		} finally {
			rmSync(site, { recursive: true, force: true })
		}
	}
	const SPECIFIERS = (manifest: CoreManifest) => [
		...declaredSpecifiers(manifest),
		INTERNAL_SPECIFIER,
	]
	const problemsOf = (
		exports: Record<string, unknown>,
		files = Object.fromEntries(SHIPPED.map((file) => [file, ''])),
	): string[] =>
		withPackage(exports, files, (site, packageDir, manifest) =>
			packageExportProblems(
				packageDir,
				manifest,
				resolveFromSite(site, SPECIFIERS(manifest)),
			),
		)

	it('lists every target under every condition', () => {
		expect(exportTargets(EXPORTS)).toEqual([
			'./dist/index.d.ts',
			'./dist/index.js',
			'./dist/collections.d.ts',
			'./dist/collections.js',
		])
	})

	it('passes when every entry point resolves to a shipped file and internals are refused', () => {
		expect(problemsOf(EXPORTS)).toEqual([])
	})

	it('fails on an entry point added to exports without its dist file', () => {
		const problems = problemsOf({
			...EXPORTS,
			'./x': { types: './dist/x.d.ts', default: './dist/x.js' },
		})
		expect(problems).toContain('exports target ./dist/x.js is not a file in the package')
		expect(problems).toContain('exports target ./dist/x.d.ts is not a file in the package')
		expect(
			problems.some((problem) => problem.startsWith(`${NAME}/x resolves to a missing file`)),
		).toBe(true)
	})

	it('fails when exports let the internal source resolve', () => {
		const problems = problemsOf({ ...EXPORTS, './src/index.ts': './src/index.ts' })
		expect(problems).toHaveLength(1)
		expect(problems[0]).toMatch(
			`${INTERNAL_SPECIFIER} must fail with ERR_PACKAGE_PATH_NOT_EXPORTED`,
		)
	})

	it('fails on an exports target that is a directory', () => {
		const problems = problemsOf(
			{ ...EXPORTS, './dir': './dist/dir' },
			Object.fromEntries([...SHIPPED, 'dist/dir/inner.js'].map((file) => [file, ''])),
		)
		expect(problems).toContain('exports target ./dist/dir is not a file in the package')
		expect(
			problems.some((problem) =>
				problem.startsWith(`${NAME}/dir resolves to a missing file`),
			),
		).toBe(true)
	})

	// a stand-in for the packed `./eslint` entry point, built on the given import regex
	const presetCheck = (regex: string) => {
		const exports = { ...EXPORTS, './eslint': './dist/eslint.js' }
		const preset = `export const deepImportRules = () => ({ patterns: [{ regex: ${JSON.stringify(regex)}, caseSensitive: true }] })\n`
		return withPackage(
			exports,
			{
				...Object.fromEntries(SHIPPED.map((file) => [file, ''])),
				'dist/eslint.js': preset,
			},
			(site, _packageDir, manifest) =>
				presetProblems(manifest, presetVerdicts(site, SPECIFIERS(manifest))),
		)
	}

	it('passes when the installed preset allows every entry point and restricts internals', () => {
		expect(presetCheck(`^${NAME}/(?!(collections|eslint)$)`)).toEqual([])
	})

	it('fails when the installed preset restricts a declared entry point', () => {
		expect(presetCheck(`^${NAME}(/|$)`)).toEqual([
			`the installed ${NAME}/eslint preset does not allow ${NAME}`,
			`the installed ${NAME}/eslint preset does not allow ${NAME}/collections`,
			`the installed ${NAME}/eslint preset does not allow ${NAME}/eslint`,
		])
	})

	it('fails when the installed preset lets an internal path through', () => {
		expect(presetCheck('^never$')).toEqual([
			`the installed ${NAME}/eslint preset does not restrict ${INTERNAL_SPECIFIER}`,
		])
	})
})

describe('the demo without the courses module', () => {
	const withDemoCopy = (check: (site: string) => void) => {
		const work = mkdtempSync(join(tmpdir(), 'demo-without-module-'))
		const site = join(work, 'site')
		try {
			cpSync('demo', site, {
				recursive: true,
				filter: (source) => !/(^|\/)(node_modules|dist|\.astro)$/.test(source),
			})
			check(site)
		} finally {
			rmSync(work, { recursive: true, force: true })
		}
	}
	const snapshot = (site: string) =>
		readdirSync(site, { recursive: true, encoding: 'utf8' })
			.sort()
			.map((file) => {
				const path = join(site, file)
				return existsSync(path) && !statSync(path).isDirectory()
					? `${file}\n${readFileSync(path, 'utf8')}`
					: file
			})
			.join('\n')
	const COURSES = join('src', 'content', 'courses')

	it('runs the build on a site without the module, its targets and, unless kept, its content', () => {
		withDemoCopy((site) => {
			const before = snapshot(site)
			for (const keepContent of [true, false]) {
				withoutCoursesModule(site, { keepContent }, () => {
					const config = loadSiteConfig(site)
					expect(config.modules).toEqual({})
					expect(config.menu.items.map((item) => item.segment)).not.toContain('courses')
					expect(existsSync(join(site, COURSES))).toBe(keepContent)
					expect(
						readFileSync(
							join(site, 'src', 'content', 'pages', 'blocks.en.mdx'),
							'utf8',
						),
					).not.toContain('kind: course')
				})
				expect(snapshot(site)).toBe(before)
			}
		})
	})

	it('restores the site when the build throws', () => {
		withDemoCopy((site) => {
			const before = snapshot(site)
			expect(() =>
				withoutCoursesModule(site, { keepContent: false }, () => {
					throw new Error('spawn failed')
				}),
			).toThrow('spawn failed')
			expect(snapshot(site)).toBe(before)
		})
	})

	it('expects the build with the content of the disabled module to fail naming it', () => {
		withDemoCopy((site) => {
			expect(() =>
				assertBuildRejectsDisabledModuleContent(site, () => ({
					status: 1,
					output: `[ERROR] ${DISABLED_MODULE_CONTENT_ERROR}\n`,
				})),
			).not.toThrow()
			expect(() =>
				assertBuildRejectsDisabledModuleContent(site, () => ({ status: 0, output: '' })),
			).toThrow('the packed demo built with course content while the module was disabled')
			expect(() =>
				assertBuildRejectsDisabledModuleContent(site, () => ({
					status: 1,
					output: 'out of memory',
				})),
			).toThrow(`failed without "${DISABLED_MODULE_CONTENT_ERROR}"`)
		})
	})

	it('finds a course page or a course URL of the sitemap in the build', () => {
		withDist({ 'en/index.html': '', 'sitemap-0.xml': '<loc>/en/</loc>' }, (dist) =>
			expect(() => assertNoCourses(dist, ['en', 'ru'])).not.toThrow(),
		)
		withDist(
			{
				'ru/courses/index.html': '',
				'sitemap-0.xml': '<loc>https://demo.example.com/en/courses/</loc>',
			},
			(dist) =>
				expect(() => assertNoCourses(dist, ['en', 'ru'])).toThrow(
					'dist has ru/courses/\n  sitemap-0.xml lists a /courses/ URL',
				),
		)
	})
})

describe('assertBuildRejectsSlugCollision', () => {
	const withSite = (check: (site: string, pages: string) => void) =>
		withDist(
			{
				'site.lock.yaml': readFileSync('demo/site.lock.yaml', 'utf8'),
				'src/content/pages/privacy.en.mdx': 'privacy\n',
			},
			(site) => check(site, join(site, 'src', 'content', 'pages')),
		)
	const pageFiles = (pages: string) =>
		readdirSync(pages).filter((file) => file.startsWith(SLUG_COLLISION_PAGE))

	it('expects the message of the collision gate for the courses segment', () => {
		expect(
			slugCollisions([{ id: SLUG_COLLISION_PAGE, slug: 'courses' }], [coursesModule]),
		).toEqual([SLUG_COLLISION_ERROR])
	})

	it('builds with the page in every demo locale, then removes it', () => {
		withSite((site, pages) => {
			let written: string[] = []
			let text = ''
			assertBuildRejectsSlugCollision(site, () => {
				written = pageFiles(pages).sort()
				text = readFileSync(join(pages, written[0]!), 'utf8')
				return { status: 1, output: `[ERROR] ${SLUG_COLLISION_ERROR}\n` }
			})
			expect(written).toEqual(
				loadSiteSection('demo', 'content')
					.locales.map((locale) => `${SLUG_COLLISION_PAGE}.${locale}.md`)
					.sort(),
			)
			expect(text).toContain('slug: courses')
			expect(pageFiles(pages)).toEqual([])
			expect(readFileSync(join(pages, 'privacy.en.mdx'), 'utf8')).toBe('privacy\n')
		})
	})

	it('fails when the build passes, fails for another reason or throws, and removes the page', () => {
		withSite((site, pages) => {
			expect(() =>
				assertBuildRejectsSlugCollision(site, () => ({ status: 0, output: '' })),
			).toThrow('the packed demo built with a page whose slug is the courses segment')
			expect(() =>
				assertBuildRejectsSlugCollision(site, () => ({
					status: 1,
					output: 'out of memory',
				})),
			).toThrow(`failed without "${SLUG_COLLISION_ERROR}"`)
			expect(() =>
				assertBuildRejectsSlugCollision(site, () => {
					throw new Error('spawn failed')
				}),
			).toThrow('spawn failed')
			expect(pageFiles(pages)).toEqual([])
		})
	})

	it('refuses to overwrite a page of the same name', () => {
		withSite((site, pages) => {
			writeFileSync(join(pages, `${SLUG_COLLISION_PAGE}.en.md`), 'mine\n')
			expect(() =>
				assertBuildRejectsSlugCollision(site, () => ({ status: 1, output: '' })),
			).toThrow('already exists')
			expect(readFileSync(join(pages, `${SLUG_COLLISION_PAGE}.en.md`), 'utf8')).toBe('mine\n')
		})
	})
})

describe('assertImageCommands', () => {
	const HELP = IMAGE_COMMANDS.map(({ name, summary }) => `  ${name.padEnd(28)} ${summary}`).join(
		'\n',
	)
	const NO_SDK =
		'images prune FAIL: the bucket commands need @aws-sdk/client-s3, an optional peer'

	const withSite = (check: (site: string) => void) => {
		const site = mkdtempSync(join(tmpdir(), 'image-commands-'))
		try {
			check(site)
		} finally {
			rmSync(site, { recursive: true, force: true })
		}
	}

	const runner =
		({ help = HELP, prune = { status: 1, output: NO_SDK } } = {}): BinRunner =>
		(_, args) =>
			args.includes('--help') ? { status: 0, output: help } : prune

	it('passes when the help lists every image command and prune asks for the S3 SDK', () => {
		withSite((site) => {
			const calls: string[] = []
			assertImageCommands(site, (cwd, args, env) => {
				calls.push(`${cwd === site} ${args.join(' ')} ${Object.keys(env).length}`)
				return runner()(cwd, args, env)
			})
			expect(calls).toEqual(['true images --help 0', 'true images prune 4'])
		})
	})

	it('fails on a missing command, a bucket command that runs, or an installed SDK', () => {
		withSite((site) => {
			expect(() =>
				assertImageCommands(
					site,
					runner({ help: HELP.replace('images sync', 'images sink') }),
				),
			).toThrow('images --help lists no images sync')
			expect(() =>
				assertImageCommands(
					site,
					runner({ prune: { status: 0, output: 'images prune REPORT' } }),
				),
			).toThrow('did not ask to install it')
			mkdirSync(join(site, 'node_modules', '@aws-sdk', 'client-s3'), { recursive: true })
			expect(() => assertImageCommands(site, runner())).toThrow(
				'an optional peer it must not get',
			)
		})
	})
})

describe('assertContentCommands', () => {
	const REPORT =
		'  current      articles/a (ru)\ncontent translation-marker check — 1 pairs, 0 need review'

	it('runs the translation-marker report in the site and passes on its summary', () => {
		const calls: string[] = []
		assertContentCommands('/site', (cwd, args, env) => {
			calls.push(`${cwd} ${args.join(' ')} ${Object.keys(env).length}`)
			return { status: 0, output: REPORT }
		})
		expect(calls).toEqual(['/site content translation-marker check 0'])
	})

	it('fails on a non-zero exit or a missing summary', () => {
		expect(() =>
			assertContentCommands('/site', () => ({ status: 1, output: 'check FAIL: broken' })),
		).toThrow('exited with 1 in the packed demo:\ncheck FAIL: broken')
		expect(() =>
			assertContentCommands('/site', () => ({ status: 0, output: 'unknown command' })),
		).toThrow('reported no pairs')
		expect(() =>
			assertContentCommands('/site', () => ({
				status: 0,
				output: 'content translation-marker check — 0 pairs, 0 need review',
			})),
		).toThrow('reported no pairs')
	})
})

describe('assertFactcheckCommands', () => {
	const OUTPUT: Record<string, string> = {
		'content factcheck extract': 'content factcheck extract OK',
		'content factcheck review': 'content factcheck review OK',
		'check factcheck': 'check factcheck OK\n  documents: 1, findings: 0',
	}

	it('writes a ledger and its packet in the site, then passes the gate on them', () => {
		const calls: string[] = []
		assertFactcheckCommands('/site', (cwd, args) => {
			calls.push(`${cwd} ${args.join(' ')}`)
			return { status: 0, output: OUTPUT[args.join(' ')]! }
		})
		expect(calls).toEqual([
			'/site content factcheck extract',
			'/site content factcheck review',
			'/site check factcheck',
		])
	})

	it('fails on a non-zero exit and on a gate that found no ledger', () => {
		expect(() =>
			assertFactcheckCommands('/site', () => ({ status: 1, output: 'needs prettier' })),
		).toThrow('content factcheck extract exited with 1 in the packed demo:\nneeds prettier')
		expect(() =>
			assertFactcheckCommands('/site', (_cwd, args) => ({
				status: 0,
				output:
					args[0] === 'check'
						? 'check factcheck OK (no data/factcheck/ledger.yaml; nothing to check)'
						: 'OK',
			})),
		).toThrow('did not check a ledger')
	})
})

describe('assertSiteGates', () => {
	const DEMO_MANIFEST = resolve(import.meta.dirname, '..', 'demo', 'package.json')
	const PASSED = [
		...GATES.map((gate) => `check ${gate} OK`),
		'check color-literals OK (node_modules/.pnpm/core/src, src)',
	].join('\n')

	// a site with the demo's package scripts and, unless `linked` is false, the core's bin
	const withSite = (check: (site: string) => void, { linked = true } = {}) => {
		const site = mkdtempSync(join(tmpdir(), 'site-gates-'))
		try {
			writeFileSync(join(site, 'package.json'), readFileSync(DEMO_MANIFEST, 'utf8'))
			if (linked) {
				mkdirSync(dirname(siteCoreBin(site)), { recursive: true })
				writeFileSync(siteCoreBin(site), '')
			}
			check(site)
		} finally {
			rmSync(site, { recursive: true, force: true })
		}
	}

	it("runs the demo's gate script in the site and passes when every gate is OK", () => {
		withSite((site) => {
			const runs: string[][] = []
			assertSiteGates(site, (cwd, script) => {
				runs.push([cwd, script])
				return { status: 0, output: PASSED }
			})
			expect(runs).toEqual([[site, SITE_GATES_SCRIPT]])
		})
	})

	it('fails without the linked bin, on a failed gate or on core sources outside node_modules', () => {
		withSite(
			(site) =>
				expect(() => assertSiteGates(site, () => ({ status: 0, output: PASSED }))).toThrow(
					'links no astrum-scena bin',
				),
			{ linked: false },
		)
		withSite((site) => {
			expect(() =>
				assertSiteGates(site, () => ({ status: 1, output: 'check pages FAILED' })),
			).toThrow('check pages FAILED')
			expect(() =>
				assertSiteGates(site, () => ({
					status: 0,
					output: PASSED.replace('check pages OK', ''),
				})),
			).toThrow('check pages reported no OK')
			expect(() =>
				assertSiteGates(site, () => ({
					status: 0,
					output: PASSED.replaceAll('(node_modules/', '(../packages/core/'),
				})),
			).toThrow('did not scan the core sources under node_modules')
		})
	})
})

describe('assertCoreVersionGate', () => {
	const REPOSITORY = 'owner/core'
	// a site with the core's package.json under node_modules
	const withSite = (check: (site: string) => void) => {
		const site = mkdtempSync(join(tmpdir(), 'core-version-'))
		try {
			const core = join(site, 'node_modules', '@picasso-ai/astrum-scena')
			mkdirSync(core, { recursive: true })
			writeFileSync(
				join(core, 'package.json'),
				JSON.stringify({
					version: '0.3.1',
					repository: { url: `git+https://github.com/${REPOSITORY}.git` },
				}),
			)
			check(site)
		} finally {
			rmSync(site, { recursive: true, force: true })
		}
	}
	type Call = { workflow?: string; env: Readonly<Record<string, string>> }
	// the gate as the bin runs it: OK without a workflow or with one at the installed version
	const gate =
		(calls: Call[], { rejectStale = true } = {}): BinRunner =>
		(site, args, env) => {
			expect(args).toEqual(['check', 'core-version'])
			const probe = join(site, CORE_VERSION_PROBE)
			const workflow = existsSync(probe) ? readFileSync(probe, 'utf8') : undefined
			calls.push({ ...(workflow === undefined ? {} : { workflow }), env })
			if (workflow === undefined)
				return { status: 0, output: 'check core-version OK (no workflow)' }
			if (workflow.includes('# v0.3.1'))
				return {
					status: 0,
					output: 'check core-version OK (the workflows run site.yml of core 0.3.1)',
				}
			return rejectStale
				? {
						status: 1,
						output: 'ci.yml:4: the comment names v0.4.0, the installed core is 0.3.1',
					}
				: {
						status: 0,
						output: 'check core-version OK (the workflows run site.yml of core 0.3.1)',
					}
		}

	it('passes in CI without a workflow and at the installed version, and rejects another', () => {
		withSite((site) => {
			const calls: Call[] = []
			assertCoreVersionGate(site, gate(calls))
			expect(calls.map(({ env }) => env)).toEqual([
				{ CI: 'true' },
				{ CI: 'true' },
				{ CI: 'true' },
			])
			expect(calls[1]!.workflow).toContain(
				`uses: ${REPOSITORY}/.github/workflows/site.yml@${'0'.repeat(40)} # v0.3.1`,
			)
			expect(calls[2]!.workflow).toContain('# v0.4.0')
			expect(existsSync(join(site, '.github'))).toBe(false)
		})
	})

	it('fails when the gate accepts a workflow of another version', () => {
		withSite((site) => {
			expect(() => assertCoreVersionGate(site, gate([], { rejectStale: false }))).toThrow(
				'did not reject site.yml # v0.4.0',
			)
			expect(existsSync(join(site, '.github'))).toBe(false)
		})
	})

	it('refuses a site that has its own .github', () => {
		withSite((site) => {
			mkdirSync(join(site, '.github'))
			expect(() => assertCoreVersionGate(site, gate([]))).toThrow('.github already exists')
		})
	})
})

describe('assertInstall', () => {
	const OUTPUT: Record<string, string> = {
		install: 'install OK (core 1.0.0: 6 skills, 2 agents; 0 written, 21 unchanged)',
		'check skills': 'check skills OK (6 skills, 2 agents of core 1.0.0)',
	}
	const installedSite = () => {
		const site = mkdtempSync(join(tmpdir(), 'astrum-scena-install-'))
		writeFileSync(join(site, 'AGENTS.md'), `${AGENTS_BLOCK_MARKERS.join('\nrules\n')}\n`)
		for (const file of INSTALLED_CONFIGS) writeFileSync(join(site, file), '\n')
		return site
	}

	it('installs twice, writing nothing the second time, then passes check skills', () => {
		const site = installedSite()
		try {
			const calls: string[] = []
			assertInstall(site, (_cwd, args) => {
				calls.push(args.join(' '))
				return { status: 0, output: OUTPUT[args.join(' ')]! }
			})
			expect(calls).toEqual(['install', 'install', 'check skills'])
		} finally {
			rmSync(site, { recursive: true, force: true })
		}
	})

	it('fails on a failed install, a second run that writes, a failed gate or a missing file', () => {
		const site = installedSite()
		try {
			expect(() =>
				assertInstall(site, () => ({ status: 1, output: 'install FAIL' })),
			).toThrow('install failed in the packed demo')
			expect(() =>
				assertInstall(site, (_cwd, args) => ({
					status: 0,
					output:
						args[0] === 'install'
							? 'install OK (core: 1 written, 0 unchanged)'
							: OUTPUT['check skills']!,
				})),
			).toThrow('a second astrum-scena install wrote files')
			expect(() =>
				assertInstall(site, (_cwd, args) => ({
					status: args[0] === 'check' ? 1 : 0,
					output: OUTPUT[args.join(' ')]!,
				})),
			).toThrow('check skills did not pass')
			rmSync(join(site, INSTALLED_CONFIGS[0]!))
			expect(() =>
				assertInstall(site, (_cwd, args) => ({
					status: 0,
					output: OUTPUT[args.join(' ')]!,
				})),
			).toThrow(`wrote no ${INSTALLED_CONFIGS[0]}`)
		} finally {
			rmSync(site, { recursive: true, force: true })
		}
	})
})

describe('assertSiteEslint', () => {
	const REJECTED = `1:1 error Inline ESLint config is ignored here ${INLINE_CONFIG_RULE}\n2:5 error prefer-const`

	it('lints the site clean, then rejects the probe and removes it', () => {
		const site = mkdtempSync(join(tmpdir(), 'astrum-scena-eslint-'))
		mkdirSync(join(site, 'src'))
		try {
			const calls: string[] = []
			assertSiteEslint(site, (_cwd, args) => {
				calls.push(args.join(' '))
				if (args[0] === '.') return { status: 0, output: '' }
				expect(readFileSync(join(site, ESLINT_PROBE), 'utf8')).toContain('eslint-disable')
				return { status: 1, output: REJECTED }
			})
			expect(calls).toEqual(['. --max-warnings 0', ESLINT_PROBE])
			expect(existsSync(join(site, ESLINT_PROBE))).toBe(false)
			expect(() =>
				assertSiteEslint(site, (_cwd, args) =>
					args[0] === '.' ? { status: 0, output: '' } : { status: 0, output: '' },
				),
			).toThrow(`did not reject an eslint-disable comment with ${INLINE_CONFIG_RULE}`)
			expect(existsSync(join(site, ESLINT_PROBE))).toBe(false)
			expect(() => assertSiteEslint(site, () => ({ status: 1, output: 'x' }))).toThrow(
				"the site's ESLint failed on the packed demo",
			)
		} finally {
			rmSync(site, { recursive: true, force: true })
		}
	})
})

describe('assertSiteFormatters', () => {
	type Result = { status: number; output: string }
	const passing = (site: string, tool: string): Result => {
		if (tool === 'prettier') {
			expect(existsSync(join(site, PRETTIER_PROBE))).toBe(true)
			return { status: 0, output: PRETTIER_PROBE_FORMATTED }
		}
		const text = readFileSync(join(site, MARKDOWN_PROBE), 'utf8')
		return / \n/.test(text)
			? { status: 1, output: `${MARKDOWN_PROBE}:3:17 MD009/no-trailing-spaces` }
			: { status: 0, output: 'Summary: 0 issues' }
	}

	it('formats a probe with Prettier and lints two with markdownlint, removing them', () => {
		const site = mkdtempSync(join(tmpdir(), 'astrum-scena-formatters-'))
		try {
			const calls: string[] = []
			assertSiteFormatters(site, (cwd, tool, args) => {
				calls.push(`${tool} ${args.join(' ')}`)
				return passing(cwd, tool)
			})
			expect(calls).toEqual([
				`prettier ${PRETTIER_PROBE}`,
				`markdownlint-cli2 ${MARKDOWN_PROBE}`,
				`markdownlint-cli2 ${MARKDOWN_PROBE}`,
			])
			expect(existsSync(join(site, PRETTIER_PROBE))).toBe(false)
			expect(existsSync(join(site, MARKDOWN_PROBE))).toBe(false)
		} finally {
			rmSync(site, { recursive: true, force: true })
		}
	})

	it("fails when a tool does not apply the core's preset", () => {
		const site = mkdtempSync(join(tmpdir(), 'astrum-scena-formatters-'))
		try {
			expect(() =>
				assertSiteFormatters(site, (cwd, tool) =>
					tool === 'prettier'
						? { status: 0, output: 'export const probe = { name: "probe" };\n' }
						: passing(cwd, tool),
				),
			).toThrow("Prettier did not format with the core's preset")
			expect(() =>
				assertSiteFormatters(site, (cwd, tool) =>
					tool === 'prettier' ? passing(cwd, tool) : { status: 1, output: 'MD013' },
				),
			).toThrow("markdownlint did not apply the core's preset to a long line")
			expect(() =>
				assertSiteFormatters(site, (cwd, tool) =>
					tool === 'prettier' ? passing(cwd, tool) : { status: 0, output: '' },
				),
			).toThrow('markdownlint did not report trailing spaces')
			expect(existsSync(join(site, MARKDOWN_PROBE))).toBe(false)
		} finally {
			rmSync(site, { recursive: true, force: true })
		}
	})
})

describe('siteLintDevDependencies', () => {
	it('takes the versions of the root, and names a missing one', () => {
		const devDependencies = Object.fromEntries(
			SITE_LINT_PACKAGES.map((name) => [name, '^1.0.0']),
		)
		expect(siteLintDevDependencies({ devDependencies })).toEqual(devDependencies)
		expect(() => siteLintDevDependencies({})).toThrow('no devDependency eslint')
	})
})

describe('portableManifest', () => {
	const devDependencies = Object.fromEntries(SITE_LINT_PACKAGES.map((name) => [name, '^1.0.0']))
	const root = { packageManager: 'pnpm@11.0.0', devDependencies }
	const demo = {
		dependencies: { '@picasso-ai/astrum-scena': 'workspace:*', astro: '^7.0.0' },
		devDependencies: { typescript: '^6.0.0' },
	}

	it('links the core to the tarball beside the manifest and takes pnpm and the lint packages', () => {
		expect(portableManifest(demo, root, 'core-0.1.0.tgz')).toEqual({
			packageManager: 'pnpm@11.0.0',
			dependencies: { '@picasso-ai/astrum-scena': 'file:./core-0.1.0.tgz', astro: '^7.0.0' },
			devDependencies: { typescript: '^6.0.0', ...devDependencies },
		})
	})

	it('fails without the packageManager of the root', () => {
		expect(() => portableManifest(demo, { devDependencies }, 'core-0.1.0.tgz')).toThrow(
			'no packageManager',
		)
	})
})

describe('missingLegalFiles', () => {
	const withFiles = (files: readonly string[]) => {
		const dir = mkdtempSync(join(tmpdir(), 'legal-files-'))
		try {
			for (const file of files) writeFileSync(join(dir, file), '')
			return missingLegalFiles(dir)
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	}

	it('passes a package that carries the licence and the notices', () => {
		expect(withFiles(LEGAL_FILES)).toEqual([])
	})

	it('names each missing file', () => {
		expect(withFiles(['LICENSE'])).toEqual(['THIRD_PARTY_NOTICES.md is not in the package'])
		expect(withFiles([])).toEqual([
			'LICENSE is not in the package',
			'THIRD_PARTY_NOTICES.md is not in the package',
		])
	})
})
