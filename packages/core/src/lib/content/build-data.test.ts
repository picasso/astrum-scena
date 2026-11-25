import { afterEach, describe, expect, it, vi } from 'vitest'

import { contentConfig } from '../../config/fixtures/site-config.ts'
import type { ContentSiteConfig } from './build-data.ts'

// the loaders read Tier-1 fields from the reference locale passed in the config, so `unlisted` lives
// only on the EN entries here and an `en` reference must find it
const page = (translationKey: string, locale: 'en' | 'ru', tier1: { unlisted?: boolean } = {}) => ({
	id: `${translationKey}.${locale}`,
	data: {
		translationKey,
		locale,
		slug: translationKey,
		title: translationKey,
		status: 'published',
		...tier1,
	},
})

const pages = [
	page('hidden', 'en', { unlisted: true }),
	page('hidden', 'ru'),
	page('about', 'en'),
	page('about', 'ru'),
	page('home', 'en'),
	page('home', 'ru'),
]

const config: ContentSiteConfig = {
	content: contentConfig(['en', 'ru'], 'en'),
}

async function loadModule() {
	vi.resetModules()
	vi.doMock('astro:content', () => ({
		getCollection: (name: string) => Promise.resolve(name === 'pages' ? pages : []),
	}))
	return import('./build-data.ts')
}

afterEach(() => {
	vi.doUnmock('astro:content')
})

const slugs = (documents: readonly { slug: string }[]) => documents.map(({ slug }) => slug)

describe('content loaders with an injected reference locale', () => {
	it('gives every published page but home a flat route', async () => {
		const { loadPublishedPages, pageStaticPaths } = await loadModule()
		expect(slugs(await loadPublishedPages(config))).toEqual(['about', 'hidden'])
		expect(await pageStaticPaths(config)).toEqual([
			{ params: { slug: 'about' } },
			{ params: { slug: 'hidden' } },
		])
	})

	it('reads unlisted from the reference locale for every locale of the document', async () => {
		const { isUnlistedDocument } = await loadModule()
		expect(await isUnlistedDocument('page', 'hidden', config)).toBe(true)
		expect(await isUnlistedDocument('page', 'about', config)).toBe(false)
		await expect(isUnlistedDocument('page', 'home', config)).rejects.toThrow(
			'no published page',
		)
	})
})
