import { describe, expect, it } from 'vitest'

import { parseWrapAroundProps } from './schema.ts'
import { wrapContext } from './test-fixtures.ts'
import { resolveWrapAround } from './view-model.ts'

function resolve(input: Record<string, unknown>) {
	return resolveWrapAround(parseWrapAroundProps(input), wrapContext)
}

describe('resolveWrapAround', () => {
	it('derives single vs multiple from images.length', () => {
		expect(resolve({ imageId: 'portrait-a' }).multiple).toBe(false)
		expect(resolve({ images: [{ imageId: 'portrait-a' }] }).multiple).toBe(false)
		expect(
			resolve({ images: [{ imageId: 'portrait-a' }, { imageId: 'portrait-b' }] }).multiple,
		).toBe(true)
	})

	it('auto-sizes single images and a mixed-aspect group by effective ratio', () => {
		expect(resolve({ images: [{ imageId: 'portrait-a' }] }).width).toBe(40) // r = 0.75
		expect(resolve({ images: [{ imageId: 'portrait-b' }] }).width).toBe(45) // r = 1.5
		// group R = 1 / (1/0.75 + 1/1.5) = 0.5 → 33
		expect(
			resolve({ images: [{ imageId: 'portrait-a' }, { imageId: 'portrait-b' }] }).width,
		).toBe(33)
	})

	it('lets a manual width replace the heuristic', () => {
		expect(resolve({ images: [{ imageId: 'portrait-a' }], width: 60 }).width).toBe(60)
	})

	it('preserves the requested outside share alongside the visual width', () => {
		const vm = resolve({ imageId: 'portrait-b', width: 70, outside: 20 })
		expect(vm.width).toBe(70)
		expect(vm.outside).toBe(20)
		expect(vm.items[0]!.model.sizes).toBe(
			'(max-width: 512px) calc(100vw - 32px), ' +
				'(max-width: 680px) calc(50vw - 16px), ' +
				'(max-width: 939.2px) calc(50vw - 16px), 454px',
		)
	})

	it('inherits the block action, lets an image override it, and reports the lightbox group', () => {
		const vm = resolve({
			images: [
				{ imageId: 'portrait-a' }, // inherits block lightbox
				{ imageId: 'portrait-b', action: 'none' }, // override out of the group
			],
			action: 'lightbox',
		})
		expect(vm.items[0]!.action.kind).toBe('lightbox')
		expect(vm.items[1]!.action.kind).toBe('none')
		expect(vm.hasLightbox).toBe(true)
	})

	it('points a lightbox anchor at the image file, not the photo page', () => {
		const vm = resolve({ images: [{ imageId: 'portrait-a' }], action: 'lightbox' })
		const action = vm.items[0]!.action
		expect(action.kind).toBe('lightbox')
		if (action.kind === 'lightbox') {
			expect(action.href).toBe(
				'https://img.example.com/portrait-a/900w-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp',
			)
			expect(action.href).not.toMatch(/\/portfolio\//)
			expect(action.pswp.width).toBe(900)
			expect(action.pswp.srcset).toContain('900w')
		}
	})

	it('keeps the inline preview on grid derivatives and the lightbox on viewer derivatives', () => {
		const vm = resolve({
			images: [{ imageId: 'portrait-b' }],
			width: 45,
			action: 'lightbox',
		})
		const item = vm.items[0]!
		expect(item.model.sources[0]!.srcset).toContain(
			'/400w-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.avif 400w',
		)
		expect(item.model.sources[0]!.srcset).toContain(
			'/800w-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.avif 800w',
		)
		expect(item.model.sources[0]!.srcset).not.toContain('1600w')
		expect(item.model.fallback.src).toContain(
			'/800w-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp',
		)
		expect(item.model.sizes).toBe(
			'(max-width: 512px) calc(100vw - 32px), ' +
				'(max-width: 680px) calc(45vw - 14.4px), 292px',
		)
		if (item.action.kind === 'lightbox') {
			expect(item.action.href).toContain(
				'/1600w-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp',
			)
			expect(item.action.pswp.srcset).toContain(
				'/1600w-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp 1600w',
			)
		}
	})

	it('resolves album and custom actions through routes and safe-link', () => {
		const vm = resolve({
			images: [
				{ imageId: 'portrait-a', action: { type: 'album', albumId: 'northland' } },
				{
					imageId: 'portrait-b',
					action: { type: 'custom', href: '/courses/', newTab: true },
				},
			],
		})
		expect(vm.items[0]!.action).toMatchObject({
			kind: 'link',
			href: '/en/portfolio/northland/',
		})
		expect(vm.items[1]!.action).toMatchObject({
			kind: 'link',
			href: '/courses/',
			target: '_blank',
			rel: 'noopener noreferrer',
		})
	})

	it('rejects an unpublished album target and an unsafe custom href', () => {
		expect(() =>
			resolve({
				images: [{ imageId: 'portrait-a', action: { type: 'album', albumId: 'hidden' } }],
			}),
		).toThrow(/not a published album/)
		expect(() =>
			resolve({
				images: [
					{
						imageId: 'portrait-a',
						action: { type: 'custom', href: 'javascript:alert(1)' },
					},
				],
			}),
		).toThrow(/not an allowed link/)
	})

	it('fails on an unknown imageId', () => {
		expect(() => resolve({ images: [{ imageId: 'ghost' }] })).toThrow(/ghost/)
	})

	it('honors caption overrides, decorative alt and both caption flags', () => {
		// caption=false suppresses; alt="" is decorative but a linked image keeps an accessible name.
		const vm = resolve({
			images: [
				{
					imageId: 'portrait-b',
					alt: '',
					caption: false,
					action: { type: 'album', albumId: 'northland' },
				},
			],
			inlineCaption: true,
		})
		const item = vm.items[0]!
		expect(item.model.alt).toBe('')
		expect(item.caption).toBeUndefined()
		expect(item.showCaption).toBe(false)
		if (item.action.kind === 'link') expect(item.action.label).toBe('Title portrait-b')

		// string caption replaces the catalog and shows inline when enabled.
		const shown = resolve({
			images: [{ imageId: 'portrait-a', caption: 'Custom line' }],
			action: 'none',
			inlineCaption: true,
		})
		expect(shown.items[0]!.caption).toBe('Custom line')
		expect(shown.items[0]!.showCaption).toBe(true)
	})

	it('gates the lightbox caption behind lightboxCaption', () => {
		const off = resolve({ images: [{ imageId: 'portrait-b' }], lightboxCaption: false })
		const on = resolve({ images: [{ imageId: 'portrait-b' }], lightboxCaption: true })
		if (off.items[0]!.action.kind === 'lightbox')
			expect(off.items[0]!.action.pswp.caption).toBeUndefined()
		if (on.items[0]!.action.kind === 'lightbox')
			expect(on.items[0]!.action.pswp.caption).toBe('Ridge at dawn')
	})

	it('carries the lightbox scope through to the view model', () => {
		expect(
			resolve({ images: [{ imageId: 'portrait-a' }], lightboxScope: 'page' }).lightboxScope,
		).toBe('page')
		expect(resolve({ images: [{ imageId: 'portrait-a' }] }).lightboxScope).toBe('page')
	})
})
