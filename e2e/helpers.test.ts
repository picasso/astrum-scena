import { describe, expect, it } from 'vitest'

import { demoConfig, perLocale, siteData, textFor } from './helpers.ts'

const { locales, referenceLocale } = demoConfig.content
const other = locales.find((locale) => locale !== referenceLocale)

describe('siteData', () => {
	it('labels every menu item and the title in every active locale of the demo', () => {
		const data = siteData(demoConfig)
		expect(data.navRoutes.map((route) => route.segment)).toEqual(
			demoConfig.menu.items.map((item) => item.segment),
		)
		for (const texts of [data.siteTitle, ...data.navRoutes.map((route) => route.labels)])
			expect(Object.keys(texts)).toEqual([...locales])
	})

	it('gives no text for a locale the config does not hold', () => {
		expect(other, 'the demo has a second locale to drop').toBeDefined()
		const oneLocale = siteData({
			...demoConfig,
			content: { ...demoConfig.content, locales: [referenceLocale] },
		})
		expect(oneLocale.locales).toEqual([referenceLocale])
		for (const texts of [oneLocale.siteTitle, ...oneLocale.navRoutes.map((r) => r.labels)]) {
			expect(Object.keys(texts)).toEqual([referenceLocale])
			expect(() => textFor(texts, other!)).toThrow(`no "${other}" text`)
			expect(textFor(texts, referenceLocale)).not.toBe('')
		}
	})
})

describe('perLocale', () => {
	it('maps only the given locales', () => {
		expect(perLocale([referenceLocale], (lang) => `/${lang}/`)).toEqual({
			[referenceLocale]: `/${referenceLocale}/`,
		})
	})
})
