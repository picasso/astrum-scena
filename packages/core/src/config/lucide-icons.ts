import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import type { DimensionConfig } from './taxonomy.ts'

// the icons of the dimensions come from the core's `lucide-static` dependency: a name is checked
// against its `icons/` folder and the SVG is read from there at build time. The folder is resolved
// from this module in Node (the integration and the CLI), never from cwd; a page reads it from
// `virtual:astrum-scena/lucide-icons`, since a bundled page module has no stable location of its own.

export function lucideIconsDir(): string {
	const require = createRequire(import.meta.url)
	return path.join(path.dirname(require.resolve('lucide-static/package.json')), 'icons')
}

// the schema already holds `name` to kebab-case, so it cannot leave the folder
const iconFile = (dir: string, name: string) => path.join(dir, `${name}.svg`)

// a dimension whose icon the package does not have, by its site.yaml path
export function dimensionIconIssues(
	dimensions: Readonly<Record<string, DimensionConfig>>,
	dir: string = lucideIconsDir(),
): { path: string[]; message: string }[] {
	return Object.entries(dimensions).flatMap(([id, { icon }]) =>
		icon === undefined || existsSync(iconFile(dir, icon))
			? []
			: [
					{
						path: ['content', 'taxonomy', 'dimensions', id, 'icon'],
						message: `"${icon}" is not a Lucide icon of lucide-static (https://lucide.dev/icons)`,
					},
				],
	)
}

// the package's file on one line, its licence comment kept; only this text reaches the page
export function lucideIconSvg(dir: string, name: string): string {
	const file = iconFile(dir, name)
	if (!existsSync(file)) throw new Error(`"${name}" is not a Lucide icon of lucide-static`)
	const svg = readFileSync(file, 'utf8')
		.trim()
		.replace(/\s*\n\s*/g, ' ')
	const markup = svg.replace(/^<!--[\s\S]*?-->\s*/, '')
	if (!markup.startsWith('<svg') || !svg.endsWith('</svg>'))
		throw new Error(`${file}: not an SVG document`)
	return svg
}
