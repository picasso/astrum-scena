import { describe, expect, it } from 'vitest'

import {
	cardGridColumns,
	contactsAsideSizes,
	cropGridColumns,
	galleryAsideColumnSizes,
	galleryAsideContainerWidth,
	gallerySizes,
	masonryColumns,
	moreDocumentsSizes,
	SURFACE_SIZES,
	wrapAroundSizes,
} from './sizes.ts'
import { SURFACE_MEDIA } from './surface.ts'

// sizes.ts is the only home of HTML `sizes`; photoswipeSlide is absent because the island sets it
describe('SURFACE_SIZES', () => {
	it('ADR-0008 fit: typical capped slots have a 2x derivative', () => {
		const slots = {
			portfolioCard: 340,
			documentCard: 340,
			relatedPhoto: 240,
			albumGrid: 400,
			contactsAside: 222,
			footerThumb: 160,
			wrapAround: 292,
			galleryCell: 360,
		} as const
		for (const [surface, width] of Object.entries(slots)) {
			const cap = SURFACE_MEDIA[surface as keyof typeof slots].maxWidth
			expect(cap, `${surface}: ${width}px slot at 2x`).toBeGreaterThanOrEqual(width * 2)
		}
		// full-bleed, primary and lightbox have no cap; the ladder's 2000px long-side ceiling
		// makes a 2x guarantee impossible at the widest viewports.
		for (const surface of ['bannerHero', 'photoPrimary', 'photoswipeSlide'] as const) {
			expect(SURFACE_MEDIA[surface].maxWidth).toBeUndefined()
		}
		// document list on a gallery-width page and justified gallery cells are documented
		// exceptions: their slot can exceed the 800px preview cap at 2x.
		expect(SURFACE_MEDIA.documentListItem.maxWidth).toBe(800)
		expect(gallerySizes(3, 'justified')).toContain('800px')
	})
	it('provides a non-empty sizes literal for every presentation surface', () => {
		for (const [surface, value] of Object.entries(SURFACE_SIZES)) {
			expect(value, surface).toMatch(/\S/)
		}
	})

	it('covers exactly the component-owned surfaces (photoswipeSlide excluded)', () => {
		expect(Object.keys(SURFACE_SIZES).sort()).toEqual([
			'albumGrid',
			'bannerHero',
			'documentCard',
			'documentListItem',
			'footerThumb',
			'photoPrimary',
			'portfolioCard',
			'relatedPhoto',
		])
	})

	it('uses a fixed px anchor for the full-bleed hero and constrained primary', () => {
		expect(SURFACE_SIZES.bannerHero).toBe('100vw')
		expect(SURFACE_SIZES.photoPrimary).toContain('1200px')
	})
})

describe('wrapAroundSizes', () => {
	it('matches the stacked, fluid-float and fixed prose geometries', () => {
		expect(wrapAroundSizes(45)).toBe(
			'(max-width: 512px) calc(100vw - 32px), ' +
				'(max-width: 680px) calc(45vw - 14.4px), 292px',
		)
		expect(wrapAroundSizes(70)).toBe(
			'(max-width: 512px) calc(100vw - 32px), ' +
				'(max-width: 680px) calc(70vw - 22.4px), 454px',
		)
		expect(wrapAroundSizes(80)).toBe(
			'(max-width: 512px) calc(100vw - 32px), ' +
				'(max-width: 680px) calc(80vw - 25.6px), 518px',
		)
	})

	it('tracks the safe collapse of outside media without changing ordinary blocks', () => {
		expect(wrapAroundSizes(70, 40)).toBe(
			'(max-width: 512px) calc(100vw - 32px), ' +
				'(max-width: 680px) calc(50vw - 16px), ' +
				'(max-width: 939.2px) calc(50vw - 16px), 454px',
		)
		expect(wrapAroundSizes(80, 20)).toBe(
			'(max-width: 512px) calc(100vw - 32px), ' +
				'(max-width: 680px) calc(60vw - 19.2px), ' +
				'(max-width: 939.2px) calc(50vw + 48.8px), 518px',
		)
		expect(wrapAroundSizes(45, 20)).toBe(wrapAroundSizes(45))
	})
})

