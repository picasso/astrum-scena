import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { LOCALE_CATALOG, type LocaleScript } from '../config/locale-schema.ts'
import { siteRoot } from '../config/site-root.ts'
import { fontPreloads } from './fonts.ts'

// the core preloads font files by name, so the site's theme.css and public/fonts must declare and
// serve exactly those; the families and file names are read from the site, not pinned
const css = readFileSync(path.join(siteRoot, 'src/theme/theme.css'), 'utf8')
const publicDir = path.join(siteRoot, 'public')

type FontFace = {
	family: string
	style: string
	weight: string
	urls: string[]
	formats: string[]
	range: Set<number>
}

function parseRange(value: string): Set<number> {
	const points = new Set<number>()
	for (const token of value.split(',').map((part) => part.trim())) {
		const match = /^U\+([0-9A-F]{1,6})(?:-([0-9A-F]{1,6}))?$/i.exec(token)
		if (!match) throw new Error(`unsupported unicode-range token "${token}"`)
		const start = parseInt(match[1]!, 16)
		const end = match[2] ? parseInt(match[2], 16) : start
		for (let point = start; point <= end; point += 1) points.add(point)
	}
	return points
}

function descriptor(block: string, name: string): string | undefined {
	return new RegExp(`(?:^|[;{\\s])${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim()
}

const faces: FontFace[] = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, block]) => {
	const range = descriptor(block!, 'unicode-range')
	return {
		family: descriptor(block!, 'font-family')!.replace(/['"]/g, ''),
		style: descriptor(block!, 'font-style')!,
		weight: descriptor(block!, 'font-weight')!,
		urls: [...block!.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]!),
		formats: [...block!.matchAll(/format\((['"])([^'"]+)\1\)/g)].map((m) => m[2]!),
		range: range ? parseRange(range) : new Set(),
	}
})

const declaredFiles = faces.flatMap((face) => face.urls)

// file-name suffix of each face → the style and weight it must be declared with
const FACE_FILES: Record<string, string> = {
	regular: 'normal 400',
	italic: 'italic 400',
	'500': 'normal 500',
	'500italic': 'italic 500',
	'700': 'normal 700',
}
const FACES = Object.values(FACE_FILES)
const CYRILLIC = parseRange('U+0400-04FF')

const SCRIPTS = [...new Set(Object.values(LOCALE_CATALOG).map((entry) => entry.script))]

const splitFileName = (url: string): { prefix: string; suffix: string } => {
	const name = url.replace(/\.woff2$/, '')
	const at = name.lastIndexOf('-')
	return { prefix: name.slice(0, at), suffix: name.slice(at + 1) }
}

// the family a script renders with is the one declaring the files the core preloads for it
const familyOf = (script: LocaleScript): string => {
	const families = new Set(
		fontPreloads(script).map((href) => faces.find((face) => face.urls.includes(href))?.family),
	)
	expect([...families], script).toHaveLength(1)
	const [family] = families
	if (family === undefined) throw new Error(`no face declares the ${script} preloads`)
	return family
}

const familyRange = (family: string): Set<number> =>
	faces.find((face) => face.family === family)!.range

function listFiles(dir: string, extension: string): string[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(extension))
		.map((entry) => path.join(entry.parentPath, entry.name).slice(publicDir.length))
}

describe('site @font-face declarations', () => {
	it('declares every face as woff2 only, with a unicode-range', () => {
		expect(faces.length).toBeGreaterThan(0)
		expect(css).not.toMatch(/\.woff['"]/)
		for (const face of faces) {
			expect(face.range.size, `${face.family} ${face.weight}`).toBeGreaterThan(0)
			expect(face.urls.length).toBeGreaterThan(0)
			expect(face.urls.every((url) => url.endsWith('.woff2'))).toBe(true)
			expect(face.formats).toEqual(face.urls.map(() => 'woff2'))
		}
	})

	it('declares one family per script with all five faces and one range per family', () => {
		const families = SCRIPTS.map(familyOf)
		expect(new Set(faces.map((face) => face.family))).toEqual(new Set(families))
		for (const family of families) {
			const ofFamily = faces.filter((face) => face.family === family)
			expect(ofFamily.map((face) => `${face.style} ${face.weight}`).sort()).toEqual(
				[...FACES].sort(),
			)
			const range = familyRange(family)
			for (const face of ofFamily) expect([...face.range]).toEqual([...range])
		}
	})

	it('points every face at its own file of its own family', () => {
		const prefixes = new Map<string, Set<string>>()
		for (const face of faces) {
			for (const url of face.urls) {
				const { prefix, suffix } = splitFileName(url)
				expect(FACE_FILES[suffix], url).toBe(`${face.style} ${face.weight}`)
				prefixes.set(face.family, (prefixes.get(face.family) ?? new Set()).add(prefix))
			}
		}
		for (const [family, ofFamily] of prefixes) expect([...ofFamily], family).toHaveLength(1)
		expect(new Set([...prefixes.values()].flatMap((set) => [...set])).size).toBe(prefixes.size)
	})

	it('keeps Cyrillic out of the latin subset range and covers Basic Latin and Latin-1', () => {
		const latin = familyRange(familyOf('latin'))
		expect([...latin].filter((point) => CYRILLIC.has(point))).toEqual([])
		expect(latin.has(0x2116)).toBe(false)
		// typographic dashes, quotes, ellipsis and the euro sign appear in English copy too
		const required = parseRange(
			'U+0020-007E, U+00A0-00FF, U+2013-2014, U+2018-201A, U+201C-201E, U+2026, U+2039-203A, U+20AC',
		)
		for (const point of required) expect(latin.has(point)).toBe(true)
	})

	it('makes the cyrillic range cover the latin one and the Russian alphabet with ё', () => {
		const full = familyRange(familyOf('cyrillic'))
		for (const point of familyRange(familyOf('latin'))) expect(full.has(point)).toBe(true)
		for (const point of parseRange('U+0400-045F')) expect(full.has(point)).toBe(true)
		expect(full.has('ё'.codePointAt(0)!)).toBe(true)
	})
})

describe('site font files', () => {
	it('serves exactly the declared woff2 files', () => {
		expect(listFiles(path.join(publicDir, 'fonts'), '.woff2').sort()).toEqual(
			[...new Set(declaredFiles)].sort(),
		)
	})

	it('preloads two declared files of the family each script renders with', () => {
		for (const script of SCRIPTS) {
			const family = familyOf(script)
			const files = faces
				.filter((face) => face.family === family)
				.flatMap((face) => face.urls)
			expect(fontPreloads(script)).toHaveLength(2)
			for (const href of fontPreloads(script)) expect(files).toContain(href)
		}
	})
})
