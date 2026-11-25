import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, type Page, test } from '@playwright/test'

import { loadSiteConfig } from '../packages/core/src/config/loader.ts'
import type { Locale } from '../packages/core/src/config/locale-schema.ts'
import { type LocalizedLabel, localizedLabel } from '../packages/core/src/config/localized-label.ts'
import type { SiteConfig } from '../packages/core/src/config/site-schema.ts'
import {
	languageKey,
	loadDictionaries,
	type UIKey,
} from '../packages/core/src/i18n/dictionaries.ts'
import { enabledModules } from '../packages/core/src/modules/registry.ts'

// every expected value comes from the demo's config lock, its content and the core dictionaries, read
// through the core loaders, so editing the demo changes what the suite expects without a copy here

export const DEMO_ROOT = fileURLToPath(new URL('../demo/', import.meta.url))
const CORE_SRC = new URL('../packages/core/src/', import.meta.url)
export const demoConfig = loadSiteConfig(DEMO_ROOT)

export type Lang = Locale

// only the active locales have a text, so the type does not promise the others
export type PerLocale = Partial<Record<Lang, string>>

export type RouteDef = {
	segment: string
	labels: PerLocale
}

export function perLocale(locales: readonly Lang[], value: (lang: Lang) => string): PerLocale {
	return Object.fromEntries(locales.map((lang) => [lang, value(lang)]))
}

export function siteData(config: SiteConfig) {
	const { locales, referenceLocale } = config.content
	const labels = (text: LocalizedLabel) =>
		perLocale(locales, (lang) => localizedLabel(text, lang))
	return {
		locales,
		referenceLocale,
		// from `menu.items`, so adding, removing, reordering or relabelling an item changes what the
		// suite walks
		navRoutes: config.menu.items.map((item): RouteDef => ({
			segment: item.segment,
			labels: labels(item.label),
		})),
		siteTitle: labels(config.identity.title),
	}
}

export const { locales, referenceLocale, navRoutes, siteTitle } = siteData(demoConfig)

// the text of an active locale; asking for another one is a bug in the spec
export function textFor(texts: PerLocale, lang: Lang): string {
	const text = texts[lang]
	if (text === undefined) throw new Error(`no "${lang}" text: the locale is not active`)
	return text
}

// the first active locale other than `lang`; undefined on a one-locale site
export function otherLocale(lang: Lang): Lang | undefined {
	return locales.find((locale) => locale !== lang)
}

// the menu item of a section; fails the test when site.yaml drops it
export function navRoute(segment: string): RouteDef {
	const route = navRoutes.find((item) => item.segment === segment)
	if (!route) throw new Error(`site.yaml menu has no "${segment}" item`)
	return route
}

// the demo's dictionaries as its build merges them: the core's texts with the demo's overrides
const dictionaries = loadDictionaries(DEMO_ROOT, locales, enabledModules(demoConfig))

export function t(lang: Lang): (key: UIKey) => string {
	const dictionary = dictionaries[lang]
	if (!dictionary) throw new Error(`no "${lang}" dictionary: the locale is not active`)
	return (key) => dictionary[key]
}

// a language link is named in the language of the page it sits on
export const languageName = (lang: Lang, code: Lang): string => t(lang)(languageKey(code))

export function href(lang: Lang, segment: string): string {
	return segment ? `/${lang}/${segment}/` : `/${lang}/`
}

export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// the URL ends with the path, whatever the origin
export const endsWith = (path: string): RegExp => new RegExp(`${escapeRegExp(path)}$`)

export function viewportWidth(): number {
	return (test.info().project.metadata as { width: number }).width
}

// below lg (1024px) inner pages navigate through the hamburger overlay, at lg and up through the
// inline navbar; on home the overlay is the only navigation at any width
export function isCompactViewport(): boolean {
	return viewportWidth() < 1024
}

export function usesOverlay(isHome: boolean): boolean {
	return isHome || isCompactViewport()
}

// matched by aria-controls because its label flips between open and close
export const menuToggle = (page: Page) => page.locator('button[aria-controls="site-menu-overlay"]')

export const overlayPanel = (page: Page) => page.locator('#site-menu-overlay')

// the panel stays in the DOM and animates between scale(0) and scale(1), so openness is read from
// data-open and aria-expanded rather than toBeHidden()
export async function openMenu(page: Page): Promise<void> {
	await menuToggle(page).click()
	await expect(menuToggle(page)).toHaveAttribute('aria-expanded', 'true')
	await expect(overlayPanel(page)).toHaveAttribute('data-open', 'true')
}

export async function closeMenu(page: Page): Promise<void> {
	await menuToggle(page).click()
	await expect(menuToggle(page)).toHaveAttribute('aria-expanded', 'false')
	await expect(overlayPanel(page)).not.toHaveAttribute('data-open')
}

// through the real control: the overlay below lg, otherwise the header language nav (the footer has
// one too, so the header scope keeps strict mode happy)
export async function switchLanguageVia(page: Page, from: Lang, target: Lang): Promise<void> {
	if (isCompactViewport()) {
		await openMenu(page)
		await overlayPanel(page)
			.getByRole('link', { name: languageName(from, target) })
			.click()
	} else {
		await page
			.getByRole('banner')
			.getByRole('navigation', { name: t(from)('nav.language.label'), exact: true })
			.getByRole('link', { name: languageName(from, target) })
			.click()
	}
}

export async function horizontalOverflow(page: Page): Promise<number> {
	return page.evaluate(() => {
		const doc = document.documentElement
		return Math.max(
			doc.scrollWidth - doc.clientWidth,
			document.body.scrollWidth - doc.clientWidth,
		)
	})
}

// a declaration of the core's own stylesheet (a `.css` file or the `<style>` of an `.astro` one), so a
// spec checks that the rendered page applies the core's contract value without copying it. The first
// rule whose selector list holds `selector` exactly wins, which is the base rule before any media query
export function coreCss(file: string, selector: string, property: string): string {
	const text = readFileSync(new URL(file, CORE_SRC), 'utf8')
	const css = (file.endsWith('.astro') ? text.slice(text.indexOf('<style')) : text).replace(
		/\/\*[\s\S]*?\*\//g,
		'',
	)
	for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		if (!rule[1]!.split(',').some((part) => part.trim() === selector)) continue
		const value = new RegExp(`(?:^|[;\\s])${escapeRegExp(property)}\\s*:\\s*([^;]+)`).exec(
			rule[2]!,
		)?.[1]
		if (value) return value.trim()
	}
	throw new Error(`${file} declares no ${property} for ${selector}`)
}

export function coreFile(file: string): string {
	return readFileSync(new URL(file, CORE_SRC), 'utf8')
}

// the horizontal scroll a reader can do: what overflows the root element. `body` clips
// (`overflow-x: clip`), so a paint that only overflows body is cut at the viewport and not scrollable
export async function documentOverflow(page: Page): Promise<number> {
	return page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	)
}
