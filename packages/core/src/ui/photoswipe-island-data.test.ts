import { describe, expect, it } from 'vitest'

import {
	type AnchorLike,
	DEFAULT_VIEWER_OPTIONS,
	parseViewerOptions,
	resolveCaption,
	resolveMoreInfoHref,
	resolveShowHideAnimationType,
	resolveViewerChrome,
	resolveViewerPadding,
	shouldFitBars,
	VIEWER_BAR_HEIGHT_PX,
} from './photoswipe-island-data.ts'

// the contract needs only getAttribute
function anchor(attrs: Record<string, string>): AnchorLike {
	return { getAttribute: (name) => attrs[name] ?? null }
}

describe('resolveCaption', () => {
	it('returns the caption from data-pswp-caption', () => {
		expect(resolveCaption({ pswpCaption: 'Dawn over the fjord' })).toBe('Dawn over the fjord')
	})

	it('trims whitespace', () => {
		expect(resolveCaption({ pswpCaption: '  spaced  ' })).toBe('spaced')
	})

	it('is empty, not undefined, without a caption or dataset', () => {
		expect(resolveCaption({})).toBe('')
		expect(resolveCaption(undefined)).toBe('')
	})
})

describe('resolveMoreInfoHref', () => {
	it('returns the source anchor href', () => {
		expect(resolveMoreInfoHref(anchor({ href: '/en/portfolio/sunrises/quiet-light/' }))).toBe(
			'/en/portfolio/sunrises/quiet-light/',
		)
	})

	it('is null for an empty or missing href or a missing anchor', () => {
		expect(resolveMoreInfoHref(anchor({ href: '   ' }))).toBeNull()
		expect(resolveMoreInfoHref(anchor({}))).toBeNull()
		expect(resolveMoreInfoHref(null)).toBeNull()
		expect(resolveMoreInfoHref(undefined)).toBeNull()
	})
})

describe('resolveViewerChrome', () => {
	it('reads the copyright and labels from the container dataset', () => {
		expect(
			resolveViewerChrome({
				copyright: '© Example Author',
				moreLabel: 'More info',
				fullscreenLabel: 'Полный экран',
			}),
		).toEqual({
			copyright: '© Example Author',
			moreLabel: 'More info',
			fullscreenLabel: 'Полный экран',
		})
	})

	it('returns empty strings without values or a dataset, so the element is not registered', () => {
		const empty = { copyright: '', moreLabel: '', fullscreenLabel: 'Toggle fullscreen' }
		expect(resolveViewerChrome({})).toEqual(empty)
		expect(resolveViewerChrome(undefined)).toEqual(empty)
	})
})

