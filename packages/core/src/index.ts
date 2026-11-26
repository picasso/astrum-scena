import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { satteri } from '@astrojs/markdown-satteri'
import mdx from '@astrojs/mdx'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import type { AstroIntegration } from 'astro'

import { loadSiteConfig, siteLockPath } from './config/loader.ts'
import type { Locale } from './config/locale-schema.ts'
import { siteConfigError } from './config/lock.ts'
import { defaultLocale, type SiteConfig } from './config/site-schema.ts'
import { CORE_ROOT } from './core-root.ts'
import { loadDictionaries } from './i18n/dictionaries.ts'
import { siteDictionaryPath } from './i18n/site-dictionary-path.ts'
import {
	CORE_SRC,
	coreRoutes,
	coreSegments,
	GLOBAL_CSS,
	INTEGRATION_NAME,
	OVERRIDES_MODULE,
	overridesModuleSource,
	SITE_ROOT_MODULE,
	siteSourcesCss,
} from './integration-parts.ts'
import { calloutMdastPlugin } from './lib/blocks/callout/plugin.ts'
import { linksMdastPlugin } from './lib/blocks/links/plugin.ts'
import { noteMdastPlugin } from './lib/blocks/note/plugin.ts'
import { TURNSTILE_SRC } from './lib/contact/turnstile-script.ts'
import { coreImportsMdastPlugin } from './lib/content/core-imports-mdx.ts'
import { collectPublishedDocuments } from './lib/content/documents.ts'
import { loadContentSnapshot, moduleTargetErrors } from './lib/content/files.ts'
import type { ContentSnapshot } from './lib/content/model.ts'
import { externalImageOrigin, loadImagePublicConfig } from './lib/images/public-config.ts'
import { buildRedirectRouteSets } from './lib/redirects/contract.ts'
import { siteFiles } from './lib/site-files.ts'
import { canonicalSitemapUrl, createSitemapFilter } from './lib/sitemap.ts'
import { variantCssPlugin } from './lib/variant-css.ts'
import { moduleCollisions, slugCollisions } from './modules/collisions.ts'
import type { ModuleManifest } from './modules/manifest.ts'
import {
	disabledModuleContentErrors,
	enabledModules,
	unknownMenuSegmentIssues,
} from './modules/registry.ts'
import { type ReplacementPoint, siteReplacements } from './overrides/points.ts'
import { themeTokensPlugin } from './theme/tokens-plugin.ts'

export type {
	FooterCopyrightReplacementProps,
	LogoReplacementProps,
	ReplacementPointProps,
} from './overrides/points.ts'

const RESOLVED_SITE_ROOT_MODULE = `\0${SITE_ROOT_MODULE}`
const RESOLVED_OVERRIDES_MODULE = `\0${OVERRIDES_MODULE}`

// runtime modules import the site root from here (src/config/site-root.ts)
function siteRootModule(siteRoot: string) {
	return {
		name: 'astrum-scena:site-root',
		resolveId: (id: string) =>
			id === SITE_ROOT_MODULE ? RESOLVED_SITE_ROOT_MODULE : undefined,
		load: (id: string) =>
			id === RESOLVED_SITE_ROOT_MODULE
				? `export const siteRoot = ${JSON.stringify(siteRoot)}`
				: undefined,
	}
}

// the site's replacement components (src/overrides/<point>.astro), checked in astro:config:setup
function overridesModule(replacements: ReadonlyMap<ReplacementPoint, string>) {
	return {
		name: 'astrum-scena:overrides',
		resolveId: (id: string) =>
			id === OVERRIDES_MODULE ? RESOLVED_OVERRIDES_MODULE : undefined,
		load: (id: string) =>
			id === RESOLVED_OVERRIDES_MODULE ? overridesModuleSource(replacements) : undefined,
	}
}

