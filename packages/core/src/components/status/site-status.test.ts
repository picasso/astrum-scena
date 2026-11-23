import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Locale } from '../../config/locale-schema.ts'
import type { SiteStatusModel } from '../../lib/status/build-data.ts'
import SiteStatus from './site-status.astro'

// presentation only: the model is a ready server-side object; the builder has its own unit tests
const model: SiteStatusModel = {
	generatedAt: '2026-09-06T12:34:56.000Z',
	version: '9.9.9',
	translations: {
		locales: ['en'],
		titleLocale: 'en',
		summary: { totalPairs: 3, publishedPairs: 2, current: 1, needsReview: 2 },
		rows: [
			{
				section: 'articles',
				published: true,
				status: 'current',
				translation: 'up-to-date',
				title: 'Glass and Light',
				routeHref: '/en/articles/glass-and-light/',
				publishedAt: '2017-07-16',
			},
			// a published page with an outdated translation: title shown, no route link
			{
				section: 'pages',
				published: true,
				status: 'needs-review',
				translation: 'outdated',
				title: 'Home',
			},
			{
				section: 'articles',
				published: false,
				status: 'current',
				translation: 'up-to-date',
				title: 'Draft One',
			},
			{
				section: 'articles',
				published: false,
				status: 'needs-review',
				translation: 'unverified',
				title: 'Draft Two',
			},
		],
	},
	content: {
		publishedArticlePairs: 1,
		publishedCoursePairs: 0,
		publishedPagePairs: 1,
		publishedPhotos: 17,
		publishedAlbums: 4,
	},
	imageRelease: { active: true, assetCount: 17 },
}

let container: AstroContainer
beforeAll(async () => {
	container = await AstroContainer.create()
})

const render = (override: Partial<SiteStatusModel> = {}) =>
	container.renderToString(SiteStatus, { props: { model: { ...model, ...override } } })
// the markup with whitespace runs collapsed and trimmed inside tags, for asserting visible text
const collapse = (html: string) =>
	html.replace(/\s+/g, ' ').replace(/>\s/g, '>').replace(/\s</g, '<')

