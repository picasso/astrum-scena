import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
import postcss, { type AtRule } from 'postcss'
import { describe, expect, it } from 'vitest'

import { siteSourcesCss } from '../integration-parts.ts'

// the boundary itself: dropping `source(none)` brings back auto-detection over the whole repo, dropping
// the exclusion lets words of article texts into the CSS. The production build check covers the doc
// side on the real `dist`; article texts have no fixed marker, so this pins the configuration.
const globalCss = readFileSync(fileURLToPath(new URL('./global.css', import.meta.url)), 'utf8')
const atRules = (css: string, name: string): string[] =>
	(postcss.parse(css).nodes ?? []).flatMap((node) =>
		node.type === 'atrule' && node.name === name ? [(node as AtRule).params.trim()] : [],
	)

describe('Tailwind sources of global.css', () => {
	it('imports Tailwind with auto-detection off', () => {
		expect(
			atRules(globalCss, 'import').filter((params) => /^['"]tailwindcss['"]/.test(params)),
		).toEqual(["'tailwindcss' source(none)"])
	})

	it("scans the core's src/ without what the published package leaves out", () => {
		const { files } = JSON.parse(
			readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
		) as { files: string[] }
		const unpublished = files
			.filter((entry) => entry.startsWith('!src/'))
			.map((entry) => `not '../${entry.slice('!src/'.length)}'`)
		expect(unpublished.length).toBeGreaterThan(0)
		expect(atRules(globalCss, 'source')).toEqual(["'../'", ...unpublished])
	})

	// the directives above only say what is meant; this asks Tailwind's own scanner what it reads
	it('leaves tests and fixtures out of the files Tailwind scans', async () => {
		const stylesDir = fileURLToPath(new URL('.', import.meta.url))
		const sources = globalCss.split('\n').filter((line) => line.startsWith('@source'))
		const compiler = await compile(
			["@import 'tailwindcss' source(none);", ...sources].join('\n'),
			{
				base: stylesDir,
				onDependency: () => {},
			},
		)
		const scanner = new Scanner({ sources: compiler.sources })
		scanner.scan()
		const unpublished =
			/\.test\.tsx?$|\/(?:__fixtures__|test-fixtures|config\/fixtures)\/|\/test-fixtures\.ts$/
		expect(scanner.files.some((file) => file.endsWith('.astro'))).toBe(true)
		expect(scanner.files.filter((file) => unpublished.test(file))).toEqual([])
		expect(
			existsSync(fileURLToPath(new URL('./tailwind-sources.test.ts', import.meta.url))),
		).toBe(true)
	})

	it("adds the site's src/ without the content texts, from the site root", () => {
		const site = path.join('/site', 'src')
		expect(atRules(siteSourcesCss('/site'), 'source')).toEqual([
			JSON.stringify(site),
			`not ${JSON.stringify(path.join(site, 'content'))}`,
		])
	})
})
