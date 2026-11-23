import PhotoSwipeLightbox from 'photoswipe/lightbox'

import type { ViewerConfig } from '../config/site.ts'
import {
	parseViewerOptions,
	resolveCaption,
	resolveMoreInfoHref,
	resolveShowHideAnimationType,
	resolveViewerChrome,
	resolveViewerPadding,
	shouldFitBars,
	VIEWER_IDLE_OUTSIDE_MS,
} from './photoswipe-island-data.ts'
import { contentBoxThumbBounds } from './photoswipe-thumb-bounds.ts'

// vanilla TS rather than React: PhotoSwipe is imperative and renders its overlay into its own DOM
// root over the server-rendered gallery; the core is a dynamic import, so pages without a gallery
// never load it
//
// until init succeeds, and in unsupported browsers, `a.album-photo` anchors stay plain links: the
// photo page in the portfolio, possibly the image file in content blocks

// legacy `arrow-right.svg` from the approved `sources/_minified/icons` set, fill #666 replaced by
// currentColor; its own class because PhotoSwipe positions `pswp__icn` absolutely for 50px buttons,
// which pushed the icon under the text
const MORE_INFO_ICON =
	'<svg aria-hidden="true" class="pswp__image-link__icn" viewBox="0 0 48 48" width="24" height="24">' +
	'<path fill="currentColor" d="M24 42c-1.602 0-3.11-0.624-4.242-1.758s-1.76-2.642-1.758-4.246c0-1.492' +
	' 0.542-1.996 1.528-3.996h-9.672c-3.308 0-6-2.694-6-6 0-3.308 2.692-6 6-6h9.672c-0.988-2-1.528-2.51' +
	'-1.528-4.002 0.002-1.604 0.624-3.108 1.76-4.242 2.264-2.264 6.216-2.266 8.482 0.002l14.242 14.242' +
	'-14.242 14.242c-1.132 1.134-2.64 1.758-4.242 1.758zM9.856 24c-1.104 0-2 0.898-2 2s0.896 2 2 2h19.316' +
	'l-6.586 6.586c-0.378 0.378-0.586 0.878-0.586 1.412 0 0.538 0.208 1.038 0.586 1.416 0.758 0.756 2.070' +
	' 0.756 2.828 0l11.414-11.414-11.414-11.414c-0.758-0.756-2.070-0.756-2.828 0-0.378 0.378-0.586 0.878' +
	'-0.586 1.412 0 0.536 0.208 1.038 0.586 1.416l6.586 6.586h-19.316z"/></svg>'

export type AlbumViewerConfig = {
	childSelector?: string
	// where to read chrome and options; a page group of blocks spans several containers, so its
	// `root` is a common ancestor with no data attributes of its own
	chromeSource?: HTMLElement
	// lets the grouping adapter downgrade the open animation when a page group has cropped
	// previews, since zooming from one into the natural slide visibly jumps
	showHideAnimationType?: ViewerConfig['showHideAnimationType']
}

export type AlbumViewerHandle = {
	destroy(): void
}

