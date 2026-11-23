// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

// the bootstrap pulls in PhotoSwipe and its overlay, so only the remount call is checked; the
// coordinator is imported after the mock because it attaches document listeners on import
vi.mock('./photoswipe-bootstrap.ts', () => ({ mount: vi.fn() }))

const { mount } = await import('./photoswipe-bootstrap.ts')
const { sampleWithDedup } = await import('./gallery-coordinator.ts')

const item = (imageId: string) => ({ imageId })
const ids = (items: { imageId: string }[]) => items.map((entry) => entry.imageId)

function sequence(values: number[]): () => number {
	let index = 0
	return () => values[index++ % values.length]!
}

// mirrors the serialized keys of gallery-item.astro
function figureHtml(id: string, opts: { favorite?: boolean; w?: number; h?: number } = {}): string {
	const { favorite = false, w = 1500, h = 1000 } = opts
	return `<figure class="gallery__item" data-image-id="${id}" data-favorite="${favorite}" data-aspect-width="${w}" data-aspect-height="${h}"><a class="album-photo gallery__link"><picture class="gallery__media"><img class="gallery__img"></picture></a></figure>`
}

// mirrors gallery.astro: container, candidate template and an empty live grid
function dynamicGallery(
	pool: string[],
	opts: {
		randomCount: number
		layout?: string
		order?: string
		priority?: string
		mobileFirstOnly?: boolean
	} = {
		randomCount: 2,
	},
): string {
	const {
		randomCount,
		layout = 'square',
		order = 'source',
		priority = '',
		mobileFirstOnly = false,
	} = opts
	const candidates = pool.map((id) => figureHtml(id, { favorite: id.startsWith('fav') })).join('')
	const mobileAttribute = mobileFirstOnly ? ' data-gallery-mobile-first-only' : ''
	return `<div class="gallery gallery--${layout}" data-gallery data-gallery-layout="${layout}" data-gallery-columns="3" data-gallery-frame="1"${mobileAttribute} data-gallery-dynamic data-gallery-random-count="${randomCount}" data-gallery-order="${order}" data-gallery-priority="${priority}"><template data-gallery-candidates>${candidates}</template><div class="gallery__grid" style="column-gap:8px" data-gallery-live></div></div>`
}

function pageLoad(): void {
	document.dispatchEvent(new Event('astro:page-load'))
}

function liveIds(gallery: Element): string[] {
	return [...gallery.querySelectorAll('[data-gallery-live] .gallery__item')].map(
		(figure) => (figure as HTMLElement).dataset.imageId ?? '',
	)
}

afterEach(() => {
	document.body.innerHTML = ''
	vi.mocked(mount).mockClear()
})

describe('sampleWithDedup', () => {
	const pool = ['a', 'b', 'c', 'd', 'e'].map(item)

	it('samples only from ids not yet used on the page when enough remain', () => {
		const used = new Set(['a', 'b'])
		const chosen = sampleWithDedup(pool, 2, used, sequence([0, 0]))
		expect(chosen).toHaveLength(2)
		for (const entry of chosen) expect(used.has(entry.imageId)).toBe(false)
		expect(new Set(ids(chosen)).size).toBe(2)
	})

	it('falls back to previously shown ids when fresh candidates are short, without in-block repeats', () => {
		const used = new Set(['a', 'b', 'c', 'd'])
		const chosen = sampleWithDedup(pool, 3, used, sequence([0, 0, 0]))
		expect(chosen).toHaveLength(3)
		expect(new Set(ids(chosen)).size).toBe(3)
		expect(ids(chosen)).toContain('e')
	})

	it('is deterministic under an injected RNG', () => {
		const a = sampleWithDedup(pool, 3, new Set(), sequence([0.1, 0.5, 0.9]))
		const b = sampleWithDedup(pool, 3, new Set(), sequence([0.1, 0.5, 0.9]))
		expect(ids(a)).toEqual(ids(b))
	})
})

