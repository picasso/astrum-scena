import { fileURLToPath } from 'node:url'

// the Prettier preset of the core: a site's `prettier.config.mjs` default-exports it. The Astro
// plugin is an optional peer of the core, resolved from here so the site's config needs no plugin
// list; without it every other file is formatted and `.astro` files are left to the site.
function resolvePlugin(name) {
	try {
		return fileURLToPath(import.meta.resolve(name))
	} catch {
		return undefined
	}
}

const astroPlugin = resolvePlugin('prettier-plugin-astro')

export const astrumScenaPrettier = {
	useTabs: true,
	tabWidth: 4,
	semi: false,
	singleQuote: true,
	printWidth: 100,
	trailingComma: 'all',
	arrowParens: 'always',
	endOfLine: 'lf',
	bracketSpacing: true,
	jsxSingleQuote: false,
	quoteProps: 'as-needed',
	plugins: astroPlugin ? [astroPlugin] : [],
	overrides: [
		...(astroPlugin ? [{ files: '*.astro', options: { parser: 'astro' } }] : []),
		{ files: '*.mdx', options: { useTabs: false } },
	],
}
