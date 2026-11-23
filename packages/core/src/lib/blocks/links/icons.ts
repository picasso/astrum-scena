// `icon` only picks where the glyph goes and each place has a fixed glyph, so there are just two
// rendering keys (`icon='none'` never calls the helper); heading is the legacy theme's approved
// `bookmark` (same string as callout/icons.ts), each is an inlined copy of
// `src/assets/icons/external-link.svg`; nothing from author input is interpolated (anti-injection)

export const LINKS_ICON_SVGS: Record<'heading' | 'each', string> = {
	heading:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M16 3H8C6.346 3 5 4.273 5 5.837v13.24c0 .486.104.895.308 1.216.564.884 1.815.953 2.813.007l3.172-3c.375-.353 1.039-.353 1.414 0l3.172 3c.491.465 1.002.7 1.52.7.797 0 1.601-.595 1.601-1.923V5.837C19 4.273 17.654 3 16 3zM8 4.891h8c.551 0 1 .425 1 .946v9.368l-2.451-2.125c-1.406-1.219-3.693-1.219-5.099 0L7 15.205V5.837c0-.521.449-.946 1-.946zm6.121 11.072A3.068 3.068 0 0 0 12 15.135c-.803 0-1.556.295-2.121.828L7 18.686v-2.198l3.126-2.711c1.033-.895 2.714-.895 3.747 0L17 16.488v2.198l-2.879-2.723z"/></svg>',
	each: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M11 13l9-9"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 4h5v5"/></svg>',
}

// icons are decorative; their size comes from CSS (`.links__icon`, `.links__ext`)
export function linksIconHtml(icon: 'heading' | 'each'): string {
	const className = icon === 'heading' ? 'links__icon' : 'links__ext'
	return `<span class="${className}" aria-hidden="true">${LINKS_ICON_SVGS[icon]}</span>`
}
