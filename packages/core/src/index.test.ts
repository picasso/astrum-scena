import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { satteri } from '@astrojs/markdown-satteri'
import type { AstroIntegration, AstroUserConfig, InjectedRoute } from 'astro'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'

import { buildSiteConfig } from './config/fixtures/site-config.ts'
import { writeSiteFiles } from './config/fixtures/site-files.ts'
import { SITE_LOCK_ENV } from './config/loader.ts'
import { SUPPORTED_LOCALES } from './config/locale-schema.ts'
import { SITE_LOCK_PATH } from './config/lock.ts'
import { siteRoot } from './config/site-root.ts'
import { CORE_ROOT } from './core-root.ts'
import { CORE_DICTIONARIES } from './i18n/dictionaries.ts'
import { siteDictionaryPath } from './i18n/site-dictionary-path.ts'
import astrumScena from './index.ts'
import {
	coreRoutes,
	INTEGRATION_NAME,
	OVERRIDES_MODULE,
	SITE_ROOT_MODULE,
	siteSourcesCss,
} from './integration-parts.ts'
import { calloutMdastPlugin } from './lib/blocks/callout/plugin.ts'
import { linksMdastPlugin } from './lib/blocks/links/plugin.ts'
import { noteMdastPlugin } from './lib/blocks/note/plugin.ts'
import { coreImportsMdastPlugin } from './lib/content/core-imports-mdx.ts'
import {
	IMAGES_PUBLIC_RELATIVE_PATH,
	loadImagePublicConfig,
	serializeImagePublicConfig,
} from './lib/images/public-config.ts'
import {
	CSP_HEADER,
	parseCsp,
	parseHeadersFile,
	SECURITY_HEADERS_PATH,
} from './lib/security-headers.ts'
import { coursesModule } from './modules/courses/manifest.ts'

type SetupHook = NonNullable<AstroIntegration['hooks']['astro:config:setup']>
type Plugin = {
	name: string
	resolveId?: (id: string) => unknown
	load?: (id: string) => unknown
	transform?: (code: string, id: string) => string | undefined
}

// runs the setup hook against a site root; only the helpers the integration uses are provided
async function setUp(root: string) {
	const routes: InjectedRoute[] = []
	const updates: AstroUserConfig[] = []
	const hook = astrumScena().hooks['astro:config:setup'] as SetupHook
	await hook({
		config: { root: pathToFileURL(`${root}/`) },
		injectRoute: (route: InjectedRoute) => routes.push(route),
		updateConfig: (config: AstroUserConfig) => updates.push(config),
	} as unknown as Parameters<SetupHook>[0])
	const config = updates[0]!
	const plugins = (config.vite?.plugins ?? []).flat() as Plugin[]
	return { routes, config, plugins }
}

const scratch: string[] = []
afterAll(() => {
	vi.unstubAllEnvs()
	for (const dir of scratch) rmSync(dir, { force: true, recursive: true })
})

