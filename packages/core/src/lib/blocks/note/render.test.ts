import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri'
import { beforeAll, describe, expect, it } from 'vitest'

import { CORE_DICTIONARIES } from '../../../i18n/dictionaries.ts'
import { noteMdastPlugin } from './plugin.ts'

// uses the production satteri processor; `.md` and `.mdx` share this mdast pipeline, so full Astro
// `.mdx` compilation is deliberately not exercised here

const CLAIM = 'prod-d602206b:64cf2f9d'

type Renderer = {
	render: (src: string, opts?: Record<string, unknown>) => Promise<{ code: string }>
}
let renderer: Renderer

beforeAll(async () => {
	renderer = (await createSatteriMarkdownProcessor({
		features: { directive: true },
		mdastPlugins: [
			noteMdastPlugin((locale) => CORE_DICTIONARIES[locale]?.['note.title']) as never,
		],
	})) as unknown as Renderer
})

async function render(src: string, fileURL = 'file:///docs/x.ru.md'): Promise<string> {
	const { code } = await renderer.render(src, { fileURL: new URL(fileURL) })
	return code
}

describe('note render path', () => {
	it('recognizes :::note and applies the outdated defaults with the RU heading', async () => {
		const html = await render(`:::note{claim="${CLAIM}"}\nБольше не выпускают.\n:::`)
		expect(html).toContain('class="note note--outdated"')
		expect(html).toContain('role="note"')
		expect(html).toContain('class="note__title"')
		expect(html).toContain('Что изменилось с момента написания')
		expect(html).toContain('class="note__content"')
		expect(html).toContain('Больше не выпускают.')
	})

	it('renders a static div with a decorative icon, never a blockquote/aside or island', async () => {
		const html = await render(`:::note{claim="${CLAIM}"}\nBody.\n:::`)
		expect(html).toContain('<div')
		expect(html).not.toContain('<blockquote')
		expect(html).not.toContain('<aside')
		expect(html).toContain('class="note__icon" aria-hidden="true"')
		expect(html).toContain('<svg')
		expect(html).toContain('currentColor')
		expect(html).not.toContain('astro-island')
	})

	it('uses the EN default heading for an .en document', async () => {
		const html = await render(
			`:::note{claim="${CLAIM}"}\nDiscontinued.\n:::`,
			'file:///docs/x.en.md',
		)
		expect(html).toContain('What has changed since this was written')
		expect(html).not.toContain('Что изменилось')
	})

	it('fails closed when the locale cannot be determined and no title is given', async () => {
		await expect(
			render(`:::note{claim="${CLAIM}"}\nBody.\n:::`, 'file:///docs/plain.md'),
		).rejects.toThrow(/note: cannot determine the document locale/)
	})

	it('lets an explicit title override the default and suppresses the icon+title under notitle', async () => {
		const titled = await render(`:::note{claim="${CLAIM}" title="Обновление"}\nBody.\n:::`)
		expect(titled).toContain('Обновление')
		expect(titled).not.toContain('Что изменилось с момента написания')

		const silent = await render(`:::note{claim="${CLAIM}" notitle}\nBody.\n:::`)
		expect(silent).not.toContain('class="note__title"')
		expect(silent).not.toContain('note__icon')
		expect(silent).toContain('class="note__content"')
	})

	it('applies the tone modifier class for info and alert', async () => {
		const info = await render(`:::note{claim="${CLAIM}" tone="info"}\nBody.\n:::`)
		expect(info).toContain('class="note note--info"')
		const alert = await render(`:::note{claim="${CLAIM}" tone="alert"}\nBody.\n:::`)
		expect(alert).toContain('class="note note--alert"')
	})

	it('renders a hostile title as escaped text, never raw tags', async () => {
		const html = await render(
			`:::note{claim="${CLAIM}" title="<img src=x onerror=alert(1)>"}\nBody.\n:::`,
		)
		expect(html).not.toContain('<img src=x onerror=alert(1)>')
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;') // escaped text, not a tag
		expect(html).toContain('role="note"')
	})

	it('preserves inline marks, links and both list kinds in the body', async () => {
		const html = await render(
			`:::note{claim="${CLAIM}"}\nFirst **bold** and [link](/x/).\n\n- a\n- b\n\n1. one\n2. two\n:::`,
		)
		expect(html).toContain('<strong>bold</strong>')
		expect(html).toContain('<a href="/x/">link</a>')
		expect(html).toContain('<ul>')
		expect(html).toContain('<ol>')
	})

	it('fails with document path and directive position on rejected input', async () => {
		await expect(render(`:::note\nBody.\n:::`, 'file:///docs/a.ru.md')).rejects.toThrow(
			/\/docs\/a\.ru\.md:1:1 note: .*claim is required/,
		)
		await expect(
			render(`:::note{claim="bad:id"}\nBody.\n:::`, 'file:///docs/a.ru.md'),
		).rejects.toThrow(/note: .*malformed claim/)
		await expect(
			render(`:::note{claim="${CLAIM}"}\n## heading\n:::`, 'file:///docs/a.ru.md'),
		).rejects.toThrow(/note: .*heading/)
		await expect(
			render(
				`:::note{claim="${CLAIM}"}\n[x](javascript:alert(1))\n:::`,
				'file:///docs/a.ru.md',
			),
		).rejects.toThrow(/note: .*unsafe URL/)
		await expect(
			render(`:::note{claim="${CLAIM}"}\n\n:::`, 'file:///docs/a.ru.md'),
		).rejects.toThrow(/note: .*empty/)
	})
})

describe('note default title', () => {
	// the integration passes the site's merged dictionaries; a one-locale site has only its own
	const oneLocale = async (src: string, fileURL: string) => {
		const processor = (await createSatteriMarkdownProcessor({
			features: { directive: true },
			mdastPlugins: [
				noteMdastPlugin((locale) =>
					locale === 'en' ? 'Site note title' : undefined,
				) as never,
			],
		})) as unknown as Renderer
		return (await processor.render(src, { fileURL: new URL(fileURL) })).code
	}

	it('takes the text of the site dictionary for the document locale', async () => {
		expect(
			await oneLocale(`:::note{claim="${CLAIM}"}\nBody.\n:::`, 'file:///docs/x.en.md'),
		).toContain('Site note title')
	})

	it('fails on a document in a locale outside content.locales', async () => {
		await expect(
			oneLocale(`:::note{claim="${CLAIM}"}\nBody.\n:::`, 'file:///docs/x.ru.md'),
		).rejects.toThrow(/note: the document locale "ru" is not one of content.locales/)
	})
})
