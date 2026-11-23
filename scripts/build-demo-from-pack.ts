import { execFileSync, spawnSync } from 'node:child_process'
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parse as parseYaml } from 'yaml'

import { R2_ENV_VARS } from '../packages/core/src/cli/images/r2-env.ts'
import { BIN, GATES, IMAGE_COMMANDS } from '../packages/core/src/cli/registry.ts'
import { writeSiteFiles } from '../packages/core/src/config/fixtures/site-files.ts'
import { loadSiteConfig, loadSiteSection } from '../packages/core/src/config/loader.ts'
import { type CoreManifest, declaredSpecifiers } from '../packages/core/src/eslint.ts'

// builds the demo the way a site gets the core: from the `pnpm pack` tarball, installed in a directory
// outside any workspace (ADR-0016). `astro build --root <site>` runs with cwd at the work dir, an
// ancestor of the site, so site files must come from the Astro root and not from cwd; outDir stays
// under cwd as Astro requires. The temp dir is taken by its real path: Astro compares outDir with cwd
// as strings, so a symlinked temp dir (macOS) breaks the build.
// `--keep` leaves the directory for inspection; `--out <dir>` builds into a lasting directory instead,
// which the e2e suite previews and whose `site/`, without node_modules and build outputs, CI hands to
// the core's site.yml as the demo site.

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// the lasting build of `pnpm test:e2e`; `.cache/` is gitignored. `E2E_DEMO_DIR` points the runner
// and the Playwright config elsewhere, which only the runner's own test does
export const PACKED_DEMO_DIR = process.env.E2E_DEMO_DIR ?? join(ROOT, '.cache', 'demo-packed')
export const packedSite = (out: string): string => join(out, 'site')
export const siteAstroBin = (site: string): string => join(site, 'node_modules', '.bin', 'astro')
export const siteCoreBin = (site: string): string => join(site, 'node_modules', '.bin', BIN)
const CORE = '@picasso-ai/astrum-scena'
const NOT_COPIED = new Set(['node_modules', 'dist', '.astro'])
const LOCALE_PAGES = ['', 'portfolio/', 'articles/', 'courses/', 'contacts/']
const SERVICE_PAGES = ['rights/', 'status/']
// the documents of the demo content: a page, an article and a course
const DOCUMENT_PAGES = ['privacy/', 'articles/reading-the-light/', 'courses/night-sky-workshop/']

const run = (cwd: string, ...args: string[]) =>
	execFileSync('pnpm', args, { cwd, stdio: 'inherit' })

const localePages = (locales: readonly string[], pages: readonly string[]): string[] =>
	locales.flatMap((locale) => pages.map((page) => `${locale}/${page}index.html`))

// the pages every demo locale gets from the core, and the locale-free service pages
export const expectedCorePages = (locales: readonly string[]): string[] => [
	...localePages(locales, LOCALE_PAGES),
	...SERVICE_PAGES.map((page) => `${page}index.html`),
]

export type DemoAlbum = { id: string; photoIds: readonly string[] }

// each album page and the page of every photo inside it
const portfolioPages = (albums: readonly DemoAlbum[]): string[] =>
	albums.flatMap((album) => [
		`portfolio/${album.id}/`,
		...album.photoIds.map((photoId) => `portfolio/${album.id}/${photoId}/`),
	])

// the core pages plus the demo documents, albums and photos in every locale
export const expectedDemoPages = (
	locales: readonly string[],
	albums: readonly DemoAlbum[],
): string[] => [
	...expectedCorePages(locales),
	...localePages(locales, DOCUMENT_PAGES),
	...localePages(locales, portfolioPages(albums)),
]

const ALBUM_FILE = /\.ya?ml$/

export function loadDemoAlbums(site: string): DemoAlbum[] {
	const directory = join(site, 'src', 'content', 'albums')
	return readdirSync(directory)
		.filter((file) => ALBUM_FILE.test(file))
		.sort()
		.map((file) => {
			const data = parseYaml(readFileSync(join(directory, file), 'utf8')) as {
				photoIds: string[]
			}
			return { id: file.replace(ALBUM_FILE, ''), photoIds: data.photoIds }
		})
}

export function loadFeaturedSlideCount(site: string): number {
	const file = join(site, 'src', 'content', 'featured', 'home.yaml')
	return (parseYaml(readFileSync(file, 'utf8')) as { slides: unknown[] }).slides.length
}

// the site repeats the workspace build-script allowlist, as a thin site keeps its own
export function allowBuildsSection(workspaceYaml: string): string {
	const section = /^allowBuilds:\n(?:[ \t]+.*\n?)+/m.exec(workspaceYaml)?.[0]
	if (!section) throw new Error('pnpm-workspace.yaml has no allowBuilds section')
	return section.endsWith('\n') ? section : `${section}\n`
}

function packCore(site: string): string {
	run(ROOT, '--filter', CORE, 'build')
	run(join(ROOT, 'packages', 'core'), 'pack', '--pack-destination', site)
	const tarballs = readdirSync(site).filter((file) => file.endsWith('.tgz'))
	if (tarballs.length !== 1) throw new Error(`expected one tarball, got ${tarballs.length}`)
	return tarballs[0]!
}

export type SiteManifest = {
	packageManager?: string
	dependencies: Record<string, string>
	devDependencies?: Record<string, string>
}

export type RootManifest = { packageManager?: string; devDependencies?: Record<string, string> }

