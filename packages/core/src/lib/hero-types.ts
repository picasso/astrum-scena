export type HeroSlide = {
	id: string
	image: string
	align: 'left' | 'right'
	// fixed colors, not theme tokens: `accent` is yellow, `alt` is red
	accent: 'accent' | 'alt'
	dominantColor: string
	width: number
	height: number
	widths: number[]
	formats: string[]
	title: { clean: string; head: string; tail: string }
	desc: string
	alt: string
	link: { kind: 'page' | 'album' | 'external'; href: string; label: string } | null
}

export type HeroPictureSource = {
	type: string
	srcset: string
}

// the server builds the `<picture>` sources from the active manifest, so the island never sees
// object keys or synthesizes `/hero/*`
export type HeroSlideView = {
	id: string
	align: 'left' | 'right'
	accent: 'accent' | 'alt'
	// avif, then webp, each with its own srcset; `sizes` is shared
	sources: HeroPictureSource[]
	// the widest webp
	fallbackSrc: string
	width: number
	height: number
	sizes: string
	dominantColor: string
	title: { clean: string; head: string; tail: string }
	desc: string
	alt: string
	link: { kind: 'album' | 'page'; href: string; label: string } | null
}