describe('astrumScena integration', () => {
	it('is named after the package', () => {
		expect(astrumScena().name).toBe(INTEGRATION_NAME)
	})

	it('exports only the integration from the package root', async () => {
		expect(Object.keys(await import('./index.ts'))).toEqual(['default'])
	})

	it('injects every core route from the package, not from the site', async () => {
		const { routes } = await setUp(siteRoot)
		expect(routes.map((route) => route.pattern)).toEqual(
			expect.arrayContaining([
				'/[locale]',
				'/[locale]/portfolio',
				'/[locale]/portfolio/[album]/[photo]',
				'/[locale]/articles/[slug]',
				'/[locale]/contacts',
				'/rights',
				'/status',
			]),
		)
		const pageDirs = [path.join(CORE_ROOT, 'src', 'pages'), coursesModule.pagesDir]
		for (const route of routes) {
			const entrypoint = String(route.entrypoint)
			expect(pageDirs.some((dir) => entrypoint.startsWith(dir + path.sep))).toBe(true)
			expect(existsSync(entrypoint)).toBe(true)
		}
	})

	it("injects an enabled module's routes from its own pages", async () => {
		const { routes } = await setUp(siteRoot)
		const courses = routes.filter((route) => route.pattern.startsWith('/[locale]/courses'))
		expect(courses.map((route) => route.pattern).sort()).toEqual([
			'/[locale]/courses',
			'/[locale]/courses/[slug]',
		])
		for (const route of courses)
			expect(String(route.entrypoint).startsWith(coursesModule.pagesDir)).toBe(true)
	})

	it('maps file-based routing: index names its directory', () => {
		const patterns = coreRoutes().map((route) => route.pattern)
		expect(patterns).toContain('/[locale]')
		expect(patterns).not.toContain('/[locale]/index')
		expect(patterns).toHaveLength(new Set(patterns).size)
	})

	it('registers the React renderer resolved from the site, MDX, sitemap and site files', async () => {
		const { config } = await setUp(siteRoot)
		const names = (config.integrations ?? [])
			.flat()
			.map((integration) => (integration ? integration.name : undefined))
		expect(names).toEqual(['@astrojs/react', '@astrojs/mdx', '@astrojs/sitemap', 'site-files'])
	})

	it('serves the site root from config.root, never from cwd', async () => {
		const elsewhere = mkdtempSync(path.join(tmpdir(), 'astrum-scena-cwd-'))
		scratch.push(elsewhere)
		const cwd = vi.spyOn(process, 'cwd').mockReturnValue(elsewhere)
		const { plugins } = await setUp(siteRoot)
		cwd.mockRestore()
		const module = plugins.find((plugin) => plugin.name === 'astrum-scena:site-root')!
		const resolved = module.resolveId!(SITE_ROOT_MODULE) as string
		expect(module.load!(resolved)).toBe(`export const siteRoot = ${JSON.stringify(siteRoot)}`)
	})

	it('watches the resolved lock from the config modules, not site.yaml', async () => {
		const { plugins } = await setUp(siteRoot)
		const plugin = plugins.find(
			(candidate) => candidate.name === 'astrum-scena:config-yaml-dependency',
		)!
		const addWatchFile = vi.fn()
		const transform = plugin.transform as unknown as (
			this: { addWatchFile: (id: string) => void },
			code: string,
			id: string,
		) => void
		transform.call({ addWatchFile }, '', path.join(CORE_ROOT, 'src', 'config', 'site.ts'))

		expect(addWatchFile.mock.calls).toEqual([[path.resolve(siteRoot, SITE_LOCK_PATH)]])
	})

	it("watches the lock and the site's dictionary of every catalog locale from the i18n module", async () => {
		const { plugins } = await setUp(siteRoot)
		const plugin = plugins.find(
			(candidate) => candidate.name === 'astrum-scena:config-yaml-dependency',
		)!
		const addWatchFile = vi.fn()
		const transform = plugin.transform as unknown as (
			this: { addWatchFile: (id: string) => void },
			code: string,
			id: string,
		) => void
		transform.call({ addWatchFile }, '', path.join(CORE_ROOT, 'src', 'i18n', 'ui.ts'))

		expect(addWatchFile.mock.calls).toEqual([
			[path.resolve(siteRoot, SITE_LOCK_PATH)],
			...SUPPORTED_LOCALES.map((locale) => [
				path.resolve(siteRoot, siteDictionaryPath(locale)),
			]),
		])
	})

	it("appends the site's Tailwind sources to the core stylesheet only", async () => {
		const { plugins } = await setUp(siteRoot)
		const transform = plugins.find(
			(plugin) => plugin.name === 'astrum-scena:site-sources',
		)!.transform!
		const globalCss = path.join(CORE_ROOT, 'src', 'styles', 'global.css')
		const expected = `@source '../';\n${siteSourcesCss(siteRoot)}\n`
		expect(transform("@source '../';", globalCss)).toBe(expected)
		expect(transform("@source '../';", `${globalCss}?direct`)).toBe(expected)
		const other = path.join(CORE_ROOT, 'src', 'styles', 'prose.css')
		expect(transform("@source '../';", other)).toBeUndefined()
	})

	it('fails the build of a site whose theme declares a token the core does not export', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'astrum-scena-theme-'))
		scratch.push(root)
		cpSync(siteRoot, root, {
			recursive: true,
			filter: (source) => !/(^|\/)(node_modules|dist|\.astro)$/.test(source),
		})
		const theme = path.join(root, 'src', 'theme', 'theme.css')
		const { plugins } = await setUp(root)
		const plugin = plugins.find((candidate) => candidate.name === 'astrum-scena:theme-tokens')!
		const transform = plugin.transform as unknown as (
			this: { addWatchFile: (id: string) => void },
			code: string,
			id: string,
		) => void
		const compile = () =>
			transform.call(
				{ addWatchFile: () => {} },
				'',
				path.join(CORE_ROOT, 'src', 'styles', 'global.css'),
			)
		expect(compile).not.toThrow()
		writeFileSync(theme, `${readFileSync(theme, 'utf8')}\n:root {\n\t--color-acent: red;\n}\n`)
		expect(compile).toThrow('src/theme/theme.css: unknown tokens: --color-acent')
	})

	it("renders the note and links default titles from the site's dictionary override", async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'astrum-scena-block-titles-'))
		scratch.push(root)
		cpSync(siteRoot, root, {
			recursive: true,
			filter: (source) => !/(^|\/)(node_modules|dist|\.astro)$/.test(source),
		})
		const dictionary = path.join(root, siteDictionaryPath('en'))
		writeFileSync(
			dictionary,
			`${readFileSync(dictionary, 'utf8')}note.title: Since then\nlinks.title: Further reading\n`,
		)
		const processor = (await setUp(root)).config.markdown?.processor as unknown as {
			createRenderer: (options: object) => Promise<{
				render: (source: string, options: object) => Promise<{ code: string }>
			}>
		}
		const renderer = await processor.createRenderer({})
		const render = async (source: string) =>
			(await renderer.render(source, { fileURL: new URL('file:///docs/x.en.md') })).code
		const note = await render(':::note{claim="prod-d602206b:64cf2f9d"}\nBody.\n:::')
		expect(note).toContain('>Since then<')
		expect(note).not.toContain(CORE_DICTIONARIES.en['note.title'])
		const links = await render(':::links\n- [a](https://a.example)\n:::')
		expect(links).toContain('>Further reading<')
		expect(links).not.toContain(`>${CORE_DICTIONARIES.en['links.title']}<`)
	})

	it("serves the site's replacement components from src/overrides", async () => {
		const { plugins } = await setUp(siteRoot)
		const module = plugins.find((plugin) => plugin.name === 'astrum-scena:overrides')!
		const resolved = module.resolveId!(OVERRIDES_MODULE) as string
		expect(module.load!(resolved)).toBe(
			[
				`import r0 from ${JSON.stringify(path.join(siteRoot, 'src', 'overrides', 'logo.astro'))}`,
				'export const overrides = { "logo": r0, }',
			].join('\n'),
		)
	})

	it('serves every replaced point, footer-copyright included, with its absolute file', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'astrum-scena-overrides-'))
		scratch.push(root)
		cpSync(siteRoot, root, {
			recursive: true,
			filter: (source) => !/(^|\/)(node_modules|dist|\.astro)$/.test(source),
		})
		const copyright = path.join(root, 'src', 'overrides', 'footer-copyright.astro')
		writeFileSync(copyright, '<span>©</span>\n')
		const { plugins } = await setUp(root)
		const module = plugins.find((plugin) => plugin.name === 'astrum-scena:overrides')!
		expect(module.load!(module.resolveId!(OVERRIDES_MODULE) as string)).toBe(
			[
				`import r0 from ${JSON.stringify(copyright)}`,
				`import r1 from ${JSON.stringify(path.join(root, 'src', 'overrides', 'logo.astro'))}`,
				'export const overrides = { "footer-copyright": r0, "logo": r1, }',
			].join('\n'),
		)
	})

	it('fails the setup of a site that replaces an unknown point', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'astrum-scena-overrides-'))
		scratch.push(root)
		cpSync(siteRoot, root, {
			recursive: true,
			filter: (source) => !/(^|\/)(node_modules|dist|\.astro)$/.test(source),
		})
		writeFileSync(path.join(root, 'src', 'overrides', 'footer.astro'), '<footer />\n')
		await expect(setUp(root)).rejects.toThrow(
			'src/overrides/footer.astro: unknown replacement point "footer"; known: footer-copyright, logo',
		)
	})

	it('gives the CSP no image host for a site that serves its images itself', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'astrum-scena-public-path-'))
		scratch.push(root)
		cpSync(siteRoot, root, {
			recursive: true,
			filter: (source) => !/(^|\/)(node_modules|dist|\.astro)$/.test(source),
		})
		const publicConfig = path.join(root, IMAGES_PUBLIC_RELATIVE_PATH)
		const { schemaVersion, copyright, credit, ladder } = loadImagePublicConfig(root).config
		writeFileSync(
			publicConfig,
			serializeImagePublicConfig({
				schemaVersion,
				copyright,
				credit,
				ladder,
				publicPath: '/media',
			}),
		)
		const { config } = await setUp(root)
		const files = (config.integrations ?? [])
			.flat()
			.find((integration) => integration && integration.name === 'site-files') as
			AstroIntegration | undefined
		const dist = path.join(root, 'dist')
		mkdirSync(dist)
		const buildDone = files!.hooks['astro:build:done'] as unknown as (options: {
			dir: URL
		}) => Promise<void>
		await buildDone({ dir: pathToFileURL(`${dist}/`) })
		const headers = parseHeadersFile(readFileSync(path.join(dist, '_headers'), 'utf8'))
		const policy = headers.get(SECURITY_HEADERS_PATH)!.get(CSP_HEADER.toLowerCase())!
		expect(parseCsp(policy).get('img-src')).toEqual(["'self'", 'data:'])
	})

	it('names the missing lock and the command that writes it', async () => {
		const empty = mkdtempSync(path.join(tmpdir(), 'astrum-scena-site-'))
		scratch.push(empty)
		await expect(setUp(empty)).rejects.toThrow(
			`${SITE_LOCK_PATH}: missing; run astrum-scena config resolve`,
		)
	})
})

