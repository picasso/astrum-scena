import type { Page } from '@playwright/test'

import { photoIdOfImage } from './content.ts'

// the PhotoSwipe surfaces shared by the viewer spec and its visual baseline

export const caption = (page: Page) => page.locator('.pswp .pswp__caption__center')

// the active slide shows a loaded, visible image of the photo (not the thumbnail placeholder) fetched
// from the image base
export function viewerShowsImageOf(page: Page, photoId: string): Promise<boolean> {
	return page
		.locator(
			'.pswp .pswp__item[aria-hidden="false"] img.pswp__img:not(.pswp__img--placeholder)',
		)
		.evaluateAll((images) =>
			images.map((node) => {
				const image = node as HTMLImageElement
				const box = image.getBoundingClientRect()
				const style = getComputedStyle(image)
				return {
					src: image.currentSrc || image.src,
					loaded: image.complete && image.naturalWidth > 0,
					visible:
						box.width > 0 &&
						box.height > 0 &&
						style.visibility !== 'hidden' &&
						style.display !== 'none' &&
						Number(style.opacity) > 0,
				}
			}),
		)
		.then(
			(images) =>
				images.length > 0 &&
				images.every(
					(image) =>
						image.loaded && image.visible && photoIdOfImage(image.src) === photoId,
				),
		)
}