describe('contactsAsideSizes', () => {
	it('keeps the legacy 1/4 geometry at width 25', () => {
		expect(contactsAsideSizes(25)).toBe(
			'(max-width: 767px) calc(100vw - 32px), (max-width: 960px) calc(24vw - 8px), 222px',
		)
	})

	it('scales the column with the configured width', () => {
		expect(contactsAsideSizes(20)).toBe(
			'(max-width: 767px) calc(100vw - 32px), (max-width: 960px) calc(19.2vw - 6.4px), 178px',
		)
		expect(contactsAsideSizes(40)).toBe(
			'(max-width: 767px) calc(100vw - 32px), (max-width: 960px) calc(38.4vw - 12.8px), 355px',
		)
	})

	it('widens the candidate when a narrow crop makes the image wider than its column', () => {
		expect(contactsAsideSizes(25, 1.5)).toBe(
			'(max-width: 767px) calc(150vw - 48px), (max-width: 960px) calc(36vw - 12px), 333px',
		)
		expect(contactsAsideSizes(25, 0.5)).toBe(contactsAsideSizes(25))
	})
})

describe('moreDocumentsSizes', () => {
	it('uses the selected MoreDocuments container for grid candidates', () => {
		expect(moreDocumentsSizes('grid', 'prose', 2)).toBe('(max-width: 640px) 100vw, 340px')
		expect(moreDocumentsSizes('grid', 'medium', 3)).toBe('(max-width: 640px) 100vw, 320px')
		expect(moreDocumentsSizes('grid', 'wide', 4)).toBe('(max-width: 640px) 100vw, 300px')
	})
})

// album page grid: container width mirrors the page CSS, and each viewport range must yield the
// cell width at the actual column count
describe('album grid sizes', () => {
	it('follows the album page container: full width below 1024, 75% column above, capped', () => {
		expect(galleryAsideContainerWidth(600)).toBe(568)
		expect(galleryAsideContainerWidth(1024)).toBe(712)
		expect(galleryAsideContainerWidth(1100)).toBe(769)
		expect(galleryAsideContainerWidth(1440)).toBe(1024)
		expect(galleryAsideContainerWidth(1920)).toBe(1024)
	})

	it('counts masonry columns like CSS columns (min width, max count)', () => {
		const settings = { minColumnWidth: 300, gap: 12, maxColumns: 5 }
		expect(masonryColumns(568, settings)).toBe(1)
		expect(masonryColumns(712, settings)).toBe(2)
		expect(masonryColumns(1024, settings)).toBe(3)
		expect(masonryColumns(100, settings)).toBe(1)
		expect(masonryColumns(5000, settings)).toBe(5)
	})

	it('counts card-grid columns: exact from 720px, auto-fit by 220px below', () => {
		const settings = { columns: 3, gap: 16 }
		expect(cardGridColumns(720, settings)).toBe(3)
		expect(cardGridColumns(1024, settings)).toBe(3)
		expect(cardGridColumns(719, settings)).toBe(3) // (719+16)/(220+16) = 3.1
		expect(cardGridColumns(568, settings)).toBe(2)
		expect(cardGridColumns(343, settings)).toBe(1)
	})

	it('counts crop-grid columns with a 240px tile floor between the min and max counts', () => {
		const settings = { columns: 4, gap: 12, minColumns: 2 }
		expect(cropGridColumns(343, settings)).toBe(2) // phone: 2 even below a 240 tile
		expect(cropGridColumns(343, { ...settings, minColumns: 1 })).toBe(1)
		expect(cropGridColumns(768, settings)).toBe(3)
		expect(cropGridColumns(1024, settings)).toBe(4)
		expect(cropGridColumns(5000, settings)).toBe(4)
	})

	it('emits one condition per column range and a fixed cap above the gallery width', () => {
		const settings = { minColumnWidth: 300, gap: 12, maxColumns: 5 }
		const sizes = galleryAsideColumnSizes({
			columns: (width) => masonryColumns(width, settings),
			gap: settings.gap,
		})
		const parts = sizes.split(', ')
		expect(parts.at(-1)).toBe(`${Math.ceil((1024 - 2 * 12) / 3)}px`)
		expect(parts.slice(0, -1).every((part) => /^\(max-width: \d+px\) calc\(/.test(part))).toBe(
			true,
		)
		// at 1024 the full-width grid formula gives way to the 75 % column formula
		expect(sizes).toContain('(max-width: 1023px) calc((100vw - 56px) / 3)')
		expect(sizes).toContain('calc((75vw - ')
	})

	it('never promises a cell wider than the real one at sampled viewports', () => {
		const settings = { columns: 4, gap: 12, minColumns: 2 }
		for (const viewport of [320, 375, 768, 1024, 1280, 1440, 1920]) {
			const width = galleryAsideContainerWidth(viewport)
			const columns = cropGridColumns(width, settings)
			const cell = (width - (columns - 1) * settings.gap) / columns
			expect(cell).toBeGreaterThan(0)
			expect(cell).toBeLessThanOrEqual(width)
		}
	})
})