// null for an empty gallery; the handle is for teardown on view transitions and HMR
export function initAlbumPhotoSwipe(
	root: HTMLElement,
	config: AlbumViewerConfig = {},
): AlbumViewerHandle | null {
	const childSelector = config.childSelector ?? 'a.album-photo'
	if (!root.querySelector(childSelector)) return null

	const chromeSource = config.chromeSource ?? root
	const chrome = resolveViewerChrome(chromeSource.dataset)
	const options = parseViewerOptions(chromeSource.dataset.pswpOptions)

	// reduced motion makes open, close and zoom instant, which also keeps e2e under reducedMotion
	// deterministic
	const reduceMotion =
		typeof window !== 'undefined' &&
		(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

	// legacy `pswp__ui--fit`
	const fitBars =
		typeof window !== 'undefined' &&
		shouldFitBars({
			finePointer: window.matchMedia?.('(pointer: fine)').matches ?? false,
			screenWidth: window.screen?.width ?? 0,
		})

	const lightbox = new PhotoSwipeLightbox({
		gallery: root,
		children: childSelector,
		pswpModule: () => import('photoswipe'),
		// the legacy theme's viewer options, configured under `viewer` in site.yaml; 'zoom' zooms
		// from the thumbnail, as legacy showHideOpacity:false did
		showHideAnimationType: resolveShowHideAnimationType(
			options,
			config.showHideAnimationType,
			reduceMotion,
		),
		showAnimationDuration: reduceMotion ? 0 : options.showAnimationDuration,
		hideAnimationDuration: reduceMotion ? 0 : options.hideAnimationDuration,
		zoomAnimationDuration: reduceMotion ? 0 : options.zoomAnimationDuration,
		loop: options.loop,
		bgOpacity: options.bgOpacity,
		easing: options.easing,
		paddingFn: () => resolveViewerPadding(fitBars),
		// legacy `counterEl: false`
		counter: options.counter === 'on',
	})

	// wrap Around frames live on the thumbnail <img>. PhotoSwipe's default bounds include that
	// border box, so the zoom starts a few pixels outside the visible photograph and visibly snaps.
	// Override only this surface; albums and Gallery keep PhotoSwipe's native bounds calculation.
	lightbox.addFilter('thumbBounds', (thumbBounds, itemData) => {
		const thumbnail = itemData.element?.querySelector<HTMLElement>('.wrap-around__img')
		if (!thumbnail) {
			// every viewer item has an image by contract, so native bounds are present here. The fallback
			// keeps the filter total if malformed markup reaches PhotoSwipe during development.
			return thumbBounds ?? { x: 0, y: 0, w: 0 }
		}

		const rect = thumbnail.getBoundingClientRect()
		const style = window.getComputedStyle(thumbnail)
		return contentBoxThumbBounds(rect, {
			left: Number.parseFloat(style.borderLeftWidth) || 0,
			right: Number.parseFloat(style.borderRightWidth) || 0,
			top: Number.parseFloat(style.borderTopWidth) || 0,
		})
	})

	lightbox.on('uiRegister', () => {
		const pswp = lightbox.pswp
		if (!pswp?.ui) return
		// lighter bars when the photo does not run under them (legacy 0.5 → 0.3 in fit mode)
		pswp.element?.classList.toggle('pswp--fit-bars', fitBars)

		// animated arrow and ← → navigation (the legacy theme patched the v4 core so a click
		// mimicked a swipe); in v5 `next`/`prev` switch instantly and `moveIndexBy(diff, true)`
		// hardcodes spring stiffness 30, so the stock call keeps indexes and looping, its spring is
		// stopped at once and the same move runs on a softer spring; buttons and keys call
		// `pswp.next/prev` by name, so overriding them on the instance is enough and the library
		// stays unpatched
		const slideSpring = options.slideSpring
		if (!reduceMotion && slideSpring !== 'off') {
			const slideBy = (diff: number): void => {
				const scroll = pswp.mainScroll
				const from = scroll.x
				if (!scroll.moveIndexBy(diff, true)) return
				pswp.animations.stopMainScroll()
				pswp.animations.startSpring({
					isMainScroll: true,
					start: from,
					end: scroll.getCurrSlideX(),
					velocity: 0,
					naturalFrequency: slideSpring,
					dampingRatio: 1,
					onUpdate: (x) => scroll.moveTo(x),
					onComplete: () => {
						scroll.updateCurrItem()
						pswp.appendHeavy()
					},
				})
			}
			pswp.next = () => slideBy(1)
			pswp.prev = () => slideBy(-1)
		}

		// legacy `timeToIdle`: the top bar and arrows fade without mouse movement and keyboard
		// focus keeps them visible; touch needs none of this, as v5 already hides the arrows and a
		// tap toggles the bar
		const root = pswp.element
		const idleDelay = options.idle
		if (root && idleDelay !== 'off') {
			let idleTimer: ReturnType<typeof setTimeout> | undefined
			// root focus (v5 sets it on open) and focus after a mouse click (no `:focus-visible`)
			// do not count, otherwise idle would never come
			let keyboardFocus = false
			const wake = (delay = idleDelay): void => {
				root.classList.remove('pswp--idle')
				clearTimeout(idleTimer)
				if (!keyboardFocus) {
					idleTimer = setTimeout(() => root.classList.add('pswp--idle'), delay)
				}
			}
			const onMove = (): void => wake()
			const onFocus = (event: FocusEvent): void => {
				const target = event.target
				keyboardFocus =
					target instanceof HTMLElement &&
					target !== root &&
					target.matches('button, a') &&
					target.matches(':focus-visible')
				if (keyboardFocus) wake()
			}
			const onBlur = (): void => {
				if (!keyboardFocus) return
				keyboardFocus = false
				wake()
			}
			// legacy `timeToIdleOutside`
			const onLeave = (event: MouseEvent): void => {
				if (!event.relatedTarget) wake(VIEWER_IDLE_OUTSIDE_MS)
			}
			root.addEventListener('mousemove', onMove, { passive: true })
			root.addEventListener('focusin', onFocus)
			root.addEventListener('focusout', onBlur)
			document.addEventListener('mouseout', onLeave)
			pswp.on('destroy', () => {
				clearTimeout(idleTimer)
				root.removeEventListener('mousemove', onMove)
				root.removeEventListener('focusin', onFocus)
				root.removeEventListener('focusout', onBlur)
				document.removeEventListener('mouseout', onLeave)
			})
		}

		// legacy `fullscreenEl`, ordered between zoom (10) and close (20); CSS draws the icon from
		// the legacy sprite; skipped where the Fullscreen API is missing, as on iPhone
		if (options.fullscreen === 'on' && document.fullscreenEnabled) {
			pswp.ui.registerElement({
				name: 'fullscreen',
				ariaLabel: chrome.fullscreenLabel,
				title: chrome.fullscreenLabel,
				order: 15,
				isButton: true,
				html: '',
				onClick: () => {
					if (document.fullscreenElement) void document.exitFullscreen()
					else void pswp.element?.requestFullscreen()
				},
			})
			const syncFullscreen = (): void => {
				pswp.element?.classList.toggle('pswp--fs', Boolean(document.fullscreenElement))
			}
			document.addEventListener('fullscreenchange', syncFullscreen)
			// otherwise the page would stay fullscreen after the viewer closes
			pswp.on('close', () => {
				document.removeEventListener('fullscreenchange', syncFullscreen)
				if (document.fullscreenElement) void document.exitFullscreen()
			})
		}

		// port of legacy `.pswp__caption` (the legacy theme's `_photoswipe-skin.scss`): copyright,
		// slide caption and "More info" in one bar; text goes through textContent only, so no XSS
		pswp.ui.registerElement({
			name: 'album-caption',
			appendTo: 'root',
			order: 9,
			onInit: (el) => {
				el.className = 'pswp__caption'

				// equal-width side zones keep the caption exactly centred
				const start = document.createElement('div')
				start.className = 'pswp__caption__side pswp__caption__side--start'
				const center = document.createElement('div')
				center.className = 'pswp__caption__center'
				const end = document.createElement('div')
				end.className = 'pswp__caption__side pswp__caption__side--end'

				const showCopyright = options.copyright === 'on' && Boolean(chrome.copyright)
				if (showCopyright) {
					const copyrightEl = document.createElement('span')
					copyrightEl.className = 'copyright'
					copyrightEl.textContent = chrome.copyright
					start.appendChild(copyrightEl)
				}

				let moreLink: HTMLAnchorElement | null = null
				if (options.moreInfo === 'on' && chrome.moreLabel) {
					moreLink = document.createElement('a')
					moreLink.className = 'pswp__image-link'
					const label = document.createElement('span')
					label.textContent = chrome.moreLabel
					moreLink.appendChild(label)
					moreLink.insertAdjacentHTML('beforeend', MORE_INFO_ICON)
					end.appendChild(moreLink)
				}

				el.append(start, center, end)

				const update = (): void => {
					const element = pswp.currSlide?.data.element
					const caption = resolveCaption(element?.dataset)
					center.textContent = caption

					let hasMore = false
					if (moreLink) {
						const href = resolveMoreInfoHref(element ?? null)
						if (href) {
							moreLink.setAttribute('href', href)
							moreLink.hidden = false
							hasMore = true
						} else {
							moreLink.removeAttribute('href')
							moreLink.hidden = true
						}
					}

					// legacy `.pswp__caption--empty`
					el.classList.toggle(
						'pswp__caption--empty',
						!caption && !showCopyright && !hasMore,
					)
				}
				pswp.on('change', update)
				update()
			},
		})
	})

	lightbox.init()
	return { destroy: () => lightbox.destroy() }
}

// called by `photoswipe-bootstrap.ts`, which keeps the handles for teardown
export function mountAlbumViewers(selector = '.album-grid'): AlbumViewerHandle[] {
	const handles: AlbumViewerHandle[] = []
	for (const root of document.querySelectorAll<HTMLElement>(selector)) {
		const handle = initAlbumPhotoSwipe(root)
		if (handle) handles.push(handle)
	}
	return handles
}