function siteSources(siteRoot: string) {
	return {
		name: 'astrum-scena:site-sources',
		enforce: 'pre' as const,
		transform: (code: string, id: string) =>
			id.split('?')[0] === GLOBAL_CSS ? `${code}\n${siteSourcesCss(siteRoot)}\n` : undefined,
	}
}

// the config modules read site.lock.yaml from disk, which Vite cannot see. Registering it as a watch
// file of each module restores the dependency `?raw` gave, so a resolved lock takes Vite's normal HMR
// path; an edit of site.yaml reaches the site only through `astrum-scena config resolve`. The
// dictionaries module reads the site's `src/i18n/<locale>.yaml` the same way, one per locale of
// `content.locales`; a file for another locale fails the build when it starts
function configYamlDependency(siteRoot: string, locales: readonly Locale[]) {
	const lock = path.resolve(siteRoot, siteLockPath())
	const dictionaries = locales.map((locale) => path.resolve(siteRoot, siteDictionaryPath(locale)))
	const watched = new Map([
		[path.join(CORE_SRC, 'config', 'site.ts'), [lock]],
		[path.join(CORE_SRC, 'config', 'seo.ts'), [lock]],
		[path.join(CORE_SRC, 'i18n', 'ui.ts'), [lock, ...dictionaries]],
	])
	return {
		name: 'astrum-scena:config-yaml-dependency',
		transform(this: { addWatchFile(id: string): void }, _code: string, id: string) {
			for (const file of watched.get(path.resolve(id.split('?')[0]!)) ?? [])
				this.addWatchFile(file)
		},
	}
}

// content of a module the site has not enabled, and a moreDocs target of such a module, would be
// silently left out of the build
async function assertModuleContent(siteRoot: string, modules: readonly ModuleManifest[]) {
	const enabled = modules.map((module) => module.id)
	const errors = [
		...disabledModuleContentErrors(siteRoot, enabled),
		...(await moduleTargetErrors(siteRoot, modules)),
	]
	if (errors.length > 0) throw new Error(errors.join('\n'))
}

// a name of an enabled module that the core or another module owns, and a page the `[slug]` route
// would build under a segment a static route serves, published or unlisted, fail together
function assertNoCollisions(
	site: SiteConfig,
	modules: readonly ModuleManifest[],
	snapshot: ContentSnapshot,
) {
	const pages = collectPublishedDocuments(
		snapshot.pages,
		site.content,
		(data) => data.slug !== 'home',
	).map((page) => ({ id: page.translationKey, slug: page.slug }))
	const errors = [...moduleCollisions(modules), ...slugCollisions(pages, modules)]
	if (errors.length > 0) throw new Error(`name collisions:\n  ${errors.join('\n  ')}`)
}

// a menu item links to `/{locale}/<segment>/`, which exists for a section of the core, an enabled
// module's section or a published page; the segment of a disabled module already fails its schema
function assertMenuSegments(
	site: SiteConfig,
	modules: readonly ModuleManifest[],
	snapshot: ContentSnapshot,
) {
	const pages = collectPublishedDocuments(snapshot.pages, site.content)
		.map((page) => page.slug)
		.filter((slug) => slug !== 'home')
	const known = [...coreSegments(), ...modules.flatMap((module) => module.menu), ...pages]
	const issues = unknownMenuSegmentIssues(site.menu.items, known)
	if (issues.length > 0) throw siteConfigError(issues)
}

