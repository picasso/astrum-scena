import { describe, expect, it, vi } from 'vitest'

import { buildSiteConfig, contentConfig } from '../../config/fixtures/site-config.ts'
import { loadSiteSection } from '../../config/loader.ts'
import { siteRoot } from '../../config/site-root.ts'
import { loadContentSnapshot } from '../content/files.ts'
import { buildPhotoPageModel, isPhotoPageUnlisted } from './photo-page.ts'

// the demo's first album and its first photo, with a month-level capture date
vi.mock('./build-data.ts', async () => {
	const snapshot = await loadContentSnapshot(siteRoot)
	const album = snapshot.albums[0]!
	const photos = album.data.photoIds.map((id) =>
		snapshot.photos.find((photo) => photo.id === id)!,
	)
	const [first, ...related] = photos
	const photo = { ...first!, data: { ...first!.data, capturedAt: '2008-03' } }
	return {
		resolvePublishedPhoto: async () => ({
			album,
			photo,
			related,
			photosById: new Map(photos.map((entry) => [entry.id, entry])),
		}),
	}
})

describe('isPhotoPageUnlisted', () => {
	it('inherits unlisted from the album and keeps a photo-level flag', () => {
		expect(isPhotoPageUnlisted({ unlisted: true }, {})).toBe(true)
		expect(isPhotoPageUnlisted({}, { unlisted: true })).toBe(true)
		expect(isPhotoPageUnlisted({}, {})).toBe(false)
		expect(isPhotoPageUnlisted({ unlisted: false }, { unlisted: false })).toBe(false)
	})
})

describe('buildPhotoPageModel', () => {
	// the demo content follows the demo's own taxonomy
	const demoContent = () => ({
		...contentConfig(['en', 'ru'], 'ru'),
		taxonomy: loadSiteSection(siteRoot, 'content').taxonomy,
	})
	const modelOf = (config = buildSiteConfig({ content: demoContent() }), locale = 'en') =>
		buildPhotoPageModel('a', 'p', locale, '/a/', (id) => `/a/${id}/`, config)

	const captured = async (intl?: string) => {
		const config = buildSiteConfig({ content: demoContent() })
		const { catalog } = config.content
		if (intl)
			config.content = {
				...config.content,
				catalog: { ...catalog, en: { ...catalog.en!, intl } },
			}
		return (await modelOf(config)).captured
	}

	it("formats the capture date with the intl tag of the site's catalog", async () => {
		expect(await captured()).toBe('March 2008')
		expect(await captured('de-DE')).toBe('März 2008')
	})

	it("gives the photo's dimension values as chips with the dimension's label and Lucide icon", async () => {
		const [events, projects, ...others] = (await modelOf()).dimensions
		expect(others).toEqual([])
		expect(events).toMatchObject({
			dimension: 'events',
			title: 'Events',
			id: 'tide-fair',
			label: 'Tide Fair',
		})
		expect(events!.icon).toMatch(
			/^<!-- @license lucide-static [^>]*--> <svg[^>]*class="lucide lucide-calendar-days"[\s\S]*<\/svg>$/,
		)
		expect(projects).toEqual({
			dimension: 'projects',
			title: 'Projects',
			id: 'shoreline-series',
			label: 'Shoreline Series',
		})
		expect((await modelOf(undefined, 'ru')).dimensions[0]).toMatchObject({
			title: 'События',
			label: 'Ярмарка прилива',
		})
	})

	it('leaves the icon out of a dimension that declares none', async () => {
		const content = demoContent()
		const events = content.taxonomy.dimensions.events!
		content.taxonomy = {
			...content.taxonomy,
			dimensions: { ...content.taxonomy.dimensions, events: { label: events.label } },
		}
		const [chip] = (await modelOf(buildSiteConfig({ content }))).dimensions
		expect(chip).not.toHaveProperty('icon')
	})
})
