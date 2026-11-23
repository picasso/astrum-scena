// the contract of a site's logo file: every element right under the root `<svg>` that has an `id` is
// a layer, drawn by `<use href="<file>#<id>">` in document order, and the root's `viewBox` frames them.
// A layer keeps `fill="currentColor"` to follow the theme or a fixed fill of its own.

export type LogoLayers = { viewBox: string; ids: string[] }

const NOT_MARKUP = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>/g
const TAG =
	/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g

const attribute = (attributes: string, name: string): string | undefined => {
	const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attributes)
	return match ? (match[1] ?? match[2]) : undefined
}

export function logoLayers(svg: string, file: string): LogoLayers {
	let depth = 0
	let viewBox: string | undefined
	let rooted = false
	const ids: string[] = []
	for (const [, closing, name, attributes = '', selfClosing] of svg
		.replace(NOT_MARKUP, '')
		.matchAll(TAG)) {
		if (closing) {
			depth -= 1
			continue
		}
		if (depth === 0) {
			if (rooted || name !== 'svg')
				throw new Error(`${file}: the file must be one root <svg>`)
			rooted = true
			viewBox = attribute(attributes, 'viewBox')
		} else if (depth === 1) {
			const id = attribute(attributes, 'id')
			if (id) ids.push(id)
		}
		if (!selfClosing) depth += 1
	}
	if (!rooted) throw new Error(`${file}: the file must be one root <svg>`)
	if (!viewBox) throw new Error(`${file}: the root <svg> has no viewBox`)
	if (ids.length === 0)
		throw new Error(
			`${file}: no element right under the root <svg> has an id, so no layer draws`,
		)
	return { viewBox, ids }
}
