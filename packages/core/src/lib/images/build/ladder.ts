import type { ImageConfig } from './config.ts'

export type LadderPlan = {
	widths: number[]
	warnings: string[]
}

// widths never exceed the source or the long-side cap; with `native` the capped source width joins
// the ladder, and a source smaller than every rung still gets one 1:1 file
export function planLadderWidths(
	config: Pick<ImageConfig, 'ladder' | 'watermark'>,
	sourceWidth: number,
	sourceHeight: number,
): LadderPlan {
	if (
		!Number.isSafeInteger(sourceWidth) ||
		!Number.isSafeInteger(sourceHeight) ||
		sourceWidth < 1 ||
		sourceHeight < 1
	) {
		throw new Error('source dimensions must be positive integers')
	}
	const { widths, native } = config.ladder
	const cap = Math.floor((native.maxLongSide * sourceWidth) / Math.max(sourceWidth, sourceHeight))
	if (cap < 1) throw new Error('long-side cap produces a zero-width derivative')
	const top = Math.min(sourceWidth, cap)
	const selected = new Set(widths.filter((width) => width <= top))
	if (native.enabled || selected.size === 0) selected.add(top)
	const planned = [...selected].sort((left, right) => left - right)
	const warnings: string[] = []
	if (top < widths[widths.length - 1]!) {
		const reason = top < sourceWidth ? 'long-side-cap' : 'small-source'
		warnings.push(`${reason}: ladder capped to ${top}px (source ${sourceWidth}px)`)
	}
	if (planned.every((width) => width <= config.watermark.aboveWidth)) {
		warnings.push('no-watermarked-file: no derivative exceeds the watermark threshold')
	}
	return { widths: planned, warnings }
}
