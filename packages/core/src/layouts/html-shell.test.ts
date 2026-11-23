import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { site } from '../config/site.ts'
import { defaultLocale } from '../config/site-schema.ts'
import type * as PublicConfig from '../lib/images/public-config.ts'
import HtmlShell from './html-shell.astro'

// the demo serves its images itself; an https origin stands in for a site on an external image host
const imageOrigin = vi.hoisted(() => ({ current: undefined as string | undefined }))
vi.mock('../lib/images/public-config.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof PublicConfig>()
	return {
		...actual,
		loadImagePublicConfig: (root: string) => {
			const loaded = actual.loadImagePublicConfig(root)
			if (imageOrigin.current === undefined) return loaded
			const { copyright, credit, ladder } = loaded.config
			return {
				...loaded,
				config: { copyright, credit, ladder, publicOrigin: imageOrigin.current },
			}
		},
	}
})

let container: AstroContainer
beforeAll(async () => {
	container = await AstroContainer.create()
})
beforeEach(() => {
	imageOrigin.current = undefined
})

const render = () =>
	container.renderToString(HtmlShell, { props: { lang: defaultLocale(site) }, locals: {} })

describe('the html shell', () => {
	it('preconnects to an external image origin', async () => {
		imageOrigin.current = 'https://media.example.com'
		expect(await render()).toContain('<link rel="preconnect" href="https://media.example.com">')
	})

	it('has nothing to preconnect to when the site serves its images itself', async () => {
		expect(await render()).not.toContain('rel="preconnect"')
	})

	it('paints the favicon with the colors of the config', async () => {
		const saved = site.theme.favicon
		// distinct from the schema defaults, so a shell that ignored the config would fail
		site.theme.favicon = { background: '#123456', foreground: 'oklch(0.7 0.1 200)' }
		let html: string
		try {
			html = await render()
		} finally {
			site.theme.favicon = saved
		}
		const href = /<link rel="icon" href="data:image\/svg\+xml,([^"]+)"/.exec(html)?.[1]
		const svg = decodeURIComponent(href!.replaceAll('&amp;', '&'))
		expect(svg).toContain('<rect width="32" height="32" rx="6" fill="#123456"/>')
		expect(svg).toContain('<circle cx="16" cy="16" r="7" fill="oklch(0.7 0.1 200)"/>')
	})
})