// astro's HTML compression drops the whitespace between text and an inline tag ("use the" glued
// to "<a>contact page</a>"); the source looks right and only the output breaks, so it stays off
// and templates need no `{' '}` workarounds
describe('astro config', () => {
	const base = buildSiteConfig()
	// the demo content has no `about` page for the fixture's menu item
	const site = buildSiteConfig({
		origin: 'https://other.test',
		content: { locales: ['ru', 'en'], referenceLocale: 'en' },
		menu: { ...base.menu, items: base.menu.items.filter((item) => item.segment !== 'about') },
	})

	async function configFor() {
		const dir = mkdtempSync(path.join(tmpdir(), 'astro-config-'))
		scratch.push(dir)
		writeSiteFiles(dir, site)
		vi.stubEnv(SITE_LOCK_ENV, path.join(dir, SITE_LOCK_PATH))
		try {
			return (await setUp(siteRoot)).config
		} finally {
			vi.unstubAllEnvs()
		}
	}

	it('keeps HTML compression off so line breaks stay real whitespace', async () => {
		expect((await configFor()).compressHTML).toBe(false)
	})

	it('takes the i18n locales and their default from the site config', async () => {
		const config = await configFor()
		expect(config.i18n?.locales).toEqual(['ru', 'en'])
		expect(config.i18n?.defaultLocale).toBe('ru')
	})

	it('takes the site origin from the site config', async () => {
		expect((await configFor()).site).toBe('https://other.test')
	})

	// a feature flag rather than a replaced pipeline, so the rest of the corpus renders through the
	// same Sätteri as before
	it('enables container directives on the default markdown processor', async () => {
		const config = await configFor()
		expect(config.markdown?.processor?.name).toBe('satteri')
		expect(config.markdown?.processor?.options).toMatchObject({
			features: { directive: true },
			mdastPlugins: [
				calloutMdastPlugin,
				{ name: noteMdastPlugin(() => undefined).name },
				{ name: linksMdastPlugin(() => undefined).name },
				{ name: coreImportsMdastPlugin().name },
			],
		})
	})

	it('renders a directive through the processor the integration registers', async () => {
		const processor = (await configFor()).markdown?.processor as unknown as {
			createRenderer: (options: object) => Promise<{
				render: (source: string, options: object) => Promise<{ code: string }>
			}>
		}
		const { code } = await (await processor.createRenderer({})).render(SOURCE, {})
		expect(code).toContain('class="callout callout--block callout--default"')
		expect(code).toContain('<strong>text</strong>')
	})

	it("gives the directive blocks their default title from the site's dictionaries", async () => {
		const processor = (await configFor()).markdown?.processor as unknown as {
			createRenderer: (options: object) => Promise<{
				render: (source: string, options: object) => Promise<{ code: string }>
			}>
		}
		const renderer = await processor.createRenderer({})
		const { code } = await renderer.render(':::links\n- [a](https://a.example)\n:::', {
			fileURL: new URL('file:///docs/x.en.md'),
		})
		expect(code).toContain(`>${CORE_DICTIONARIES.en['links.title']}<`)
	})
})

