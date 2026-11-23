import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeAll, describe, expect, it } from 'vitest'

import { siteRoot } from '../config/site-root.ts'
import { logoLayers } from './logo-layers.ts'
import SiteLogo from './site-logo.astro'

const VARIANTS = ['brand', 'menu'] as const

const logoPath = (variant: (typeof VARIANTS)[number]) =>
	path.join(siteRoot, 'src/assets/brand', `${variant}-logo.svg`)

let container: AstroContainer
beforeAll(async () => {
	container = await AstroContainer.create()
})

const srcOf = (variant: (typeof VARIANTS)[number]) => `/assets/${variant}-logo.svg`

const render = (variant: (typeof VARIANTS)[number]) =>
	container.renderToString(SiteLogo, { props: { src: srcOf(variant), variant } })

const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) => href!)

describe('SiteLogo', () => {
	it.each(VARIANTS)('renders %s-logo fragments as external references only', async (variant) => {
		const html = await render(variant)
		const hrefs = hrefsOf(html)
		expect(hrefs.length).toBeGreaterThan(0)
		expect(new Set(hrefs).size).toBe(hrefs.length)
		for (const href of hrefs) expect(href.startsWith(`${srcOf(variant)}#`), href).toBe(true)
		expect(html).not.toContain('<path')
	})

	// both directions: a top-level id the component skipped would never paint, and a reference to an
	// id the file lacks would draw nothing
	it.each(VARIANTS)(
		"draws exactly the layers the site's %s logo declares, in order",
		async (variant) => {
			const svg = readFileSync(logoPath(variant), 'utf8')
			const html = await render(variant)
			const ids = hrefsOf(html).map((href) => href.split('#')[1])
			expect(ids).toEqual(logoLayers(svg, `${variant}-logo.svg`).ids)
			expect(ids).toEqual([...svg.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id))
			expect(html).toContain(`viewBox="${/viewBox="([^"]+)"/.exec(svg)![1]}"`)
		},
	)

	it("keeps the site's themeable logo assets below the size budget", () => {
		for (const variant of VARIANTS) {
			const file = logoPath(variant)
			expect(statSync(file).size, file).toBeLessThan(75 * 1024)
			expect(readFileSync(file, 'utf8'), file).toContain('fill="currentColor"')
		}
	})
})
