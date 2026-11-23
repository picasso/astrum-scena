export type ThumbRect = {
	left: number
	top: number
	width: number
}

export type ThumbBorder = {
	left: number
	right: number
	top: number
}

export type ThumbBounds = {
	x: number
	y: number
	w: number
}

// PhotoSwipe must animate from the visible photograph, not from the border box around it.
export function contentBoxThumbBounds(rect: ThumbRect, border: ThumbBorder): ThumbBounds {
	return {
		x: rect.left + border.left,
		y: rect.top + border.top,
		w: Math.max(0, rect.width - border.left - border.right),
	}
}
