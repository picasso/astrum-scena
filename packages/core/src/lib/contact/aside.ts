import type { CONTACTS_ASIDE_RATIOS } from '../../config/site-schema.ts'

// `original` keeps the natural height; any other ratio is a cover crop around the photo focal point
export type ContactsAsideRatio = (typeof CONTACTS_ASIDE_RATIOS)[number]

const RATIO_ASPECT: Record<Exclude<ContactsAsideRatio, 'original'>, readonly [number, number]> = {
	'1:1': [1, 1],
	'4:5': [4, 5],
	'3:4': [3, 4],
	'2:3': [2, 3],
	'9:16': [9, 16],
}

export function contactsAsideFrameAspect(ratio: ContactsAsideRatio): string | undefined {
	if (ratio === 'original') return undefined
	const [width, height] = RATIO_ASPECT[ratio]
	return `${width} / ${height}`
}

// a frame narrower than the photo crops its sides, so the `<img>` renders wider than the column;
// `sizes` needs this factor or the browser picks a blurry candidate
export function contactsAsideCropScale(
	ratio: ContactsAsideRatio,
	photo: { width: number; height: number },
): number {
	if (ratio === 'original') return 1
	const [width, height] = RATIO_ASPECT[ratio]
	return Math.max(1, photo.width / photo.height / (width / height))
}
