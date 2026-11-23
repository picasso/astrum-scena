import { describe, expect, it } from 'vitest'

import { buildSiteConfig } from '../../config/fixtures/site-config.ts'
import {
	type BannerTarget,
	listSurfaceBannerAssignments,
	selectBannerAccent,
	selectBannerPhotoId,
	type SurfaceBanners,
	surfaceBanners,
} from './select.ts'

// document covers live in content (ADR-0013), so the config assigns only surfaces with no document
const banners: SurfaceBanners = {
	portfolioIndex: 'quiet-light',
	articlesIndex: 'off',
	coursesIndex: 'off',
	contacts: 'off',
}

describe('surfaceBanners', () => {
	const config = buildSiteConfig()

	it("adds an enabled module's surfaces from its section to the core's", () => {
		expect(surfaceBanners(config)).toEqual({
			...config.banners.surfaces,
			coursesIndex: config.modules.courses!.banner,
		})
	})

	it('has only the core surfaces while no module is enabled', () => {
		expect(surfaceBanners({ ...config, modules: {} })).toEqual(config.banners.surfaces)
	})
})

describe('selectBannerPhotoId', () => {
	it('returns the assigned photo of a surface', () => {
		expect(selectBannerPhotoId(banners, { kind: 'surface', surface: 'portfolioIndex' })).toBe(
			'quiet-light',
		)
	})

	// `off` makes the surface render a text header
	it('treats off as no banner', () => {
		expect(
			selectBannerPhotoId(banners, { kind: 'surface', surface: 'articlesIndex' }),
		).toBeUndefined()
	})

	it('fails on a surface no section declares', () => {
		expect(() =>
			selectBannerPhotoId(banners, { kind: 'surface', surface: 'toursIndex' }),
		).toThrow('no banner surface "toursIndex"')
	})

	it('never assigns a configured banner to album or document targets', () => {
		expect(selectBannerPhotoId(banners, { kind: 'album' })).toBeUndefined()
		expect(
			selectBannerPhotoId(banners, {
				kind: 'document',
				collection: 'pages',
				translationKey: 'about',
			}),
		).toBeUndefined()
	})
})

describe('listSurfaceBannerAssignments', () => {
	// the config-wide check relies on this list; an assignment left out would never be checked
	it('lists assigned surfaces, skipping off', () => {
		expect(listSurfaceBannerAssignments(banners)).toEqual([
			{ target: { kind: 'surface', surface: 'portfolioIndex' }, photoId: 'quiet-light' },
		])
	})

	// the list feeds the config-wide check, so an `off` surface must never reach it
	it('drops every off surface and keeps every assigned one', () => {
		const mixed: SurfaceBanners = {
			portfolioIndex: 'quiet-light',
			articlesIndex: 'off',
			coursesIndex: 'ice-drift',
			contacts: 'off',
		}
		const assignments = listSurfaceBannerAssignments(mixed)
		expect(assignments.map((assignment) => assignment.photoId)).toEqual([
			'quiet-light',
			'ice-drift',
		])
		expect(assignments.map((assignment) => assignment.photoId)).not.toContain('off')
	})
})

describe('selectBannerAccent', () => {
	const accent = { album: 'accent', section: 'alt' } as const

	it('keeps the yellow tail on the album and reds the section banners', () => {
		expect(selectBannerAccent(accent, { kind: 'album' })).toBe('accent')
		const targets: BannerTarget[] = [
			{ kind: 'surface', surface: 'contacts' },
			{ kind: 'document', collection: 'pages', translationKey: 'about' },
		]
		for (const target of targets) {
			expect(selectBannerAccent(accent, target)).toBe('alt')
		}
	})

	it('follows the config in both directions', () => {
		expect(selectBannerAccent({ album: 'alt', section: 'accent' }, { kind: 'album' })).toBe(
			'alt',
		)
		expect(
			selectBannerAccent(
				{ album: 'alt', section: 'accent' },
				{ kind: 'surface', surface: 'contacts' },
			),
		).toBe('accent')
	})
})
