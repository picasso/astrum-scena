import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it, vi } from 'vitest'

import { SITE_LOCK_PATH } from '../config/lock.ts'
import { MENU_ANIMATIONS } from '../config/menu.ts'
import type { TopSectionPattern } from '../config/site-schema.ts'
import { ALBUM_LAYOUTS, CARD_PRESENTATIONS, type CardPresentation } from '../config/variants.ts'
import { CORE_ROOT } from '../core-root.ts'
import {
	selectVariantCss,
	VARIANT_CSS_DIRS,
	variantCssPlugin,
	type VariantCssSite,
} from './variant-css.ts'

const root = CORE_ROOT

// only the fields the selection reads; the real site config is never pinned
function site(
	overrides: {
		animate?: VariantCssSite['menu']['animate']
		pattern?: TopSectionPattern
		layout?: VariantCssSite['album']['layout']
		portfolioCard?: CardPresentation
		articleCard?: CardPresentation
	} = {},
): VariantCssSite {
	const more = (card: CardPresentation) => ({ card })
	return {
		menu: { animate: overrides.animate ?? 'word-slide-in' },
		topSection: { pattern: overrides.pattern ?? 'off' },
		album: { layout: overrides.layout ?? 'justified' },
		portfolio: { card: overrides.portfolioCard ?? 'details' },
		moreDocs: {
			article: more(overrides.articleCard ?? 'details'),
			course: more('details'),
			page: more('details'),
		},
	} as unknown as VariantCssSite
}

const PATTERNS: Record<TopSectionPattern, true> = {
	off: true,
	plain: true,
	radial: true,
	diagonal: true,
	hatch: true,
	carbon: true,
	weave: true,
}

describe('selectVariantCss', () => {
	it('selects only the configured effect and layout for a details-only site', () => {
		expect(selectVariantCss(site(), [])).toEqual({
			'menu-effect': ['src/components/menu-effects/word-slide-in.css'],
			'top-pattern': [],
			'album-layout': ['src/components/portfolio/album-layouts/justified.css'],
			'card-look': [],
		})
	})

	it('leaves the effect and pattern modules empty when they are off', () => {
		const selected = selectVariantCss(site({ animate: 'off', pattern: 'off' }), [])
		expect(selected['menu-effect']).toEqual([])
		expect(selected['top-pattern']).toEqual([])
	})

	it('adds the layouts albums override to the site default', () => {
		const selected = selectVariantCss(site({ layout: 'justified' }), [
			{ layout: 'masonry' },
			{},
			{ layout: 'justified' },
		])
		expect(selected['album-layout']).toEqual([
			'src/components/portfolio/album-layouts/justified.css',
			'src/components/portfolio/album-layouts/masonry.css',
		])
	})

	it('takes every card look of portfolio and moreDocs', () => {
		const selected = selectVariantCss(
			site({ portfolioCard: 'title-slide', articleCard: 'title-strip' }),
			[],
		)
		expect(selected['card-look']).toEqual([
			'src/components/card-looks/title-slide.css',
			'src/components/card-looks/title-strip.css',
		])
	})

	it('adds title-strip to title-slide, which renders it for a card without a frame', () => {
		expect(selectVariantCss(site({ portfolioCard: 'title-slide' }), [])['card-look']).toEqual([
			'src/components/card-looks/title-slide.css',
			'src/components/card-looks/title-strip.css',
		])
	})

	it('maps every selectable value to its exact stylesheets, none only for off and details', () => {
		const file = (family: keyof typeof VARIANT_CSS_DIRS, name: string) =>
			`${VARIANT_CSS_DIRS[family]}/${name}.css`
		for (const animate of MENU_ANIMATIONS)
			expect(selectVariantCss(site({ animate }), [])['menu-effect']).toEqual(
				animate === 'off' ? [] : [file('menu-effect', animate)],
			)
		for (const pattern of Object.keys(PATTERNS) as TopSectionPattern[])
			expect(selectVariantCss(site({ pattern }), [])['top-pattern']).toEqual(
				pattern === 'off' ? [] : [file('top-pattern', pattern)],
			)
		for (const layout of ALBUM_LAYOUTS)
			expect(selectVariantCss(site({ layout }), [])['album-layout']).toEqual([
				file('album-layout', layout),
			])
		const looks: Record<CardPresentation, string[]> = {
			details: [],
			'title-strip': [file('card-look', 'title-strip')],
			'title-slide': [file('card-look', 'title-slide'), file('card-look', 'title-strip')],
		}
		for (const look of CARD_PRESENTATIONS) {
			expect(selectVariantCss(site({ portfolioCard: look }), [])['card-look']).toEqual(
				looks[look],
			)
			expect(selectVariantCss(site({ articleCard: look }), [])['card-look']).toEqual(
				looks[look],
			)
		}
		const every = [
			...MENU_ANIMATIONS.map((animate) => site({ animate })),
			...(Object.keys(PATTERNS) as TopSectionPattern[]).map((pattern) => site({ pattern })),
			...ALBUM_LAYOUTS.map((layout) => site({ layout })),
			...CARD_PRESENTATIONS.map((portfolioCard) => site({ portfolioCard })),
		].flatMap((config) => Object.values(selectVariantCss(config, [])).flat())
		for (const selected of every)
			expect(existsSync(path.resolve(root, selected)), selected).toBe(true)
	})
})

