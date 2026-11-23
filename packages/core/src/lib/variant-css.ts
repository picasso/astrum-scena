import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'astro/zod'
import { parse } from 'yaml'

import type { SiteConfig } from '../config/site-schema.ts'
import { ALBUM_LAYOUTS, type AlbumLayout } from '../config/variants.ts'

// astro bundles CSS by the route's module graph, not by what renders, so a component importing every
// variant stylesheet would ship them all. Each owner imports `virtual:variant-css/<family>` instead, and
// the plugin expands it into imports of the selected variants only. The stylesheets ship with the core
// and the albums belong to the site, so each is read from its own root.

const VIRTUAL_PREFIX = 'virtual:variant-css/'
const RESOLVED_PREFIX = `\0${VIRTUAL_PREFIX}`
const ALBUMS_DIR = 'src/content/albums'

// relative to the core package root
export const VARIANT_CSS_DIRS = {
	'menu-effect': 'src/components/menu-effects',
	'top-pattern': 'src/components/top-patterns',
	'album-layout': 'src/components/portfolio/album-layouts',
	'card-look': 'src/components/card-looks',
} as const

export type VariantCssFamily = keyof typeof VARIANT_CSS_DIRS

export type VariantCssSite = Pick<
	SiteConfig,
	'menu' | 'topSection' | 'album' | 'portfolio' | 'moreDocs'
>

const files = (family: VariantCssFamily, names: Iterable<string>): string[] =>
	[...new Set(names)].sort().map((name) => `${VARIANT_CSS_DIRS[family]}/${name}.css`)

// stylesheets per family, relative to the core package root. A family takes the union of every config
// place that picks it: `off` has no file and `details` is the card base in card.css.
export function selectVariantCss(
	site: VariantCssSite,
	albums: readonly { layout?: AlbumLayout }[],
): Record<VariantCssFamily, string[]> {
	const animate = site.menu.animate
	const pattern = site.topSection.pattern
	const looks = [site.portfolio.card, ...Object.values(site.moreDocs).map((more) => more.card)]
	return {
		'menu-effect': files('menu-effect', animate === 'off' ? [] : [animate]),
		'top-pattern': files('top-pattern', pattern === 'off' ? [] : [pattern]),
		'album-layout': files('album-layout', [
			site.album.layout,
			...albums.flatMap((album) => (album.layout ? [album.layout] : [])),
		]),
		// a title-slide card without a frame renders as title-strip (card.astro)
		'card-look': files(
			'card-look',
			looks.flatMap((look) =>
				look === 'details' ? [] : look === 'title-slide' ? [look, 'title-strip'] : [look],
			),
		),
	}
}

const albumLayoutSchema = z.object({ layout: z.enum(ALBUM_LAYOUTS).optional() })

// reads only `layout` of every album; the full content snapshot is validated elsewhere. A site without
// albums has no directory, and the site default alone selects the layout.
export function readAlbumLayouts(siteRoot: string): { file: string; layout?: AlbumLayout }[] {
	const directory = path.resolve(siteRoot, ALBUMS_DIR)
	if (!existsSync(directory)) return []
	return readdirSync(directory, { recursive: true, encoding: 'utf8' })
		.filter((name) => /\.ya?ml$/.test(name))
		.sort()
		.map((name) => {
			const file = path.join(directory, name)
			const result = albumLayoutSchema.safeParse(parse(readFileSync(file, 'utf8')))
			if (!result.success) throw new Error(`${file}: ${result.error.message}`)
			return { file, ...result.data }
		})
}

export const isVariantCssFamily = (value: string): value is VariantCssFamily =>
	Object.hasOwn(VARIANT_CSS_DIRS, value)

type PluginContext = { addWatchFile(id: string): void }

const imports = (coreRoot: string, selected: readonly string[]): string =>
	selected.length === 0
		? 'export {}'
		: selected
				.map((file) => `import ${JSON.stringify(path.resolve(coreRoot, file))}`)
				.join('\n')

// `coreRoot` holds the stylesheets and `siteRoot` the albums. `loadSite` reads the config through the
// single loader (lib never imports it) and `siteConfigFile` (the site's lock) is watched so a resolved
// config or an album edit re-selects the files in dev.
export function variantCssPlugin(options: {
	coreRoot: string
	siteRoot: string
	siteConfigFile: string
	loadSite: () => VariantCssSite
}) {
	return {
		name: 'variant-css',
		resolveId(id: string) {
			if (!id.startsWith(VIRTUAL_PREFIX)) return undefined
			const family = id.slice(VIRTUAL_PREFIX.length)
			if (!isVariantCssFamily(family))
				throw new Error(`unknown variant CSS family: ${family}`)
			return `${RESOLVED_PREFIX}${family}`
		},
		load(this: PluginContext, id: string) {
			if (!id.startsWith(RESOLVED_PREFIX)) return undefined
			const family = id.slice(RESOLVED_PREFIX.length) as VariantCssFamily
			this.addWatchFile(options.siteConfigFile)
			// only the album-layout module depends on the albums, so only it re-selects on their edits
			const albums = family === 'album-layout' ? readAlbumLayouts(options.siteRoot) : []
			for (const album of albums) this.addWatchFile(album.file)
			return imports(options.coreRoot, selectVariantCss(options.loadSite(), albums)[family])
		},
	}
}
