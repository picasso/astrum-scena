import { readdirSync } from 'node:fs'
import path from 'node:path'

import { CORE_ROOT } from './core-root.ts'

// the integration's pieces its tests reach directly; they are not part of the package's `exports`

export const INTEGRATION_NAME = '@picasso-ai/astrum-scena'

// two roots: core resources (routes, components, styles) are addressed from the installed package,
// and the site's config, content, theme and derived files from Astro's `config.root`. Neither comes
// from cwd, since `astro build --root <site>` may run from any ancestor of the site.
export const CORE_SRC = path.join(CORE_ROOT, 'src')
const PAGES_DIR = path.join(CORE_SRC, 'pages')
export const GLOBAL_CSS = path.join(CORE_SRC, 'styles', 'global.css')

export const SITE_ROOT_MODULE = 'virtual:astrum-scena/site-root'
export const OVERRIDES_MODULE = 'virtual:astrum-scena/overrides'
export const LUCIDE_ICONS_MODULE = 'virtual:astrum-scena/lucide-icons'

// the components a site replaces points with, keyed by point; the core's components read it and fall
// back to their own part for a point that is not there
export const overridesModuleSource = (replacements: ReadonlyMap<string, string>): string => {
	const points = [...replacements]
	return [
		...points.map(([, file], index) => `import r${index} from ${JSON.stringify(file)}`),
		`export const overrides = {${points.map(([point], index) => ` ${JSON.stringify(point)}: r${index},`).join('')} }`,
	].join('\n')
}

// file-based routing of the core's `src/pages`, replayed through injectRoute: `index` names its
// directory and `[param]` segments stay as they are
export function coreRoutes(pagesDir = PAGES_DIR): { pattern: string; entrypoint: string }[] {
	return readdirSync(pagesDir, { recursive: true, encoding: 'utf8' })
		.filter((file) => file.endsWith('.astro'))
		.sort()
		.map((file) => {
			const segments = file.slice(0, -'.astro'.length).split(path.sep)
			if (segments.at(-1) === 'index') segments.pop()
			return { pattern: `/${segments.join('/')}`, entrypoint: path.join(pagesDir, file) }
		})
}

// the first segments under `/{locale}/` that the core's own pages serve (`portfolio`, `articles`, …);
// a dynamic segment such as `[slug]` is not one
export const coreSegments = (pagesDir = PAGES_DIR): string[] => [
	...new Set(
		coreRoutes(pagesDir)
			.map(({ pattern }) => pattern.split('/')[2])
			.filter((segment): segment is string => !!segment && !segment.startsWith('[')),
	),
]

// the Tailwind compiler resolves `@source` against the stylesheet, which lives in the package, so the
// site's own sources are appended to the core stylesheet as absolute paths before it compiles
export const siteSourcesCss = (siteRoot: string): string => {
	const src = path.join(siteRoot, 'src')
	return [
		`@source ${JSON.stringify(src)};`,
		`@source not ${JSON.stringify(path.join(src, 'content'))};`,
	].join('\n')
}