// the MDX check runs inside @astrojs/mdx's compile; its hooks get only the helpers they call
async function compileMdx(source: string): Promise<unknown> {
	const config = (await setUp(siteRoot)).config
	const mdx = (config.integrations ?? [])
		.flat()
		.find(
			(integration) => integration && integration.name === '@astrojs/mdx',
		) as AstroIntegration
	const updates: AstroUserConfig[] = []
	await (mdx.hooks['astro:config:setup'] as SetupHook)({
		config: {},
		updateConfig: (update: AstroUserConfig) => updates.push(update),
		addRenderer: () => {},
		addPageExtension: () => {},
		addContentEntryType: () => {},
	} as unknown as Parameters<SetupHook>[0])
	const done = mdx.hooks['astro:config:done'] as unknown as (options: object) => void
	done({
		config: { markdown: config.markdown, srcDir: pathToFileURL(`${siteRoot}/src/`) },
		logger: { warn: () => {} },
	})
	const plugin = (updates[0]!.vite?.plugins ?? []).flat()[0] as unknown as {
		configResolved: (resolved: object) => void
		transform: { handler: (code: string, id: string) => Promise<unknown> }
	}
	plugin.configResolved({ build: { sourcemap: false }, plugins: [] })
	return plugin.transform.handler(source, path.join(siteRoot, 'src', 'content', 'probe.mdx'))
}