describe('SiteStatus presentation', () => {
	it('renders a single .site-status root with the three sections', async () => {
		const html = await render()
		expect(html).toContain('class="site-status"')
		expect(html).toContain('Translations')
		expect(html).toContain('Published content')
		expect(html).toContain('Image release')
	})

	it('is English-only — no Cyrillic in the service copy', async () => {
		const html = await render()
		expect(html).not.toMatch(/[а-яё]/i)
	})

	it('shows Central European local time, keeps UTC in the title, and prints the version', async () => {
		const html = await render()
		expect(html).toContain('Generated during static build')
		// datetime attr stays the machine-readable UTC instant
		expect(html).toContain('datetime="2026-09-06T12:34:56.000Z"')
		// visible = Europe/Berlin local (2026-09-06T12:34Z is CEST, UTC+2 → 14:34), no timezone shown
		expect(html).toContain('6 Sep 2026 · 14:34')
		// title = the stored UTC, so the conversion is visible on hover
		expect(html).toContain('title="06/09/2026 12:34 UTC"')
		// current site version, in an accent outline badge (composable classes)
		expect(html).toMatch(/site-status__badge--outline[^"]*site-status__tone-accent/)
		expect(html).toContain('9.9.9')
	})

	it('accessible table: caption and column headers', async () => {
		const html = await render()
		expect(html).toContain('<caption>')
		expect(html).toContain('scope="col"')
	})

	it('published rows link only when a document route exists; home has a title but no link', async () => {
		const html = await render()
		expect(html).toContain('href="/en/articles/glass-and-light/"')
		expect(html).toContain('Glass and Light')
		// home appears by title but is not a link
		expect(html).toContain('Home')
		expect(html).not.toContain('href="/en/home/"')
	})

	it('shows a month/year meta chip for a published article with a publishedAt', async () => {
		const html = await render()
		expect(html).toContain('july, 2017')
	})

	it('draft rows show their title without a link', async () => {
		const html = await render({
			translations: {
				locales: ['en'],
				titleLocale: 'en',
				summary: { totalPairs: 1, publishedPairs: 0, current: 0, needsReview: 1 },
				rows: [
					{
						section: 'articles',
						published: false,
						status: 'needs-review',
						translation: 'outdated',
						title: 'Draft Piece',
					},
				],
			},
		})
		expect(html).toContain('Draft Piece')
		expect(html).not.toContain('href="/en/articles')
		// the separate Status column carries "Draft"; no "draft" chip next to the title any more
		expect(html).toContain('data-status="draft"')
		expect(html).not.toMatch(/>\s*draft\s*</)
		expect(html).toContain('data-status="outdated"')
	})

	// separate axes keep an outdated translation of a published document visible
	it('shows publication status and EN translation freshness in separate columns', async () => {
		const html = await render()
		expect(html).toContain('>Status<')
		expect(html).toContain('>EN translation<')
		expect(html).toContain('data-status="published"')
		expect(html).toContain('data-status="draft"')
		expect(html).toContain('data-status="up-to-date"')
		expect(html).toContain('data-status="outdated"')
		expect(html).toContain('data-status="unverified"')
		for (const label of ['Published', 'Draft', 'Up to date', 'Outdated', 'Unverified']) {
			expect(html).toContain(label)
		}
		// the old merged wording is gone
		expect(html).not.toContain('Active<')
		expect(html).not.toContain('Needs review')
	})

	it('names the translated locale of this site in the summary and caption', async () => {
		const html = collapse(await render())
		expect(html).toContain('2 EN translations not up to date')
		expect(html).toContain('English translation freshness for every document pair.')
	})

	it.each([
		{ locales: ['ru'], codes: 'RU', names: 'Russian' },
		{ locales: ['en', 'de'], codes: 'EN/DE', names: 'English/German' },
	])('labels freshness by the translated locales $codes', async ({ locales, codes, names }) => {
		const html = collapse(
			await render({
				translations: { ...model.translations, locales: locales as Locale[] },
			}),
		)
		expect(html).toContain(`>${codes} translation<`)
		expect(html).toContain(`2 ${codes} translations not up to date`)
		expect(html).toContain(`${names} translation freshness for every document pair.`)
	})

	it('a one-locale site lists documents without any translation elements', async () => {
		const html = collapse(
			await render({ translations: { ...model.translations, locales: [] } }),
		)
		expect(html).toContain('>Documents<')
		expect(html).toContain('Glass and Light')
		expect(html).toContain('data-status="published"')
		expect(html).not.toContain('Translations')
		// no visible translation copy (the section keeps its stable id)
		expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/translation/i)
		expect(html).not.toContain('data-status="up-to-date"')
		expect(html).not.toContain('data-status="outdated"')
	})

	it('leaves row titles unmarked when they share the service-copy language', async () => {
		const html = await render()
		expect(html).toMatch(/<a class="site-status__doc-link" href="[^"]*">/)
		expect(html).not.toMatch(/<span lang=/)
	})

	it('marks row titles in another display locale with its lang, linked or not', async () => {
		const html = await render({ translations: { ...model.translations, titleLocale: 'ru' } })
		expect(html).toMatch(
			/<a class="site-status__doc-link" href="\/en\/articles\/glass-and-light\/" lang="ru">/,
		)
		expect(html).toContain('<span lang="ru">Home</span>')
		expect(html).toContain('<span lang="ru">Draft One</span>')
	})

	it('never leaks digests, config digest, R2 origin or manifest keys', async () => {
		const html = await render()
		const fragment = html.slice(html.indexOf('site-status'))
		expect(fragment).not.toMatch(/[0-9a-f]{64}/)
		expect(fragment).not.toContain('configDigest')
		expect(fragment).not.toMatch(/https?:\/\/[^"']*\.(r2|cloudflare|workers)/)
	})

	it('uses no client directives or set:html', async () => {
		const html = await render()
		expect(html).not.toContain('client:')
		expect(html).not.toContain('astro-island')
	})
})