describe('coordinator lifecycle (astro:page-load)', () => {
	it('moves exactly randomCount candidates from the inert template into the live DOM', () => {
		document.body.innerHTML = dynamicGallery(['a', 'b', 'c', 'd', 'e'], { randomCount: 3 })
		const gallery = document.querySelector('[data-gallery]')!
		expect(liveIds(gallery)).toHaveLength(0) // inert before JS
		pageLoad()
		const chosen = liveIds(gallery)
		expect(chosen).toHaveLength(3)
		expect(new Set(chosen).size).toBe(3)
		for (const id of chosen) expect(['a', 'b', 'c', 'd', 'e']).toContain(id)
	})

	it('deduplicates across galleries in DOM order when the pool is large enough', () => {
		document.body.innerHTML =
			dynamicGallery(['a', 'b', 'c', 'd'], { randomCount: 2 }) +
			dynamicGallery(['a', 'b', 'c', 'd'], { randomCount: 2 })
		pageLoad()
		const [first, second] = [...document.querySelectorAll('[data-gallery]')]
		const overlap = liveIds(first!).filter((id) => liveIds(second!).includes(id))
		expect(overlap).toHaveLength(0)
	})

	it('clears the CLS reservation variable after filling', () => {
		document.body.innerHTML = dynamicGallery(['a', 'b', 'c'], { randomCount: 2 })
		const gallery = document.querySelector('[data-gallery]') as HTMLElement
		gallery.style.setProperty('--gallery-reserve-rows', '1')
		pageLoad()
		expect(gallery.style.getPropertyValue('--gallery-reserve-rows')).toBe('0')
	})

	it('remounts PhotoSwipe once dynamic anchors are live', () => {
		document.body.innerHTML = dynamicGallery(['a', 'b', 'c'], { randomCount: 2 })
		pageLoad()
		expect(mount).toHaveBeenCalled()
	})

	it('is idempotent — a second page-load does not re-populate or duplicate', () => {
		document.body.innerHTML = dynamicGallery(['a', 'b', 'c', 'd'], { randomCount: 2 })
		const gallery = document.querySelector('[data-gallery]')!
		pageLoad()
		const first = liveIds(gallery)
		pageLoad()
		expect(liveIds(gallery)).toEqual(first)
	})

	it('applies packed justified cell geometry to every materialized candidate', () => {
		document.body.innerHTML = dynamicGallery(['a', 'b', 'c', 'd'], {
			randomCount: 3,
			layout: 'justified',
		})
		const gallery = document.querySelector('[data-gallery]') as HTMLElement
		Object.defineProperty(gallery, 'clientWidth', { configurable: true, value: 680 })
		pageLoad()

		const cells = [
			...gallery.querySelectorAll<HTMLElement>('[data-gallery-live] .gallery__item'),
		]
		const live = gallery.querySelector<HTMLElement>('[data-gallery-live]')
		expect(live?.classList.contains('gallery__grid--justified-ready')).toBe(true)
		expect(live?.querySelectorAll('.gallery__row')).toHaveLength(2)
		expect(cells).toHaveLength(3)
		for (const cell of cells) {
			expect(cell.style.flex).toMatch(/^0 0 \d+(\.\d+)?px$/)
			expect(cell.style.height).toMatch(/^\d+(\.\d+)?px$/)
		}
	})

	it('clears desktop justified geometry for mobileFirstOnly at the mobile boundary', () => {
		document.body.innerHTML = dynamicGallery(['a', 'b', 'c'], {
			randomCount: 3,
			layout: 'justified',
			mobileFirstOnly: true,
		})
		const gallery = document.querySelector('[data-gallery]') as HTMLElement
		Object.defineProperty(gallery, 'clientWidth', { configurable: true, value: 480 })
		const template = gallery.querySelector<HTMLTemplateElement>(
			'template[data-gallery-candidates]',
		)!
		for (const cell of template.content.querySelectorAll<HTMLElement>('.gallery__item')) {
			cell.style.flex = '0 0 120px'
			cell.style.height = '80px'
		}
		pageLoad()

		const liveCells = [
			...gallery.querySelectorAll<HTMLElement>('[data-gallery-live] .gallery__item'),
		]
		const deferred = gallery.querySelector<HTMLTemplateElement>(
			'template[data-gallery-deferred]',
		)
		expect(liveCells).toHaveLength(1)
		expect(deferred?.content.querySelectorAll('.gallery__item')).toHaveLength(2)
		for (const cell of liveCells) {
			expect(cell.style.flex).toBe('')
			expect(cell.style.height).toBe('')
		}
	})
})

it('reads the current computed column gap on each resize measurement', () => {
	let resize: ResizeObserverCallback | undefined
	vi.stubGlobal(
		'ResizeObserver',
		class {
			constructor(callback: ResizeObserverCallback) {
				resize = callback
			}
			observe() {}
			disconnect() {}
		},
	)
	document.body.innerHTML = dynamicGallery(['a', 'b', 'c'], {
		randomCount: 3,
		layout: 'justified',
	})
	const gallery = document.querySelector<HTMLElement>('[data-gallery]')!
	const grid = gallery.querySelector<HTMLElement>('[data-gallery-live]')!
	Object.defineProperty(gallery, 'clientWidth', { configurable: true, value: 680 })
	pageLoad()
	const first = grid.querySelector<HTMLElement>('.gallery__item')!
	const originalWidth = Number.parseFloat(first.style.flexBasis)
	grid.style.columnGap = '28px'
	resize?.([], {} as ResizeObserver)
	expect(Number.parseFloat(first.style.flexBasis)).toBeLessThan(originalWidth)
	for (const row of grid.querySelectorAll<HTMLElement>('.gallery__row')) {
		const cells = [...row.querySelectorAll<HTMLElement>('.gallery__item')]
		const used =
			cells.reduce((sum, cell) => sum + Number.parseFloat(cell.style.flexBasis) + 2, 0) +
			(cells.length - 1) * 28
		expect(used).toBeLessThanOrEqual(680.01)
	}
	document.dispatchEvent(new Event('astro:before-swap'))
	vi.unstubAllGlobals()
})