describe('MDX import check in the build', () => {
	const CORE = '@picasso-ai/astrum-scena'

	it('fails the MDX compile on an import of core internals', async () => {
		await expect(compileMdx(`import X from '${CORE}/src/x'\n\n# Title\n`)).rejects.toThrow(
			new RegExp(`probe\\.mdx imports '${CORE}/src/x'.*"exports"`),
		)
	})

	it('compiles MDX that imports a declared entry point', async () => {
		await expect(
			compileMdx(`import { a } from '${CORE}/collections'\n\n# Title\n`),
		).resolves.toBeDefined()
	})
})

const SOURCE = ':::callout\nBody **text**.\n:::\n'

async function renderMarkdown(directive: boolean): Promise<string> {
	const renderer = await satteri({ features: { directive } }).createRenderer({})
	const { code } = await renderer.render(SOURCE, {})
	return code
}

// directives live in plain `.md`; a parsed directive renders no HTML of its own, its block plugin
// adds that
describe('container directive syntax', () => {
	it('stays literal paragraph text while the feature is off', async () => {
		const html = await renderMarkdown(false)
		expect(html).toContain(':::callout')
		expect(html).toMatch(/^<p>/)
	})

	it('is parsed as a directive once the feature is on', async () => {
		const html = await renderMarkdown(true)
		expect(html).not.toContain(':::')
		expect(html).not.toContain('Body')
	})
})

