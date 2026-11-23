import { describe, expect, it } from 'vitest'

import { seo, seoSchema } from './seo.ts'
import { site } from './site.ts'

const fixture = {
	description: { en: 'English description', ru: 'Русское описание' },
}

describe('SEO config', () => {
	it("accepts the demo site's config and holds only the consumed keys", () => {
		expect(seoSchema.safeParse(seo).success).toBe(true)
		expect(Object.keys(seo).every((key) => ['description', 'socialImage'].includes(key))).toBe(
			true,
		)
		for (const locale of site.content.locales) expect(seo.description).toHaveProperty(locale)
	})

	it('rejects unknown keys, blank text and nonpublic social images', () => {
		expect(seoSchema.safeParse({ ...fixture, unknown: true }).success).toBe(false)
		expect(
			seoSchema.safeParse({ ...fixture, description: { en: ' ', ru: 'Русское описание' } })
				.success,
		).toBe(false)
		expect(
			seoSchema.safeParse({ ...fixture, socialImage: 'https://example.com/a.jpg' }).success,
		).toBe(false)
		expect(seoSchema.safeParse({ ...fixture, socialImage: '/../a.jpg' }).success).toBe(false)
		expect(seoSchema.safeParse({ ...fixture, socialImage: '/social/cover.jpg' }).success).toBe(
			true,
		)
	})
})
