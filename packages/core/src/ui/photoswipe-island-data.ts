// DOM-free part of the PhotoSwipe island, kept apart from `photoswipe-island.ts` so unit tests
// cover the content contract without a browser or the library; viewer content comes only from
// server-rendered data attributes, and only text and URLs taken from them ever leave this module

import type { ViewerConfig } from '../config/site.ts'

// structural types instead of HTMLElement so tests can pass plain objects
export type DatasetLike = {
	readonly pswpCaption?: string
	readonly copyright?: string
	readonly moreLabel?: string
	readonly fullscreenLabel?: string
	readonly pswpOptions?: string
}

// fallback defaults used when data-pswp-options is missing or broken; independent of site.yaml
export const DEFAULT_VIEWER_OPTIONS: ViewerConfig = {
	showHideAnimationType: 'zoom',
	showAnimationDuration: 800,
	hideAnimationDuration: 800,
	zoomAnimationDuration: 800,
	loop: true,
	bgOpacity: 1,
	easing: 'cubic-bezier(0.4, 0, 0.22, 1)',
	counter: 'off',
	fullscreen: 'on',
	moreInfo: 'on',
	copyright: 'on',
	idle: 4000,
	slideSpring: 20,
}

// a cropped layout must not zoom even in a page group whose base options come from another
// container; reduced motion always beats the override
export function resolveShowHideAnimationType(
	options: ViewerConfig,
	override: ViewerConfig['showHideAnimationType'] | undefined,
	reduceMotion: boolean,
): ViewerConfig['showHideAnimationType'] {
	return reduceMotion ? 'none' : (override ?? options.showHideAnimationType)
}

function isAnimationType(value: unknown): value is ViewerConfig['showHideAnimationType'] {
	return value === 'zoom' || value === 'fade' || value === 'none'
}

// bounds match viewerSchema (site-schema.ts), so a hand-edited data attribute cannot pass a junk
// duration to PhotoSwipe
function intInRangeOr(value: unknown, min: number, max: number, fallback: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
		? value
		: fallback
}

function numberInRangeOr(value: unknown, min: number, max: number, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
		? value
		: fallback
}

function onOffOr(value: unknown, fallback: 'on' | 'off'): 'on' | 'off' {
	return value === 'on' || value === 'off' ? value : fallback
}

function offOrIntInRangeOr(
	value: unknown,
	min: number,
	max: number,
	fallback: number | 'off',
): number | 'off' {
	if (value === 'off') return 'off'
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
		? value
		: fallback
}

// never throws: a missing attribute, broken JSON or a wrong field type falls back per field to
// DEFAULT_VIEWER_OPTIONS
export function parseViewerOptions(raw: string | undefined | null): ViewerConfig {
	if (!raw) return DEFAULT_VIEWER_OPTIONS
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return DEFAULT_VIEWER_OPTIONS
	}
	if (!parsed || typeof parsed !== 'object') return DEFAULT_VIEWER_OPTIONS
	const o = parsed as Record<string, unknown>
	const d = DEFAULT_VIEWER_OPTIONS
	return {
		showHideAnimationType: isAnimationType(o.showHideAnimationType)
			? o.showHideAnimationType
			: d.showHideAnimationType,
		showAnimationDuration: intInRangeOr(
			o.showAnimationDuration,
			0,
			5000,
			d.showAnimationDuration,
		),
		hideAnimationDuration: intInRangeOr(
			o.hideAnimationDuration,
			0,
			5000,
			d.hideAnimationDuration,
		),
		zoomAnimationDuration: intInRangeOr(
			o.zoomAnimationDuration,
			0,
			5000,
			d.zoomAnimationDuration,
		),
		loop: typeof o.loop === 'boolean' ? o.loop : d.loop,
		bgOpacity: numberInRangeOr(o.bgOpacity, 0, 1, d.bgOpacity),
		easing: typeof o.easing === 'string' && o.easing.length > 0 ? o.easing : d.easing,
		counter: onOffOr(o.counter, d.counter),
		fullscreen: onOffOr(o.fullscreen, d.fullscreen),
		moreInfo: onOffOr(o.moreInfo, d.moreInfo),
		copyright: onOffOr(o.copyright, d.copyright),
		idle: offOrIntInRangeOr(o.idle, 500, 60000, d.idle),
		slideSpring: offOrIntInRangeOr(o.slideSpring, 5, 60, d.slideSpring),
	}
}

export type AnchorLike = {
	getAttribute(name: string): string | null
}

// empty rather than undefined, so callers can write it to textContent without showing "undefined"
export function resolveCaption(dataset: DatasetLike | undefined): string {
	return dataset?.pswpCaption?.trim() ?? ''
}

// "More info" reuses the source anchor's href: the photo page for portfolio items, possibly the image
// file in content blocks; null hides the button instead of a broken link
export function resolveMoreInfoHref(anchor: AnchorLike | null | undefined): string | null {
	const href = anchor?.getAttribute('href')?.trim()
	return href ? href : null
}

// set once on the gallery container; an empty copyright or moreLabel means the element is not
// registered, while the fullscreen button falls back to English because it needs an accessible name
export type ViewerChrome = {
	copyright: string
	moreLabel: string
	fullscreenLabel: string
}

export function resolveViewerChrome(dataset: DatasetLike | undefined): ViewerChrome {
	return {
		copyright: dataset?.copyright?.trim() ?? '',
		moreLabel: dataset?.moreLabel?.trim() ?? '',
		fullscreenLabel: dataset?.fullscreenLabel?.trim() || 'Toggle fullscreen',
	}
}

// as in the legacy theme's photoswipe-ui.js (`barsSize`, `_fitControlsInViewport`), the photo fits
// between the top bar and the bottom caption only with a mouse or a screen wider than 1200px; on a
// touch phone it fills the screen under the bars; 44px matches legacy `$pswp__button-size`
export const VIEWER_BAR_HEIGHT_PX = 44
const FIT_BARS_MIN_SCREEN_PX = 1200

export function shouldFitBars(env: { finePointer: boolean; screenWidth: number }): boolean {
	return env.finePointer || env.screenWidth > FIT_BARS_MIN_SCREEN_PX
}

export function resolveViewerPadding(fit: boolean): {
	top: number
	bottom: number
	left: number
	right: number
} {
	const bar = fit ? VIEWER_BAR_HEIGHT_PX : 0
	return { top: bar, bottom: bar, left: 0, right: 0 }
}

// a constant idle delay for a cursor that left the window, mirroring legacy `timeToIdleOutside`
export const VIEWER_IDLE_OUTSIDE_MS = 1000