// the demo copied, then turned into a site without the courses module: its section, menu item and
// moreDocs targets go, and `keep` decides what of the course content stays behind
describe('modules in the integration', () => {
	type Tree = Record<string, unknown> & { menu: { items: { segment: string }[] } }

	const copyDemo = (): string => {
		const root = mkdtempSync(path.join(tmpdir(), 'astrum-scena-modules-'))
		scratch.push(root)
		cpSync(siteRoot, root, {
			recursive: true,
			filter: (source) => !/(^|\/)(node_modules|dist|\.astro)$/.test(source),
		})
		return root
	}
	// the lock's effective config, which is a valid site config written out in full
	const readSite = (root: string) =>
		(parse(readFileSync(path.join(root, SITE_LOCK_PATH), 'utf8')) as { site: Tree }).site
	const BLOCKS = ['blocks.en.mdx', 'blocks.ru.mdx'].map((file) =>
		path.join('src', 'content', 'pages', file),
	)
	const COURSE_TARGET = /\n {8}- kind: course\n {10}slug: [a-z-]+/g

	const withoutCourses = (
		options: { content?: boolean; targets?: boolean; menu?: boolean } = {},
	): string => {
		const root = copyDemo()
		const site = readSite(root)
		delete site.modules
		if (!options.menu)
			site.menu.items = site.menu.items.filter((item) => item.segment !== 'courses')
		writeSiteFiles(root, site)
		if (!options.content)
			rmSync(path.join(root, 'src', 'content', 'courses'), { recursive: true })
		if (!options.targets)
			for (const file of BLOCKS) {
				const text = readFileSync(path.join(root, file), 'utf8')
				writeFileSync(path.join(root, file), text.replace(COURSE_TARGET, ''))
			}
		return root
	}

	it('builds a site without the module: no module routes and the core ones intact', async () => {
		const { routes } = await setUp(withoutCourses())
		const patterns = routes.map((route) => route.pattern)
		expect(patterns.filter((pattern) => pattern.includes('courses'))).toEqual([])
		expect(patterns).toEqual(coreRoutes().map((route) => route.pattern))
	})

	it('fails on content of a disabled module, naming its directory and section', async () => {
		await expect(setUp(withoutCourses({ content: true }))).rejects.toThrow(
			'src/content/courses: content of module "courses", which is not enabled in site.yaml (modules.courses)',
		)
	})

	it('fails on a moreDocs target of a disabled module, naming the file and the key', async () => {
		await expect(setUp(withoutCourses({ targets: true }))).rejects.toThrow(
			'src/content/pages/blocks.en.mdx: moreDocs.docs.0.kind: "course": module "courses" is not enabled in site.yaml (modules.courses)',
		)
	})

	it('fails on a menu segment no section or page serves, listing the known ones', async () => {
		const root = copyDemo()
		const site = readSite(root)
		site.menu.items = [...site.menu.items, { ...site.menu.items[0]!, segment: 'tours' }]
		writeSiteFiles(root, site)
		await expect(setUp(root)).rejects.toThrow(
			'site.yaml: menu.items.4.segment: "tours" is not a known segment; known: articles, blocks, contacts, courses, portfolio, privacy',
		)
	})

	// a page in both demo locales with the given slug, published unless told otherwise
	const withPage = (root: string, slug: string, data = 'status: published'): string => {
		for (const locale of ['en', 'ru'])
			writeFileSync(
				path.join(root, 'src', 'content', 'pages', `clash.${locale}.md`),
				`---\ntranslationKey: clash\nlocale: ${locale}\nslug: ${slug}\ntitle: Clash\n${data}\n---\n\nText.\n`,
			)
		return root
	}

	it('fails on a page whose slug is the segment of an enabled module or of the core', async () => {
		await expect(setUp(withPage(copyDemo(), 'courses'))).rejects.toThrow(
			'page "clash": slug "courses" is the route segment of module "courses"',
		)
		await expect(
			setUp(withPage(copyDemo(), 'articles', 'status: published\nunlisted: true')),
		).rejects.toThrow('page "clash": slug "articles" is the route segment of the core')
	})

	it('fails when an enabled module takes a name of the core', async () => {
		const module = coursesModule as { tokens: readonly string[] }
		const tokens = module.tokens
		module.tokens = ['--color-accent']
		try {
			await expect(setUp(copyDemo())).rejects.toThrow(
				'name collisions:\n  module "courses": token "--color-accent" is the core\'s',
			)
		} finally {
			module.tokens = tokens
		}
	})

	it('builds a page under the segment of a disabled module', async () => {
		await expect(setUp(withPage(withoutCourses(), 'courses'))).resolves.toBeDefined()
	})
})
