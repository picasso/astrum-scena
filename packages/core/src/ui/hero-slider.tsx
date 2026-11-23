import '../styles/vendor/swiper.css'

import { useEffect, useRef, useState } from 'react'
import type { Swiper as SwiperClass } from 'swiper'
import { A11y, Autoplay, EffectFade, Navigation, Pagination } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'

import type { HeroSlideView } from '../lib/hero-types'

// exposes Swiper to e2e as `window.__heroSwiper`
type HeroSliderWindow = Window & { __heroSwiper?: SwiperClass }

export type HeroSliderProps = {
	slides: HeroSlideView[]
	nextLabel: string
	prevLabel: string
	pauseLabel: string
	playLabel: string
	speed: number
	autoplayDelay: number
}

// autoplay pause reasons, shared between islands
type PauseReason = 'user' | 'menu'

export function HeroSlider({
	slides,
	nextLabel,
	prevLabel,
	pauseLabel,
	playLabel,
	speed,
	autoplayDelay,
}: HeroSliderProps) {
	// read after mount only: Node SSR has no matchMedia, and starting from false on both sides
	// avoids a hydration mismatch; Playwright sets reducedMotion before navigation, so the effect
	// stops autoplay before the page settles
	const [reduce, setReduce] = useState(false)
	const swiperRef = useRef<SwiperClass | null>(null)
	const [paused, setPaused] = useState(false)
	const pauseReasons = useRef<Set<PauseReason>>(new Set())

	// mirrors the real autoplay state into data-autoplay-running for e2e; it is state rather than a
	// write through a ref because the Swiper callbacks fire during child init, before the
	// .hero-shell ref is attached, and such a write would be lost
	const [running, setRunning] = useState(false)
	const reflectRunning = () => setRunning(Boolean(swiperRef.current?.autoplay?.running))

	// pagination bullets sit opposite the active slide's copy; kept in state for the same
	// ref-timing reason as `running`
	const [activeAlign, setActiveAlign] = useState<'left' | 'right'>(slides[0]?.align ?? 'right')
	const prevAlignRef = useRef<'left' | 'right'>(slides[0]?.align ?? 'right')
	const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	// the side swaps in the invisible middle (45–55% of 1.9s) of hero-pagination-crossfade
	const PAGINATION_SWAP_MS = 950
	const reflectActiveAlign = (swiper: SwiperClass) => {
		const next = slides[swiper.realIndex ?? 0]?.align ?? 'right'
		if (reduce) {
			// a pending swap would later apply the previous slide's side over the active one
			if (swapTimerRef.current) {
				clearTimeout(swapTimerRef.current)
				swapTimerRef.current = null
			}
			setActiveAlign(next)
			prevAlignRef.current = next
			return
		}
		if (next === prevAlignRef.current) {
			// with a crossfade in flight, the pending swap sets this same side; setting it now
			// would make the bullets jump before the midpoint
			if (!swapTimerRef.current) setActiveAlign(next)
			prevAlignRef.current = next
			return
		}
		// the reflow restart makes every side change start the keyframe from zero under fast
		// navigation; a React state toggle would leave a running animation unrestarted
		const paginationEl = swiper.pagination?.el
		if (paginationEl instanceof HTMLElement) {
			paginationEl.classList.remove('hero-pagination-shift')
			void paginationEl.offsetWidth
			paginationEl.classList.add('hero-pagination-shift')
		}
		if (swapTimerRef.current) clearTimeout(swapTimerRef.current)
		swapTimerRef.current = setTimeout(() => {
			setActiveAlign(next)
			swapTimerRef.current = null
		}, PAGINATION_SWAP_MS)
		prevAlignRef.current = next
	}

	useEffect(
		() => () => {
			if (swapTimerRef.current) clearTimeout(swapTimerRef.current)
		},
		[],
	)

	useEffect(() => {
		if (typeof matchMedia !== 'function') return
		const mql = matchMedia('(prefers-reduced-motion: reduce)')
		const apply = (matches: boolean) => setReduce(matches)
		apply(mql.matches)
		const onChange = (event: MediaQueryListEvent) => apply(event.matches)
		mql.addEventListener('change', onChange)
		return () => mql.removeEventListener('change', onChange)
	}, [])

	// reduced motion is terminal: autoplay is never started again
	useEffect(() => {
		if (!reduce) return
		swiperRef.current?.autoplay?.stop()
		setPaused(true)
		reflectRunning()
	}, [reduce])

	// the menu drawer is another island, so it pauses autoplay through window events
	useEffect(() => {
		const onMenuOpen = () => {
			pauseReasons.current.add('menu')
			swiperRef.current?.autoplay?.stop()
			reflectRunning()
		}
		const onMenuClose = () => {
			pauseReasons.current.delete('menu')
			// a user pause or reduced motion keeps autoplay stopped
			if (!reduce && pauseReasons.current.size === 0) swiperRef.current?.autoplay?.start()
			reflectRunning()
		}
		window.addEventListener('menu:open', onMenuOpen)
		window.addEventListener('menu:close', onMenuClose)
		return () => {
			window.removeEventListener('menu:open', onMenuOpen)
			window.removeEventListener('menu:close', onMenuClose)
		}
	}, [reduce])

	// WCAG 2.2.2 requires a pause control for motion lasting over 5s
	const toggleAutoplay = () => {
		if (reduce) return
		const autoplay = swiperRef.current?.autoplay
		if (!autoplay) return
		if (paused) {
			pauseReasons.current.delete('user')
			// an open menu may still hold the pause
			if (pauseReasons.current.size === 0) autoplay.start()
			setPaused(false)
		} else {
			pauseReasons.current.add('user')
			autoplay.stop()
			setPaused(true)
		}
		reflectRunning()
	}

	return (
		<div
			className="hero-shell"
			data-autoplay-running={String(running)}
			data-active-align={activeAlign}
		>
			<Swiper
				onSwiper={(swiper) => {
					swiperRef.current = swiper
					const heroWindow: HeroSliderWindow = window
					heroWindow.__heroSwiper = swiper
					// the menu may have opened before the island hydrated
					if (document.documentElement.dataset.menuOpen === 'true') {
						pauseReasons.current.add('menu')
						swiper.autoplay?.stop()
					}
					reflectActiveAlign(swiper)
					reflectRunning()
				}}
				onAfterInit={() => reflectRunning()}
				onAutoplayStart={() => reflectRunning()}
				onAutoplayStop={() => reflectRunning()}
				// until the first slide change, CSS leaves the server-rendered text as painted, so
				// the home H1 (the LCP element) never waits for the entrance animation;
				// onSlideChange does not fire for the first slide
				onSlideChange={(swiper) => {
					swiper.el.classList.add('hero-navigated')
					reflectActiveAlign(swiper)
				}}
				modules={[EffectFade, Navigation, Pagination, Autoplay, A11y]}
				effect="fade"
				fadeEffect={{ crossFade: true }}
				speed={reduce ? 0 : speed}
				rewind
				autoplay={reduce ? false : { delay: autoplayDelay, disableOnInteraction: false }}
				navigation
				pagination={{ clickable: true }}
				a11y={{ prevSlideMessage: prevLabel, nextSlideMessage: nextLabel }}
				className="hero-swiper"
			>
				{slides.map((slide, index) => {
					const eager = index === 0
					const TitleTag = index === 0 ? 'h1' : 'p'
					return (
						<SwiperSlide
							key={slide.id}
							style={{ backgroundColor: slide.dominantColor }}
						>
							<picture className="hero-media">
								{slide.sources.map((source) => (
									<source
										key={source.type}
										type={source.type}
										srcSet={source.srcset}
										sizes={slide.sizes}
									/>
								))}
								<img
									src={slide.fallbackSrc}
									sizes={slide.sizes}
									width={slide.width}
									height={slide.height}
									alt={slide.alt}
									loading={eager ? 'eager' : 'lazy'}
									fetchPriority={eager ? 'high' : 'auto'}
									// the LCP image gets no async decoding hint, so the browser need
									// not defer its paint after the bytes arrive
									decoding={eager ? undefined : 'async'}
								/>
							</picture>

							<div className="hero-copy" data-align={slide.align}>
								<TitleTag
									className={
										index === 0 ? 'hero-heading' : 'hero-heading slide-title'
									}
									data-accent={slide.accent}
								>
									{slide.title.head}
									{slide.title.tail ? (
										<span className="altheading">{slide.title.tail}</span>
									) : null}
								</TitleTag>
								{slide.desc ? <p className="hero-desc">{slide.desc}</p> : null}
								{slide.link ? (
									<a className="hero-cta call-button" href={slide.link.href}>
										{slide.link.label}
									</a>
								) : null}
							</div>
						</SwiperSlide>
					)
				})}
			</Swiper>

			{reduce ? null : (
				<button
					type="button"
					className="hero-autoplay-toggle"
					aria-label={paused ? playLabel : pauseLabel}
					aria-pressed={paused}
					onClick={toggleAutoplay}
				>
					{paused ? (
						<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path
								d="M8 5.5 19 12 8 18.5z"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinejoin="round"
							/>
						</svg>
					) : (
						<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<rect x="6.5" y="5" width="4" height="14" rx="1.5" />
							<rect x="13.5" y="5" width="4" height="14" rx="1.5" />
						</svg>
					)}
				</button>
			)}
		</div>
	)
}