// the demo's manifest as a portable site: the core from the tarball beside it, by a relative link the
// lockfile keeps, so the site directory installs with --frozen-lockfile wherever it is copied; pnpm
// and the lint packages at the versions of this repository
export function portableManifest(
	manifest: SiteManifest,
	root: RootManifest,
	tarball: string,
): SiteManifest {
	if (!root.packageManager) throw new Error('the root package.json has no packageManager')
	return {
		...manifest,
		packageManager: root.packageManager,
		dependencies: { ...manifest.dependencies, [CORE]: `file:./${tarball}` },
		devDependencies: { ...manifest.devDependencies, ...siteLintDevDependencies(root) },
	}
}

// the site directory is portable: the tarball, pnpm-workspace.yaml, .nvmrc and, after the install,
// the lockfile are inside it, which is what the CI artifact of the demo carries
function prepareSite(work: string): string {
	const site = join(work, 'site')
	cpSync(join(ROOT, 'demo'), site, {
		recursive: true,
		filter: (source) => !NOT_COPIED.has(basename(source)),
	})
	const tarball = packCore(site)
	const manifestFile = join(site, 'package.json')
	const manifest = portableManifest(
		JSON.parse(readFileSync(manifestFile, 'utf8')) as SiteManifest,
		JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as RootManifest,
		tarball,
	)
	writeFileSync(manifestFile, `${JSON.stringify(manifest, null, '\t')}\n`)
	const workspaceYaml = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8')
	writeFileSync(join(site, 'pnpm-workspace.yaml'), allowBuildsSection(workspaceYaml))
	cpSync(join(ROOT, '.nvmrc'), join(site, '.nvmrc'))
	return site
}

const installedCore = (site: string): string => {
	const installed = realpathSync(join(site, 'node_modules', ...CORE.split('/')))
	if (!installed.startsWith(site + sep))
		throw new Error(`${CORE} resolves to ${installed}, not to the installed tarball`)
	return installed
}

// a path the core ships but does not export: resolving it from the site must fail
export const INTERNAL_SPECIFIER = `${CORE}/src/index.ts`
const NOT_EXPORTED = 'ERR_PACKAGE_PATH_NOT_EXPORTED'

export type Resolution = { specifier: string; url?: string; code?: string }

// the resolver of Node, run from the site directory as the site's code would be; it applies
// `exports` but does not check that the target file exists
export function resolveFromSite(site: string, specifiers: readonly string[]): Resolution[] {
	const code = `const out = []
for (const specifier of ${JSON.stringify(specifiers)}) {
	try { out.push({ specifier, url: import.meta.resolve(specifier) }) }
	catch (error) { out.push({ specifier, code: error.code ?? String(error) }) }
}
console.log(JSON.stringify(out))`
	const output = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
		cwd: site,
		encoding: 'utf8',
	})
	return JSON.parse(output) as Resolution[]
}

// the installed preset, loaded from the site directory as the site's ESLint config loads it: for each
// specifier, whether one of its import patterns restricts it
export function presetVerdicts(
	site: string,
	specifiers: readonly string[],
): Record<string, boolean> {
	const code = `const { deepImportRules } = await import(${JSON.stringify(`${CORE}/eslint`)})
const patterns = deepImportRules().patterns.map((p) => new RegExp(p.regex, p.caseSensitive ? 'u' : 'iu'))
const out = {}
for (const specifier of ${JSON.stringify(specifiers)}) out[specifier] = patterns.some((p) => p.test(specifier))
console.log(JSON.stringify(out))`
	const output = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
		cwd: site,
		encoding: 'utf8',
	})
	return JSON.parse(output) as Record<string, boolean>
}

// the preset allows every declared entry point and restricts an internal path
export function presetProblems(
	manifest: CoreManifest,
	verdicts: Readonly<Record<string, boolean>>,
): string[] {
	const problems = declaredSpecifiers(manifest)
		.filter((specifier) => verdicts[specifier] !== false)
		.map((specifier) => `the installed ${CORE}/eslint preset does not allow ${specifier}`)
	if (verdicts[INTERNAL_SPECIFIER] !== true)
		problems.push(`the installed ${CORE}/eslint preset does not restrict ${INTERNAL_SPECIFIER}`)
	return problems
}

const isFile = (file: string): boolean =>
	statSync(file, { throwIfNoEntry: false })?.isFile() ?? false

// every file path under every condition of `exports`
export const exportTargets = (value: unknown): string[] =>
	typeof value === 'string'
		? [value]
		: value && typeof value === 'object'
			? Object.values(value).flatMap(exportTargets)
			: []

// every declared entry point resolves inside the installed package to a file it ships, every target
// of `exports` (types included) is in the package, and an internal path is refused by `exports`
export function packageExportProblems(
	packageDir: string,
	manifest: CoreManifest,
	resolutions: readonly Resolution[],
): string[] {
	const problems: string[] = []
	for (const target of [...new Set(exportTargets(manifest.exports))])
		if (!isFile(join(packageDir, target)))
			problems.push(`exports target ${target} is not a file in the package`)
	const bySpecifier = new Map(resolutions.map((entry) => [entry.specifier, entry]))
	for (const specifier of declaredSpecifiers(manifest)) {
		const resolution = bySpecifier.get(specifier)
		if (!resolution?.url) {
			problems.push(`${specifier} does not resolve: ${resolution?.code ?? 'not probed'}`)
			continue
		}
		const file = fileURLToPath(resolution.url)
		if (!file.startsWith(packageDir + sep))
			problems.push(`${specifier} resolves outside the package: ${file}`)
		else if (!isFile(file)) problems.push(`${specifier} resolves to a missing file: ${file}`)
	}
	const internal = bySpecifier.get(INTERNAL_SPECIFIER)
	if (internal?.code !== NOT_EXPORTED)
		problems.push(
			`${INTERNAL_SPECIFIER} must fail with ${NOT_EXPORTED}, got ${internal?.url ?? internal?.code ?? 'not probed'}`,
		)
	return problems
}