// the React renderer is a peer: Astro resolves it from the site root, so a copy bundled with the core
// would break the build (ADR-0016)
export default function astrumScena(): AstroIntegration {
	return {
		name: INTEGRATION_NAME,
		hooks: {
			'astro:config:setup': async ({ config, injectRoute, updateConfig }) => {
				const siteRoot = fileURLToPath(config.root)
				// the only gate of point names: an unknown point or a file that is not a component fails
				// the build and `astro dev` before anything compiles
				const replacements = siteReplacements(siteRoot)
				const site = loadSiteConfig(siteRoot)
				const { content, origin } = site
				const imagesOrigin = externalImageOrigin(loadImagePublicConfig(siteRoot).config)

				// the modules the lock enables, read once; their content, names, routes and menu
				// segments are checked here, before anything compiles
				const modules = enabledModules(site)
				await assertModuleContent(siteRoot, modules)
				const snapshot = await loadContentSnapshot(
					siteRoot,
					modules,
					content.locales,
					content.taxonomy,
				)
				assertNoCollisions(site, modules, snapshot)
				assertMenuSegments(site, modules, snapshot)
				// unlisted documents, albums and photos are built but kept out of the sitemap (ADR-0010)
				const { unlisted } = buildRedirectRouteSets(snapshot, content, modules)
				// the default titles of the directive blocks come from the site's dictionaries
				const dictionaries = loadDictionaries(siteRoot, content.locales, modules)

				// every locale is prefixed (/{locale}/…); the production root redirect to the default
				// locale is appended to `_redirects` at build time (siteFiles)
				updateConfig({
					site: origin,
					// the default `compressHTML: true` removes the whitespace between text and an inline
					// tag instead of collapsing it to one space as a browser would, so "use the" +
					// newline + "<a>contact page</a>" rendered as "thecontact page". The bug is invisible
					// in the source and only `{' '}` at each line end avoids it; the indentation costs a
					// few kilobytes before compression and almost nothing after brotli.
					compressHTML: false,
					i18n: {
						locales: content.locales,
						defaultLocale: defaultLocale({ content }),
						// the other two are Astro's defaults; updateConfig takes the resolved shape
						routing: {
							prefixDefaultLocale: true,
							redirectToDefaultLocale: false,
							fallbackType: 'redirect',
						},
					},
					// container directives `:::name … :::` work in plain `.md` without turning a document
					// into MDX. Sätteri is Astro's default processor, so its own feature is enabled
					// instead of moving the whole corpus to unified for one parser
					// (`markdown.remarkPlugins` is deprecated as well). Each directive's mdast plugin
					// validates its node strictly and replaces it with static HTML. MDX inherits these
					// plugins, so the core-imports check rejects ESM imports of core internals in MDX.
					markdown: {
						processor: satteri({
							features: { directive: true },
							mdastPlugins: [
								calloutMdastPlugin,
								noteMdastPlugin((locale) => dictionaries[locale]?.['note.title']),
								linksMdastPlugin((locale) => dictionaries[locale]?.['links.title']),
								coreImportsMdastPlugin(),
							],
						}),
					},
					integrations: [
						react(),
						mdx(),
						sitemap({
							filter: createSitemapFilter(unlisted),
							serialize: (item) => ({ ...item, url: canonicalSitemapUrl(item.url) }),
						}),
						siteFiles({
							origin,
							defaultLocale: defaultLocale({ content }),
							imagesOrigin,
							turnstileOrigin: new URL(TURNSTILE_SRC).origin,
						}),
					],
					vite: {
						plugins: [
							siteRootModule(siteRoot),
							overridesModule(replacements),
							siteSources(siteRoot),
							themeTokensPlugin(siteRoot),
							tailwindcss(),
							configYamlDependency(siteRoot, content.locales),
							variantCssPlugin({
								coreRoot: CORE_ROOT,
								siteRoot,
								siteConfigFile: path.resolve(siteRoot, siteLockPath()),
								loadSite: () => loadSiteConfig(siteRoot),
							}),
						],
						// astro builds with target `esnext`, so lightningcss minifies without targets and
						// folds `animation-timeline` into the `animation` shorthand, where it is reset-only
						// and Chrome drops the whole declaration. esbuild keeps the longhands separate.
						build: { cssMinify: 'esbuild' },
						...(process.env.IMAGES_LOCAL_MANIFEST
							? { server: { strictPort: true } }
							: {}),
					},
				})
				for (const route of coreRoutes()) injectRoute(route)
				for (const module of modules)
					for (const route of coreRoutes(module.pagesDir)) injectRoute(route)
			},
		},
	}
}
