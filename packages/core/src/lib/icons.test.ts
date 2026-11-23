import { describe, expect, it } from 'vitest'

import { requireIcon } from './icons.ts'

describe('requireIcon', () => {
	const icons = { 'icons/social/flickr.svg': '<svg>flickr</svg>' }

	it('resolves a configured icon by file name without a per-network map', () => {
		expect(requireIcon(icons, 'icons/social/', 'flickr', 'social[0].icon')).toBe(
			'<svg>flickr</svg>',
		)
	})

	it('fails with the icon name and the config key when the svg is missing', () => {
		expect(() => requireIcon(icons, 'icons/social/', 'rss', 'social[1].icon')).toThrow(
			/social\[1\]\.icon: icon "rss" not found \(expected icons\/social\/rss\.svg\)/,
		)
	})
})
