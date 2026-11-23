import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CORE_ROOT } from '../core-root.ts'
import { MENU_ANIMATIONS, MENU_WIDTH_LADDER, MENU_WIDTH_MODES, resolveMenuWidth } from './menu.ts'

// static enum↔CSS contract: every implemented effect needs its top-menu modifier and the schema must not
// promise a style that does not exist. Reads the owning components' stylesheets, so it is independent of
// Astro scope hashes. Each effect lives in its own file, loaded only when selected.
const css = readFileSync(path.join(CORE_ROOT, 'src/components/site-nav.css'), 'utf8')
const EFFECTS_DIR = path.join(CORE_ROOT, 'src/components/menu-effects')
const effectCss = (effect: string): string =>
	readFileSync(path.join(EFFECTS_DIR, `${effect}.css`), 'utf8')
const headerCss = readFileSync(path.join(CORE_ROOT, 'src/components/site-header.css'), 'utf8')

// a characteristic declaration per legacy effect proves a real implementation stands behind
// `.anim-<name>`, not an empty placeholder selector
const EFFECT_SIGNATURE: Record<string, string> = {
	'bottom-line-slide-in': '.anim-bottom-line-slide-in .top-menu-link::after',
	'bottom-line-drop': '.anim-bottom-line-drop .top-menu-link::after',
	'word-slide-in': 'content: attr(data-hover)',
	'circles-expand': '.anim-circles-expand .top-menu-label::before',
	'bottom-dots-expand': '.anim-bottom-dots-expand .top-menu-link::before',
	'borders-slide-in': '.anim-borders-slide-in .top-menu-link::before',
	'opacity-change': '.anim-opacity-change .top-menu-link',
	'text-grow': '.anim-text-grow .top-menu-label',
	'text-bounce-in': '.anim-text-bounce-in .top-menu-label',
}

describe('menu animation contract', () => {
	it('lists off plus the nine legacy effects, in order', () => {
		expect([...MENU_ANIMATIONS]).toEqual([
			'off',
			'bottom-line-slide-in',
			'bottom-line-drop',
			'word-slide-in',
			'circles-expand',
			'bottom-dots-expand',
			'borders-slide-in',
			'opacity-change',
			'text-grow',
			'text-bounce-in',
		])
	})

	// otherwise the schema would accept a value the runtime silently ignores
	it('has a top-menu CSS modifier for every non-off effect in its own file', () => {
		for (const effect of MENU_ANIMATIONS) {
			if (effect === 'off') continue
			expect(effectCss(effect), `missing .anim-${effect} in ${effect}.css`).toContain(
				`.anim-${effect}`,
			)
		}
	})

	// an effect file styles only its own effect, and the owner keeps none of them
	it('keeps every effect out of site-nav.css and out of the other effect files', () => {
		for (const effect of MENU_ANIMATIONS) {
			if (effect === 'off') continue
			expect(css).not.toContain(`.anim-${effect} `)
			const others = MENU_ANIMATIONS.filter((name) => name !== 'off' && name !== effect)
			for (const other of others) expect(effectCss(effect)).not.toContain(`.anim-${other} `)
		}
	})

	it('implements the characteristic declaration of every effect', () => {
		for (const effect of MENU_ANIMATIONS) {
			if (effect === 'off') continue
			const signature = EFFECT_SIGNATURE[effect]
			expect(signature, `no signature registered for ${effect}`).toBeTruthy()
			expect(effectCss(effect), `missing declaration for ${effect}`).toContain(signature)
		}
	})

	it('never emits an .anim-off modifier', () => {
		expect(css).not.toContain('.anim-off')
		expect(existsSync(path.join(EFFECTS_DIR, 'off.css'))).toBe(false)
	})

	// the CSS must not get ahead of the schema
	it('has an effect file for exactly the non-off effects', () => {
		expect(
			readdirSync(EFFECTS_DIR)
				.map((name) => name.replace(/\.css$/, ''))
				.sort(),
		).toEqual(
			MENU_ANIMATIONS.filter((name) => name !== 'off')
				.slice()
				.sort(),
		)
	})

	it('registers a signature for exactly the non-off effects', () => {
		expect(Object.keys(EFFECT_SIGNATURE).sort()).toEqual(
			MENU_ANIMATIONS.filter((name) => name !== 'off')
				.slice()
				.sort(),
		)
	})
})

describe('menu width ladder', () => {
	it('orders tiers narrow → wide', () => {
		expect([...MENU_WIDTH_LADDER]).toEqual(['prose', 'medium', 'standard', 'gallery'])
	})

	// otherwise the resolver would return a class with no width
	it('has a header container modifier for every width tier', () => {
		for (const tier of MENU_WIDTH_LADDER) {
			expect(headerCss, `missing .site-header__inner--${tier}`).toContain(
				`.site-header__inner--${tier}`,
			)
		}
	})
})

describe('menu width mode', () => {
	it('lists the screen and adaptive modes', () => {
		expect([...MENU_WIDTH_MODES]).toEqual(['screen', 'adaptive'])
	})

	it('has a header container modifier for the screen mode', () => {
		expect(headerCss).toContain('.site-header__inner--screen')
	})
})

describe('resolveMenuWidth', () => {
	it('keeps the page width when it is at least the minimum', () => {
		expect(resolveMenuWidth('gallery', 'medium')).toBe('gallery')
		expect(resolveMenuWidth('standard', 'medium')).toBe('standard')
		expect(resolveMenuWidth('medium', 'medium')).toBe('medium')
	})

	it('widens up to the minimum when the page is narrower', () => {
		expect(resolveMenuWidth('prose', 'medium')).toBe('medium')
		expect(resolveMenuWidth('prose', 'gallery')).toBe('gallery')
		expect(resolveMenuWidth('medium', 'standard')).toBe('standard')
	})

	it('never widens below the narrowest minimum', () => {
		expect(resolveMenuWidth('prose', 'prose')).toBe('prose')
		expect(resolveMenuWidth('gallery', 'prose')).toBe('gallery')
	})
})