describe('variant stylesheets', () => {
	it('lets the shared rules come from a file the variants import', () => {
		for (const look of ['title-strip', 'title-slide'])
			expect(
				readFileSync(
					path.resolve(root, VARIANT_CSS_DIRS['card-look'], `${look}.css`),
					'utf8',
				),
			).toContain("@import './compact.css';")
		for (const layout of ['square', 'rect'])
			expect(
				readFileSync(
					path.resolve(root, VARIANT_CSS_DIRS['album-layout'], `${layout}.css`),
					'utf8',
				),
			).toContain("@import './crop.css';")
	})
})

const fixtures: string[] = []
afterAll(() => {
	for (const fixture of fixtures) rmSync(fixture, { recursive: true, force: true })
})

describe('variantCssPlugin', () => {
	const siteConfigFile = path.resolve(root, SITE_LOCK_PATH)
	const plugin = variantCssPlugin({
		coreRoot: root,
		siteRoot: root,
		siteConfigFile,
		loadSite: () => site({ animate: 'off', layout: 'square' }),
	})

	it('resolves a known family and fails on an unknown one by name', () => {
		expect(plugin.resolveId('virtual:variant-css/card-look')).toBe(
			'\0virtual:variant-css/card-look',
		)
		expect(plugin.resolveId('./card.css')).toBeUndefined()
		expect(() => plugin.resolveId('virtual:variant-css/foo')).toThrow(
			'unknown variant CSS family: foo',
		)
	})

	it('selects the site default plus album overrides read from disk, and only that module watches albums', () => {
		const fixture = mkdtempSync(path.join(tmpdir(), 'variant-css-'))
		fixtures.push(fixture)
		const albums = path.join(fixture, 'src/content/albums')
		mkdirSync(albums, { recursive: true })
		writeFileSync(path.join(albums, 'override.yaml'), 'layout: masonry\n')
		writeFileSync(path.join(albums, 'inherit.yaml'), 'status: published\n')
		const fixturePlugin = variantCssPlugin({
			coreRoot: root,
			siteRoot: fixture,
			siteConfigFile,
			loadSite: () => site({ layout: 'square' }),
		})
		const addWatchFile = vi.fn()
		const code = fixturePlugin.load.call({ addWatchFile }, '\0virtual:variant-css/album-layout')
		const layoutFile = (name: string) =>
			path.resolve(root, VARIANT_CSS_DIRS['album-layout'], `${name}.css`)
		expect(code).toBe(
			[layoutFile('masonry'), layoutFile('square')]
				.map((file) => `import ${JSON.stringify(file)}`)
				.join('\n'),
		)
		expect(addWatchFile.mock.calls.map(([file]) => file).sort()).toEqual(
			[
				siteConfigFile,
				path.join(albums, 'inherit.yaml'),
				path.join(albums, 'override.yaml'),
			].sort(),
		)

		const navWatch = vi.fn()
		fixturePlugin.load.call({ addWatchFile: navWatch }, '\0virtual:variant-css/menu-effect')
		expect(navWatch.mock.calls).toEqual([[siteConfigFile]])
	})

	it('takes the stylesheets from the core and only the site default when the site has no albums', () => {
		const fixture = mkdtempSync(path.join(tmpdir(), 'variant-css-'))
		fixtures.push(fixture)
		const fixturePlugin = variantCssPlugin({
			coreRoot: root,
			siteRoot: fixture,
			siteConfigFile,
			loadSite: () => site({ layout: 'square' }),
		})
		const code = fixturePlugin.load.call(
			{ addWatchFile: vi.fn() },
			'\0virtual:variant-css/album-layout',
		)
		const square = path.resolve(root, VARIANT_CSS_DIRS['album-layout'], 'square.css')
		expect(code).toBe(`import ${JSON.stringify(square)}`)
	})

	it('emits an empty module for an off family', () => {
		const code = plugin.load.call(
			{ addWatchFile: vi.fn() },
			'\0virtual:variant-css/menu-effect',
		)
		expect(code).toBe('export {}')
	})

	it('ignores other modules', () => {
		expect(plugin.load.call({ addWatchFile: vi.fn() }, '/src/card.css')).toBeUndefined()
	})
})