// the licence and the third-party notices travel with the package; dropping one from `files` would
// pass every other gate
export const LEGAL_FILES = ['LICENSE', 'THIRD_PARTY_NOTICES.md'] as const

export function missingLegalFiles(packageDir: string): string[] {
	return LEGAL_FILES.filter((file) => !isFile(join(packageDir, file))).map(
		(file) => `${file} is not in the package`,
	)
}

function assertPackageExports(site: string): void {
	const packageDir = installedCore(site)
	const manifest = JSON.parse(
		readFileSync(join(packageDir, 'package.json'), 'utf8'),
	) as CoreManifest
	const specifiers = [...declaredSpecifiers(manifest), INTERNAL_SPECIFIER]
	const problems = [
		...packageExportProblems(packageDir, manifest, resolveFromSite(site, specifiers)),
		...presetProblems(manifest, presetVerdicts(site, specifiers)),
		...missingLegalFiles(packageDir),
	]
	if (problems.length > 0) throw new Error(`packed ${CORE} exports:\n  ${problems.join('\n  ')}`)
}

function assertBuiltFromTarball(site: string): void {
	installedCore(site)
	const dist = join(site, 'dist')
	const { locales } = loadSiteSection(site, 'content')
	const albums = loadDemoAlbums(site)
	assertDemoPages(dist, locales, albums)
	assertDemoImages(dist, locales, albums, loadFeaturedSlideCount(site))
	assertCoreOnlyClass(dist)
}

export function assertDemoPages(
	dist: string,
	locales: readonly string[],
	albums: readonly DemoAlbum[],
): void {
	const missing = expectedDemoPages(locales, albums).filter(
		(page) => !existsSync(join(dist, page)),
	)
	if (missing.length > 0) throw new Error(`dist lacks demo pages: ${missing.join(', ')}`)
}