describe('parseViewerOptions', () => {
	it('parses valid config JSON', () => {
		const raw = JSON.stringify({
			showHideAnimationType: 'fade',
			showAnimationDuration: 500,
			hideAnimationDuration: 500,
			zoomAnimationDuration: 400,
			loop: false,
			bgOpacity: 0.8,
			easing: 'ease-in-out',
			counter: 'on',
			fullscreen: 'off',
			moreInfo: 'off',
			copyright: 'off',
			idle: 'off',
			slideSpring: 12,
		})
		expect(parseViewerOptions(raw)).toEqual({
			showHideAnimationType: 'fade',
			showAnimationDuration: 500,
			hideAnimationDuration: 500,
			zoomAnimationDuration: 400,
			loop: false,
			bgOpacity: 0.8,
			easing: 'ease-in-out',
			counter: 'on',
			fullscreen: 'off',
			moreInfo: 'off',
			copyright: 'off',
			idle: 'off',
			slideSpring: 12,
		})
	})

	it('falls back per field for viewer chrome: on/off, idle and slideSpring (viewerSchema bounds)', () => {
		const result = parseViewerOptions(
			JSON.stringify({
				counter: true, // not on/off
				fullscreen: 'yes',
				idle: 100, // < 500
				slideSpring: 61, // > 60
			}),
		)
		expect(result.counter).toBe(DEFAULT_VIEWER_OPTIONS.counter)
		expect(result.fullscreen).toBe(DEFAULT_VIEWER_OPTIONS.fullscreen)
		expect(result.idle).toBe(DEFAULT_VIEWER_OPTIONS.idle)
		expect(result.slideSpring).toBe(DEFAULT_VIEWER_OPTIONS.slideSpring)
		expect(
			parseViewerOptions(JSON.stringify({ idle: 2500, slideSpring: 'off' })),
		).toMatchObject({
			idle: 2500,
			slideSpring: 'off',
		})
	})

	it('returns the defaults for missing or broken JSON', () => {
		expect(parseViewerOptions(undefined)).toEqual(DEFAULT_VIEWER_OPTIONS)
		expect(parseViewerOptions(null)).toEqual(DEFAULT_VIEWER_OPTIONS)
		expect(parseViewerOptions('')).toEqual(DEFAULT_VIEWER_OPTIONS)
		expect(parseViewerOptions('{not json')).toEqual(DEFAULT_VIEWER_OPTIONS)
		expect(parseViewerOptions('42')).toEqual(DEFAULT_VIEWER_OPTIONS)
	})

	it('falls back per field on a wrong type or an unknown value', () => {
		const raw = JSON.stringify({
			showHideAnimationType: 'slide', // invalid
			showAnimationDuration: 'nope', // not a number
			loop: 'yes', // not a boolean
			bgOpacity: 0.5, // valid
		})
		const result = parseViewerOptions(raw)
		expect(result.showHideAnimationType).toBe(DEFAULT_VIEWER_OPTIONS.showHideAnimationType)
		expect(result.showAnimationDuration).toBe(DEFAULT_VIEWER_OPTIONS.showAnimationDuration)
		expect(result.loop).toBe(DEFAULT_VIEWER_OPTIONS.loop)
		expect(result.bgOpacity).toBe(0.5)
	})

	it('replaces out-of-range and non-integer numbers with the default (viewerSchema bounds)', () => {
		const raw = JSON.stringify({
			showAnimationDuration: -1, // < 0
			hideAnimationDuration: 5001, // > 5000
			zoomAnimationDuration: 1.5, // not an integer
			bgOpacity: 5, // > 1
		})
		const result = parseViewerOptions(raw)
		expect(result.showAnimationDuration).toBe(DEFAULT_VIEWER_OPTIONS.showAnimationDuration)
		expect(result.hideAnimationDuration).toBe(DEFAULT_VIEWER_OPTIONS.hideAnimationDuration)
		expect(result.zoomAnimationDuration).toBe(DEFAULT_VIEWER_OPTIONS.zoomAnimationDuration)
		expect(result.bgOpacity).toBe(DEFAULT_VIEWER_OPTIONS.bgOpacity)
	})
})

describe('resolveShowHideAnimationType', () => {
	it('lets a crop-containing page group force fade over the site zoom default', () => {
		expect(resolveShowHideAnimationType(DEFAULT_VIEWER_OPTIONS, 'fade', false)).toBe('fade')
	})

	it('lets reduced motion override both the site default and a group override', () => {
		expect(resolveShowHideAnimationType(DEFAULT_VIEWER_OPTIONS, 'fade', true)).toBe('none')
	})
})

describe('viewer bars', () => {
	it('fits the photo between the bars with a mouse or on a wide screen', () => {
		expect(shouldFitBars({ finePointer: true, screenWidth: 390 })).toBe(true)
		expect(shouldFitBars({ finePointer: false, screenWidth: 1366 })).toBe(true)
		expect(shouldFitBars({ finePointer: false, screenWidth: 1200 })).toBe(false)
		expect(shouldFitBars({ finePointer: false, screenWidth: 390 })).toBe(false)
	})

	it('reserves the bar height at the top and bottom only when fitting', () => {
		expect(resolveViewerPadding(true)).toEqual({
			top: VIEWER_BAR_HEIGHT_PX,
			bottom: VIEWER_BAR_HEIGHT_PX,
			left: 0,
			right: 0,
		})
		expect(resolveViewerPadding(false)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
	})
})
