// expanded by variantCssPlugin (src/lib/variant-css.ts) into imports of the selected variant stylesheets
declare module 'virtual:variant-css/*' {}

// served by the integration (src/index.ts) from Astro's `config.root`
declare module 'virtual:astrum-scena/site-root' {
	export const siteRoot: string
}

// served by the integration (src/index.ts) from the site's `src/overrides/<point>.astro`
declare module 'virtual:astrum-scena/overrides' {
	type Props = import('./overrides/points.ts').ReplacementPointProps
	export const overrides: { [P in keyof Props]?: (props: Props[P]) => unknown }
}

// served by the integration (src/index.ts): the `icons/` folder of the core's lucide-static
declare module 'virtual:astrum-scena/lucide-icons' {
	export const lucideIconsDir: string
}
