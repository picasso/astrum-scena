import { describe, expect, it } from 'vitest'

import { logoLayers } from './logo-layers.ts'

const FILE = 'src/assets/brand/brand-logo.svg'

describe('logoLayers', () => {
	it('takes every top-level id as a layer, in document order, with the root viewBox', () => {
		const svg = `<?xml version="1.0"?>
<!-- <g id="commented"/> -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 4">
	<g id="second-in-name" fill="currentColor"><path id="nested" d="M0 0h1"/></g>
	<path id='first-in-name' d="M1 1h1" />
	<g><rect id="nested-too" width="1" height="1"/></g>
</svg>`
		expect(logoLayers(svg, FILE)).toEqual({
			viewBox: '0 0 10 4',
			ids: ['second-in-name', 'first-in-name'],
		})
	})

	it('names the file when the root has no viewBox, no layer or is not one <svg>', () => {
		expect(() => logoLayers('<svg><g id="a"/></svg>', FILE)).toThrow(
			`${FILE}: the root <svg> has no viewBox`,
		)
		expect(() => logoLayers('<svg viewBox="0 0 1 1"><g><g id="a"/></g></svg>', FILE)).toThrow(
			`${FILE}: no element right under the root <svg> has an id`,
		)
		expect(() => logoLayers('<g id="a"/>', FILE)).toThrow(
			`${FILE}: the file must be one root <svg>`,
		)
		expect(() => logoLayers('<svg viewBox="0 0 1 1"><g id="a"/></svg><svg/>', FILE)).toThrow(
			`${FILE}: the file must be one root <svg>`,
		)
		expect(() => logoLayers('', FILE)).toThrow(`${FILE}: the file must be one root <svg>`)
	})
})
