import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { parseFrontmatter } from 'astro/markdown'
import { describe, expect, it } from 'vitest'

import { LOCALE_FILE_PATTERN } from '../../config/locale-schema.ts'
import { siteRoot } from '../../config/site-root.ts'
import { parseLeadingFrontmatter } from './files.ts'
import {
	digestTranslationSource,
	normalizeTranslationSourceBody,
	resolveTranslationFreshness,
} from './translation-freshness.ts'

describe('normalizeTranslationSourceBody', () => {
	it('normalizes CRLF and CR to LF', () => {
		expect(normalizeTranslationSourceBody('a\r\nb\rc')).toBe('a\nb\nc')
	})

	it('trims leading and trailing whitespace', () => {
		expect(normalizeTranslationSourceBody('\n\n  body  \n\n')).toBe('body')
	})

	it('leaves an already-canonical body unchanged', () => {
		expect(normalizeTranslationSourceBody('one\ntwo')).toBe('one\ntwo')
	})
})

describe('digestTranslationSource', () => {
	it('is a lowercase 64-hex sha256', () => {
		expect(digestTranslationSource('hello')).toMatch(/^[0-9a-f]{64}$/)
		expect(digestTranslationSource('hello')).toBe(
			'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
		)
	})

	it('is invariant to line-ending and surrounding-whitespace differences', () => {
		expect(digestTranslationSource('a\r\nb')).toBe(digestTranslationSource('\n a\nb \n'))
	})

	it('changes when the meaningful body changes', () => {
		expect(digestTranslationSource('a\nb')).not.toBe(digestTranslationSource('a\nc'))
	})

	it('excludes the trailing errata :::note region from the digest', () => {
		const authored = 'Тело статьи.'
		const withErrata = `${authored}\n\n:::note{claim="prod-a:aaaaaaaa"}\nЧто-то устарело.\n:::`
		expect(digestTranslationSource(withErrata)).toBe(digestTranslationSource(authored))
	})

	it('changing only the errata note does not move the digest', () => {
		const base = 'Тело.\n\n:::note{claim="prod-a:aaaaaaaa"}\nПервая редакция.\n:::'
		const edited = 'Тело.\n\n:::note{claim="prod-a:aaaaaaaa"}\nДругая редакция ноты.\n:::'
		expect(digestTranslationSource(base)).toBe(digestTranslationSource(edited))
	})
})

describe('resolveTranslationFreshness', () => {
	const referenceBody = 'Тело опорного перевода.'
	const marker = digestTranslationSource(referenceBody)

	it('is current when the marker matches the current reference digest', () => {
		expect(resolveTranslationFreshness({ referenceBody, translationMarker: marker })).toEqual({
			status: 'current',
		})
	})

	it('needs review with missing-marker when the translation marker is absent', () => {
		expect(
			resolveTranslationFreshness({ referenceBody, translationMarker: undefined }),
		).toEqual({
			status: 'needs-review',
			reason: 'missing-marker',
		})
	})

	it('needs review with digest-mismatch when the marker is stale', () => {
		const stale = digestTranslationSource('Старое опорное тело.')
		expect(resolveTranslationFreshness({ referenceBody, translationMarker: stale })).toEqual({
			status: 'needs-review',
			reason: 'digest-mismatch',
		})
	})
})

// the main correctness risk is a false `needs review` from raw-file vs Astro loader body differences:
// the `/status/` resolver reads the reference body from Content Collections, while the marker writer
// reads the raw file. Astro's Markdown and MDX entry types derive `entry.body` through the public
// `parseFrontmatter`, so compare it with the repository parser for every document of the demo site.
// `getCollection` is avoided because it makes Vitest depend on a pre-existing `.astro/data-store.json`

const CONTENT_ROOT = path.join(siteRoot, 'src/content')
const COLLECTIONS = ['articles', 'pages'] as const

type BodyDigests = { astro: string; repository: string }

async function bodyDigestsByFile(collection: string): Promise<Map<string, BodyDigests>> {
	const directory = path.join(CONTENT_ROOT, collection)
	const files = (await readdir(directory, { recursive: true })).filter((name) =>
		/\.mdx?$/.test(name),
	)
	const digests = new Map<string, BodyDigests>()
	for (const name of files) {
		if (!LOCALE_FILE_PATTERN.test(path.basename(name)))
			throw new Error(`unexpected localized filename: ${name}`)
		const raw = await readFile(path.join(directory, name), 'utf8')
		digests.set(`${collection}/${name}`, {
			astro: digestTranslationSource(
				parseFrontmatter(raw, { frontmatter: 'empty-with-spaces' }).content.trim(),
			),
			repository: digestTranslationSource(parseLeadingFrontmatter(raw).body),
		})
	}
	return digests
}

describe('repository / Astro body parity', () => {
	it('digests every article and page identically across repository and Astro parsers', async () => {
		const corpus = new Map<string, BodyDigests>()
		for (const collection of COLLECTIONS) {
			const digests = await bodyDigestsByFile(collection)
			expect(digests.size, collection).toBeGreaterThan(0)
			for (const [file, digest] of digests) corpus.set(file, digest)
		}

		// both formats somewhere in the corpus, so MDX parity cannot become accidentally untested
		const extensions = new Set([...corpus.keys()].map((file) => path.extname(file).slice(1)))
		expect(extensions).toEqual(new Set(['md', 'mdx']))
		for (const [file, digest] of corpus) {
			expect(digest.astro, `Astro/repository digest parity for "${file}"`).toBe(
				digest.repository,
			)
		}
	})
})
