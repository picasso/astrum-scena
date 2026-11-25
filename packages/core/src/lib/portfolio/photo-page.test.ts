import { describe, expect, it, vi } from 'vitest'

import { buildSiteConfig } from '../../config/fixtures/site-config.ts'
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
	const captured = async (intl?: string) => {
		const config = buildSiteConfig()
		const { catalog } = config.content
		if (intl)
			config.content = {
				...config.content,
				catalog: { ...catalog, en: { ...catalog.en!, intl } },
			}
		const model = await buildPhotoPageModel('a', 'p', 'en', '/a/', (id) => `/a/${id}/`, config)
		return model.captured
	}

	it("formats the capture date with the intl tag of the site's catalog", async () => {
		expect(await captured()).toBe('March 2008')
		expect(await captured('de-DE')).toBe('März 2008')
	})
})