const MEDIA_URL = /\/media\/[^\s"'&,)]+/g
const PICTURE_SOURCES = ['avif', 'webp'].map(
	(format) => `<source type="image/${format}" srcset="/media/`,
)

const htmlFiles = (dist: string): string[] =>
	readdirSync(dist, { recursive: true, encoding: 'utf8' })
		.filter((file) => file.endsWith('.html'))
		.sort()

// album and photo pages render <picture> with AVIF and WebP sources served by the site, every image
// URL of every page is a file of the build, and the home page has a slider with every featured
// slide, not the fallback
export function assertDemoImages(
	dist: string,
	locales: readonly string[],
	albums: readonly DemoAlbum[],
	slides: number,
): void {
	const problems: string[] = []
	for (const page of localePages(locales, portfolioPages(albums))) {
		const html = readFileSync(join(dist, page), 'utf8')
		if (!html.includes('<picture')) problems.push(`${page} has no <picture>`)
		for (const source of PICTURE_SOURCES)
			if (!html.includes(source)) problems.push(`${page} lacks ${source}…`)
	}
	for (const page of localePages(locales, [''])) {
		const html = readFileSync(join(dist, page), 'utf8')
		if (!html.includes('hero-swiper') || html.includes('home-fallback'))
			problems.push(`${page} shows the fallback home page instead of the slider`)
		const rendered = html.split('class="swiper-slide"').length - 1
		if (rendered !== slides)
			problems.push(`${page} renders ${rendered} slides, featured/home.yaml has ${slides}`)
	}
	const missing = new Set<string>()
	for (const file of htmlFiles(dist))
		for (const [url] of readFileSync(join(dist, file), 'utf8').matchAll(MEDIA_URL))
			if (!existsSync(join(dist, url))) missing.add(url)
	if (missing.size > 0) problems.push(`dist lacks images: ${[...missing].sort().join(', ')}`)
	if (problems.length > 0) throw new Error(`demo images:\n  ${problems.join('\n  ')}`)
}

// a utility class only the core's markup uses: the installed core must feed its own sources to
// Tailwind, or the site's CSS lacks the core's classes while the site's own still build
export const CORE_ONLY_CLASS = 'text-menulink'

// comments and strings are not rules, so a class named in one does not count
const CSS_NOT_RULES = /\/\*[\s\S]*?\*\/|'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"/g

export function assertCoreOnlyClass(dist: string, className = CORE_ONLY_CLASS): void {
	const directory = join(dist, '_astro')
	const css = existsSync(directory)
		? readdirSync(directory)
				.filter((file) => file.endsWith('.css'))
				.map((file) =>
					readFileSync(join(directory, file), 'utf8').replace(CSS_NOT_RULES, ''),
				)
		: []
	// a selector of a rule: the class, then the rest of its selector list up to `{`
	const rule = new RegExp(`\\.${className}(?![\\w-])[^{};]*\\{`)
	if (!css.some((text) => rule.test(text)))
		throw new Error(
			`the CSS of dist/_astro lacks .${className}, a class only the core's markup uses: the core's sources did not reach Tailwind`,
		)
}

// an unknown token the theme check of the installed core must reject in a real build
export const BAD_THEME_TOKEN = '--color-acent'
export const BAD_THEME_ERROR = `src/theme/theme.css: unknown tokens: ${BAD_THEME_TOKEN}`

export type BuildResult = { status: number | null; output: string }

// adds the unknown token to the site's theme, builds, and restores the theme whatever happens; the
// build must fail and name the token, which proves the plugin runs on the installed package's modules
export function assertBuildRejectsBadTheme(site: string, build: () => BuildResult): void {
	const theme = join(site, 'src', 'theme', 'theme.css')
	const original = readFileSync(theme, 'utf8')
	writeFileSync(theme, `${original}\n:root {\n\t${BAD_THEME_TOKEN}: red;\n}\n`)
	let result: BuildResult
	try {
		result = build()
	} finally {
		writeFileSync(theme, original)
	}
	if (result.status === 0)
		throw new Error(`the packed demo built with ${BAD_THEME_TOKEN} in its theme`)
	if (!result.output.includes(BAD_THEME_ERROR))
		throw new Error(
			`the packed demo build with a bad theme failed without "${BAD_THEME_ERROR}":\n${result.output.slice(-2000)}`,
		)
}

// a replacement file for a point the core does not know: the gate of point names in the installed
// integration must reject it
export const UNKNOWN_POINT_FILE = join('src', 'overrides', 'footer.astro')
export const UNKNOWN_POINT_ERROR =
	'src/overrides/footer.astro: unknown replacement point "footer"; known: footer-copyright, logo'

// adds the file, builds, and removes it whatever happens; the build must fail and name the file
export function assertBuildRejectsUnknownPoint(site: string, build: () => BuildResult): void {
	const file = join(site, UNKNOWN_POINT_FILE)
	if (existsSync(file)) throw new Error(`${UNKNOWN_POINT_FILE} already exists in the packed demo`)
	mkdirSync(join(file, '..'), { recursive: true })
	writeFileSync(file, '<footer></footer>\n')
	let result: BuildResult
	try {
		result = build()
	} finally {
		rmSync(file)
	}
	if (result.status === 0)
		throw new Error(`the packed demo built with ${UNKNOWN_POINT_FILE}, an unknown point`)
	if (!result.output.includes(UNKNOWN_POINT_ERROR))
		throw new Error(
			`the packed demo build with an unknown point failed without "${UNKNOWN_POINT_ERROR}":\n${result.output.slice(-2000)}`,
		)
}

// the demo without the courses module: its section and menu item leave the config, written from the
// lock's effective config and resolved again, and its moreDocs targets leave the documents; the
// course content stays when `keepContent` is set. Everything is restored whatever `action` does
const COURSES_CONTENT = join('src', 'content', 'courses')
const DOCUMENT_DIRS = [join('src', 'content', 'pages'), join('src', 'content', 'articles')]
const COURSE_TARGET = /\n[ \t]*- kind: course\n[ \t]*slug: [a-z0-9-]+/g

export function withoutCoursesModule<T>(
	site: string,
	{ keepContent }: { keepContent: boolean },
	action: () => T,
): T {
	// the root config files resolve rewrites, and every document that may target a course
	const rootFiles = readdirSync(site).filter((file) => /\.ya?ml$/.test(file))
	const documents = DOCUMENT_DIRS.flatMap((dir) =>
		existsSync(join(site, dir))
			? readdirSync(join(site, dir))
					.filter((file) => /\.mdx?$/.test(file))
					.map((file) => join(dir, file))
			: [],
	)
	const saved = new Map(
		[...rootFiles, ...documents].map((file) => [file, readFileSync(join(site, file), 'utf8')]),
	)
	const content = join(site, COURSES_CONTENT)
	const aside = `${site}-courses-aside`
	try {
		const config = loadSiteConfig(site)
		const { courses: _courses, ...modules } = config.modules
		void _courses
		writeSiteFiles(site, {
			...config,
			modules,
			menu: {
				...config.menu,
				items: config.menu.items.filter((item) => item.segment !== 'courses'),
			},
		})
		for (const file of documents)
			writeFileSync(join(site, file), saved.get(file)!.replace(COURSE_TARGET, ''))
		if (!keepContent) renameSync(content, aside)
		return action()
	} finally {
		if (existsSync(aside)) renameSync(aside, content)
		for (const [file, text] of saved) writeFileSync(join(site, file), text)
	}
}

export const DISABLED_MODULE_CONTENT_ERROR =
	'src/content/courses: content of module "courses", which is not enabled in site.yaml (modules.courses)'

// the course content left in a site that disabled the module must fail the build, naming it
export function assertBuildRejectsDisabledModuleContent(
	site: string,
	build: () => BuildResult,
): void {
	const result = withoutCoursesModule(site, { keepContent: true }, build)
	if (result.status === 0)
		throw new Error('the packed demo built with course content while the module was disabled')
	if (!result.output.includes(DISABLED_MODULE_CONTENT_ERROR))
		throw new Error(
			`the packed demo build with course content of a disabled module failed without "${DISABLED_MODULE_CONTENT_ERROR}":\n${result.output.slice(-2000)}`,
		)
}

// a page in every demo locale whose slug is the route segment of the enabled courses module: the
// collision gate of the installed integration must reject it rather than let the route shadow it
export const SLUG_COLLISION_PAGE = 'slug-collision'
export const SLUG_COLLISION_ERROR = `page "${SLUG_COLLISION_PAGE}": slug "courses" is the route segment of module "courses"`

export function assertBuildRejectsSlugCollision(site: string, build: () => BuildResult): void {
	const pages = join(site, 'src', 'content', 'pages')
	const files = loadSiteSection(site, 'content').locales.map((locale) => ({
		file: join(pages, `${SLUG_COLLISION_PAGE}.${locale}.md`),
		text: [
			'---',
			`translationKey: ${SLUG_COLLISION_PAGE}`,
			`locale: ${locale}`,
			'slug: courses',
			'title: Courses',
			'status: published',
			'---',
			'',
			'A page the courses module would shadow.',
			'',
		].join('\n'),
	}))
	for (const { file } of files)
		if (existsSync(file)) throw new Error(`${file} already exists in the packed demo`)
	let result: BuildResult
	try {
		for (const { file, text } of files) writeFileSync(file, text)
		result = build()
	} finally {
		for (const { file } of files) rmSync(file, { force: true })
	}
	if (result.status === 0)
		throw new Error('the packed demo built with a page whose slug is the courses segment')
	if (!result.output.includes(SLUG_COLLISION_ERROR))
		throw new Error(
			`the packed demo build with a slug collision failed without "${SLUG_COLLISION_ERROR}":\n${result.output.slice(-2000)}`,
		)
}

// a site without the module has no course page and no course URL in its sitemap
export function assertNoCourses(dist: string, locales: readonly string[]): void {
	const problems = locales
		.map((locale) => join(locale, 'courses'))
		.filter((dir) => existsSync(join(dist, dir)))
		.map((dir) => `dist has ${dir}/`)
	for (const file of readdirSync(dist).filter((name) => /^sitemap.*\.xml$/.test(name)))
		if (readFileSync(join(dist, file), 'utf8').includes('/courses/'))
			problems.push(`${file} lists a /courses/ URL`)
	if (problems.length > 0)
		throw new Error(`the packed demo without the courses module:\n  ${problems.join('\n  ')}`)
}

// the package script of the demo that runs every gate of the site through the core's bin
export const SITE_GATES_SCRIPT = 'check:site'

export type ScriptRunner = (site: string, script: string) => BuildResult

// the installed core links its bin into the site, and the site's own package script runs every gate
// with it from node_modules, as a thin site does: the gates scan the core's sources under
// node_modules, never the workspace
export function assertSiteGates(site: string, runScript: ScriptRunner): void {
	if (!existsSync(siteCoreBin(site)))
		throw new Error(`the installed ${CORE} links no ${BIN} bin into node_modules/.bin`)
	const { scripts } = JSON.parse(readFileSync(join(site, 'package.json'), 'utf8')) as {
		scripts?: Record<string, string>
	}
	if (scripts?.[SITE_GATES_SCRIPT] !== `${BIN} check`)
		throw new Error(`the demo's ${SITE_GATES_SCRIPT} script is not "${BIN} check"`)
	const result = runScript(site, SITE_GATES_SCRIPT)
	if (result.status !== 0)
		throw new Error(`${BIN} check failed in the packed demo:\n${result.output.slice(-2000)}`)
	const problems = GATES.filter((gate) => !result.output.includes(`check ${gate} OK`)).map(
		(gate) => `check ${gate} reported no OK`,
	)
	if (!result.output.includes('check color-literals OK (node_modules/'))
		problems.push(`${BIN} check did not scan the core sources under node_modules`)
	if (problems.length > 0)
		throw new Error(`${BIN} check in the packed demo:\n  ${problems.join('\n  ')}`)
}

export type BinRunner = (
	site: string,
	args: readonly string[],
	env: Readonly<Record<string, string>>,
) => BuildResult

export const CORE_VERSION_PROBE = join('.github', 'workflows', 'core-version-probe.yml')
const PROBE_SHA = '0'.repeat(40)

// a version other than the installed one, for the probe the gate must reject
const foreignVersion = (version: string): string => {
	const [major, minor] = version.split('.')
	return `${major}.${Number(minor) + 1}.0`
}

export const coreVersionProbe = (repository: string, version: string): string =>
	[
		'on: push',
		'jobs:',
		'  site:',
		`    uses: ${repository}/.github/workflows/site.yml@${PROBE_SHA} # v${version}`,
		'',
	].join('\n')

// the version and `<owner>/<repo>` of the installed core, as the gate reads them from its package.json
function installedRepository(site: string): { repository: string; version: string } {
	const manifest = JSON.parse(
		readFileSync(join(site, 'node_modules', ...CORE.split('/'), 'package.json'), 'utf8'),
	) as { version: string; repository?: { url?: string } }
	const repository = /github\.com[/:](.+?)(?:\.git)?$/.exec(manifest.repository?.url ?? '')?.[1]
	if (!repository) throw new Error(`the installed ${CORE} names no GitHub repository`)
	return { repository, version: manifest.version }
}

// in CI, with the core installed from the tarball, the gate passes a site workflow that runs site.yml
// of the installed version and fails one whose comment names another
export function assertCoreVersionGate(site: string, runBin: BinRunner): void {
	const { repository, version } = installedRepository(site)
	const ci = { CI: 'true' }
	const probe = join(site, CORE_VERSION_PROBE)
	if (existsSync(join(site, '.github')))
		throw new Error('.github already exists in the packed demo')
	const withWorkflow = (probeVersion: string) => {
		mkdirSync(join(site, '.github', 'workflows'), { recursive: true })
		writeFileSync(probe, coreVersionProbe(repository, probeVersion))
		try {
			return runBin(site, ['check', 'core-version'], ci)
		} finally {
			rmSync(join(site, '.github'), { recursive: true, force: true })
		}
	}
	const problems: string[] = []
	const bare = runBin(site, ['check', 'core-version'], ci)
	if (bare.status !== 0 || !bare.output.includes('check core-version OK'))
		problems.push(`check core-version failed in CI on the installed tarball:\n${bare.output}`)
	const current = withWorkflow(version)
	if (current.status !== 0 || !current.output.includes('the workflows run site.yml'))
		problems.push(`check core-version failed on site.yml # v${version}:\n${current.output}`)
	const other = foreignVersion(version)
	const stale = withWorkflow(other)
	if (
		stale.status !== 1 ||
		!stale.output.includes(`names v${other}, the installed core is ${version}`)
	)
		problems.push(`check core-version did not reject site.yml # v${other}:\n${stale.output}`)
	if (problems.length > 0)
		throw new Error(`${BIN} check core-version in the packed demo:\n  ${problems.join('\n  ')}`)
}

const S3_PACKAGE = '@aws-sdk/client-s3'
const DUMMY_R2_ENV = Object.fromEntries(R2_ENV_VARS.map((name) => [name, 'packed-demo-dummy']))

// the installed bin lists the image commands, and the site, which has no optional S3 SDK, still runs
// every gate while a bucket command fails asking for it: the dummy credentials reach no bucket, since
// the SDK is loaded before any request. `prune` because the demo serves its derivatives itself, which
// sync and check-live reject before opening the bucket
export function assertImageCommands(site: string, runBin: BinRunner): void {
	if (existsSync(join(site, 'node_modules', ...S3_PACKAGE.split('/'))))
		throw new Error(`the packed demo installs ${S3_PACKAGE}, an optional peer it must not get`)
	const problems: string[] = []
	const help = runBin(site, ['images', '--help'], {})
	if (help.status !== 0) problems.push(`${BIN} images --help exited with ${help.status}`)
	for (const { name } of IMAGE_COMMANDS)
		if (!help.output.includes(`  ${name} `))
			problems.push(`${BIN} images --help lists no ${name}`)
	const prune = runBin(site, ['images', 'prune'], DUMMY_R2_ENV)
	if (prune.status !== 1 || !prune.output.includes(`the bucket commands need ${S3_PACKAGE}`))
		problems.push(
			`${BIN} images prune without ${S3_PACKAGE} did not ask to install it:\n${prune.output.slice(-1000)}`,
		)
	if (problems.length > 0)
		throw new Error(`the image commands in the packed demo:\n  ${problems.join('\n  ')}`)
}

const TRANSLATION_MARKER_CHECK = ['content', 'translation-marker', 'check'] as const

// the installed bin reads the documents of the site and reports their translation markers; the
// report is advisory, so it exits 0 whatever it finds
export function assertContentCommands(site: string, runBin: BinRunner): void {
	const command = `${BIN} ${TRANSLATION_MARKER_CHECK.join(' ')}`
	const result = runBin(site, TRANSLATION_MARKER_CHECK, {})
	if (result.status !== 0)
		throw new Error(
			`${command} exited with ${result.status} in the packed demo:\n${result.output.slice(-2000)}`,
		)
	if (!/content translation-marker check — [1-9]\d* pairs/.test(result.output))
		throw new Error(`${command} in the packed demo reported no pairs:\n${result.output}`)
}

const FACTCHECK_RUNS = [
	['content', 'factcheck', 'extract'],
	['content', 'factcheck', 'review'],
	['check', 'factcheck'],
] as const

// the installed bin writes a fact-check ledger and its packet with the prettier the site resolves,
// and its gate then passes on them in the temp site
export function assertFactcheckCommands(site: string, runBin: BinRunner): void {
	for (const args of FACTCHECK_RUNS) {
		const result = runBin(site, args, {})
		if (result.status !== 0)
			throw new Error(
				`${BIN} ${args.join(' ')} exited with ${result.status} in the packed demo:\n${result.output.slice(-2000)}`,
			)
		if (args[0] === 'check' && !/^check factcheck OK$/m.test(result.output))
			throw new Error(
				`${BIN} check factcheck in the packed demo did not check a ledger:\n${result.output}`,
			)
	}
}

// the dev dependencies a site adds for the core's presets: ESLint and the optional peers of its style,
// Prettier and markdownlint, at the versions this repository lints with
export const SITE_LINT_PACKAGES = [
	'eslint',
	'typescript-eslint',
	'eslint-plugin-simple-import-sort',
	'prettier',
	'markdownlint-cli2',
]

export function siteLintDevDependencies(rootManifest: {
	devDependencies?: Record<string, string>
}): Record<string, string> {
	return Object.fromEntries(
		SITE_LINT_PACKAGES.map((name) => {
			const version = rootManifest.devDependencies?.[name]
			if (!version) throw new Error(`the root package.json has no devDependency ${name}`)
			return [name, version]
		}),
	)
}

export const AGENTS_BLOCK_MARKERS = ['<!-- astrum-scena:begin -->', '<!-- astrum-scena:end -->']
export const INSTALLED_CONFIGS = ['eslint.config.mjs', 'prettier.config.mjs', '.markdownlint.json']

// the installed bin puts the core's skills, agents, AGENTS.md block and preset configs into the site,
// a second run changes nothing, and the gate `skills` passes on them
export function assertInstall(site: string, runBin: BinRunner): void {
	const problems: string[] = []
	const first = runBin(site, ['install'], {})
	if (first.status !== 0)
		throw new Error(`${BIN} install failed in the packed demo:\n${first.output.slice(-2000)}`)
	const second = runBin(site, ['install'], {})
	if (second.status !== 0 || !/; 0 written,/.test(second.output))
		problems.push(`a second ${BIN} install wrote files:\n${second.output.slice(-1000)}`)
	const check = runBin(site, ['check', 'skills'], {})
	if (check.status !== 0 || !/check skills OK \([1-9]\d* skills, /.test(check.output))
		problems.push(`${BIN} check skills did not pass on the installed skills:\n${check.output}`)
	const agents = join(site, 'AGENTS.md')
	const text = existsSync(agents) ? readFileSync(agents, 'utf8') : ''
	for (const marker of AGENTS_BLOCK_MARKERS)
		if (!text.includes(marker)) problems.push(`AGENTS.md lacks ${marker}`)
	for (const file of INSTALLED_CONFIGS)
		if (!existsSync(join(site, file))) problems.push(`${BIN} install wrote no ${file}`)
	if (problems.length > 0)
		throw new Error(`${BIN} install in the packed demo:\n  ${problems.join('\n  ')}`)
}

export const ESLINT_PROBE = join('src', 'eslint-probe.ts')
export const INLINE_CONFIG_RULE = 'astrum-scena/no-inline-config'
const ESLINT_PROBE_CODE =
	'// eslint-disable-next-line prefer-const\nlet probe = 1\nexport { probe }\n'

export type EslintRunner = (site: string, args: readonly string[]) => BuildResult

// the site's ESLint on the installed config passes on the site and reports an inline
// `eslint-disable` as an error of the core's preset, while the rule it names still fires
export function assertSiteEslint(site: string, runEslint: EslintRunner): void {
	const clean = runEslint(site, ['.', '--max-warnings', '0'])
	if (clean.status !== 0)
		throw new Error(
			`the site's ESLint failed on the packed demo:\n${clean.output.slice(-2000)}`,
		)
	const probe = join(site, ESLINT_PROBE)
	if (existsSync(probe)) throw new Error(`${ESLINT_PROBE} already exists in the packed demo`)
	writeFileSync(probe, ESLINT_PROBE_CODE)
	let result: BuildResult
	try {
		result = runEslint(site, [ESLINT_PROBE])
	} finally {
		rmSync(probe)
	}
	if (
		result.status !== 1 ||
		!result.output.includes(INLINE_CONFIG_RULE) ||
		!result.output.includes('prefer-const')
	)
		throw new Error(
			`the site's ESLint did not reject an eslint-disable comment with ${INLINE_CONFIG_RULE}:\n${result.output.slice(-2000)}`,
		)
}

export type ToolRunner = (site: string, tool: string, args: readonly string[]) => BuildResult

export const PRETTIER_PROBE = 'prettier-probe.ts'
// the preset drops semicolons and takes single quotes, which Prettier's defaults keep and change back
const PRETTIER_PROBE_CODE = 'export const probe = { name: "probe" };\n'
export const PRETTIER_PROBE_FORMATTED = "export const probe = { name: 'probe' }\n"
export const MARKDOWN_PROBE = 'markdownlint-probe.md'
// the preset turns the line length rule off and keeps the trailing-space one
const MARKDOWN_PROBE_LONG = `# Probe\n\n${'A long line of the probe. '.repeat(8).trim()}\n`
const MARKDOWN_PROBE_TRAILING = '# Probe\n\nTrailing spaces.   \n'

// writes the probe, runs `action`, and removes the probe whatever happens
function withProbe<T>(site: string, file: string, text: string, action: () => T): T {
	const probe = join(site, file)
	if (existsSync(probe)) throw new Error(`${file} already exists in the packed demo`)
	writeFileSync(probe, text)
	try {
		return action()
	} finally {
		rmSync(probe)
	}
}

// the site's Prettier and markdownlint read the configs install wrote, so the core's presets resolve
// through the installed package: Prettier formats a probe as the preset does, and markdownlint passes a
// long line the preset allows while it still fails trailing spaces
export function assertSiteFormatters(site: string, runTool: ToolRunner): void {
	const problems: string[] = []
	const prettier = withProbe(site, PRETTIER_PROBE, PRETTIER_PROBE_CODE, () =>
		runTool(site, 'prettier', [PRETTIER_PROBE]),
	)
	if (prettier.status !== 0 || prettier.output !== PRETTIER_PROBE_FORMATTED)
		problems.push(
			`Prettier did not format with the core's preset:\n${prettier.output.slice(-1000)}`,
		)
	const long = withProbe(site, MARKDOWN_PROBE, MARKDOWN_PROBE_LONG, () =>
		runTool(site, 'markdownlint-cli2', [MARKDOWN_PROBE]),
	)
	if (long.status !== 0)
		problems.push(
			`markdownlint did not apply the core's preset to a long line:\n${long.output.slice(-1000)}`,
		)
	const trailing = withProbe(site, MARKDOWN_PROBE, MARKDOWN_PROBE_TRAILING, () =>
		runTool(site, 'markdownlint-cli2', [MARKDOWN_PROBE]),
	)
	if (trailing.status === 0 || !trailing.output.includes('MD009'))
		problems.push(
			`markdownlint did not report trailing spaces:\n${trailing.output.slice(-1000)}`,
		)
	if (problems.length > 0)
		throw new Error(`the site's formatters in the packed demo:\n  ${problems.join('\n  ')}`)
}

const runSiteTool: ToolRunner = (site, tool, args) => {
	const result = spawnSync(join(site, 'node_modules', '.bin', tool), args, {
		cwd: site,
		encoding: 'utf8',
	})
	return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const runSiteEslint: EslintRunner = (site, args) => runSiteTool(site, 'eslint', args)

const runSiteBin: BinRunner = (site, args, env) => {
	const result = spawnSync(siteCoreBin(site), args, {
		cwd: site,
		encoding: 'utf8',
		env: { ...process.env, ...env },
	})
	return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const runSiteScript: ScriptRunner = (site, script) => {
	const result = spawnSync('pnpm', ['run', script], { cwd: site, encoding: 'utf8' })
	const output = `${result.stdout}${result.stderr}`
	process.stdout.write(output)
	return { status: result.status, output }
}

// a build into its own outDir, so a failed run cannot touch the demo's dist
function buildInto(site: string, work: string, outDir: string): BuildResult {
	const result = spawnSync(siteAstroBin(site), ['build', '--root', site, '--outDir', outDir], {
		cwd: work,
		encoding: 'utf8',
	})
	return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

// the value of `--out`, resolved against cwd; undefined without the flag
export function outArg(argv: readonly string[]): string | undefined {
	const index = argv.indexOf('--out')
	if (index < 0) return undefined
	const value = argv[index + 1]
	if (!value || value.startsWith('--')) throw new Error('--out needs a directory')
	return resolve(value)
}

// before building, `<out>/site` is removed recursively; `<out>` itself and its other entries stay
export function buildPackedDemo({ out }: { out: string }): string {
	mkdirSync(out, { recursive: true })
	const work = realpathSync(out)
	rmSync(packedSite(work), { recursive: true, force: true })
	const site = prepareSite(work)
	run(site, 'install', '--no-frozen-lockfile')
	assertPackageExports(site)
	assertInstall(site, runSiteBin)
	assertSiteEslint(site, runSiteEslint)
	assertSiteFormatters(site, runSiteTool)
	assertSiteGates(site, runSiteScript)
	assertCoreVersionGate(site, runSiteBin)
	assertImageCommands(site, runSiteBin)
	assertContentCommands(site, runSiteBin)
	assertFactcheckCommands(site, runSiteBin)
	execFileSync(siteAstroBin(site), ['build', '--root', site], { cwd: work, stdio: 'inherit' })
	assertBuiltFromTarball(site)
	const badThemeOut = join(work, 'bad-theme-dist')
	try {
		assertBuildRejectsBadTheme(site, () => buildInto(site, work, badThemeOut))
	} finally {
		rmSync(badThemeOut, { recursive: true, force: true })
	}
	const unknownPointOut = join(work, 'unknown-point-dist')
	try {
		assertBuildRejectsUnknownPoint(site, () => buildInto(site, work, unknownPointOut))
	} finally {
		rmSync(unknownPointOut, { recursive: true, force: true })
	}
	const moduleContentOut = join(work, 'module-content-dist')
	try {
		assertBuildRejectsDisabledModuleContent(site, () => buildInto(site, work, moduleContentOut))
	} finally {
		rmSync(moduleContentOut, { recursive: true, force: true })
	}
	const slugCollisionOut = join(work, 'slug-collision-dist')
	try {
		assertBuildRejectsSlugCollision(site, () => buildInto(site, work, slugCollisionOut))
	} finally {
		rmSync(slugCollisionOut, { recursive: true, force: true })
	}
	// inside the site, unlike the failing builds: the prerender step imports the site's packages from
	// the outDir, which resolves them only below the site's node_modules
	const withoutModuleOut = join(site, 'without-module-dist')
	try {
		const result = withoutCoursesModule(site, { keepContent: false }, () =>
			buildInto(site, work, withoutModuleOut),
		)
		if (result.status !== 0)
			throw new Error(
				`the packed demo without the courses module failed to build:\n${result.output.slice(-2000)}`,
			)
		assertNoCourses(withoutModuleOut, loadSiteSection(site, 'content').locales)
	} finally {
		rmSync(withoutModuleOut, { recursive: true, force: true })
	}
	console.log(`demo built from the packed ${CORE} (outside the workspace) in ${site}`)
	return site
}

function main(): void {
	const out = outArg(process.argv)
	if (out) {
		buildPackedDemo({ out })
		return
	}
	const work = realpathSync(mkdtempSync(join(tmpdir(), 'astrum-scena-demo-')))
	try {
		buildPackedDemo({ out: work })
	} finally {
		if (process.argv.includes('--keep')) console.log(`kept ${work}`)
		else rmSync(work, { recursive: true, force: true })
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
