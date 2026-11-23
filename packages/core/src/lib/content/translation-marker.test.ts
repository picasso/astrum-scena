import { format } from 'prettier'
import { describe, expect, it } from 'vitest'

import { digestTranslationSource } from './translation-freshness.ts'
import {
	buildDocumentPairs,
	confirmTranslatedFromDigest,
	pairSourceDigest,
	parseDocumentFile,
} from './translation-marker.ts'

const HEX = 'a'.repeat(64)
const BILINGUAL = { locales: ['en', 'ru'], referenceLocale: 'ru' } as const

const course = (fields: string) =>
	`---\ntranslationKey: night\nlocale: ru\nslug: night\ntitle: Ночь\nstatus: draft\n${fields}---\n\nТело.\n`

const enArticle = (key: string, extra = ''): string =>
	`---\ntranslationKey: ${key}\nlocale: en\nslug: ${key}\ntitle: Title\nstatus: draft\n${extra}---\n\nEnglish body about ${key}.\n`

const ruArticle = (key: string, body = `Русское тело про ${key}.`): string =>
	`---\ntranslationKey: ${key}\nlocale: ru\nslug: ${key}\ntitle: Заголовок\nstatus: draft\n---\n\n${body}\n`

describe('parseDocumentFile', () => {
	it("reads a course with the courses module's schema", () => {
		const file = parseDocumentFile({
			collection: 'courses',
			filename: 'night.ru.md',
			raw: course('courseStatus: current\n'),
		})
		expect(file.collection).toBe('courses')
		expect(file.data).toMatchObject({ translationKey: 'night', courseStatus: 'current' })
	})

	it('rejects a course status in a page', () => {
		expect(() =>
			parseDocumentFile({
				collection: 'pages',
				filename: 'night.ru.md',
				raw: course('courseStatus: current\n'),
			}),
		).toThrow(/courseStatus/)
	})

	it('reads translationKey/locale/body and detects an existing marker', () => {
		const file = parseDocumentFile({
			collection: 'articles',
			filename: 'anime.en.md',
			raw: enArticle('anime', `translatedFromDigest: ${HEX}\n`),
		})
		expect(file.translationKey).toBe('anime')
		expect(file.locale).toBe('en')
		expect(file.marker).toBe(HEX)
		expect(file.body).toBe('\nEnglish body about anime.\n')
	})

	it('fails closed when frontmatter disagrees with the filename', () => {
		expect(() =>
			parseDocumentFile({
				collection: 'articles',
				filename: 'anime.ru.md',
				raw: enArticle('anime'),
			}),
		).toThrow(/does not match filename/)
	})
})

describe('buildDocumentPairs', () => {
	const files = [
		parseDocumentFile({ collection: 'articles', filename: 'a.en.md', raw: enArticle('a') }),
		parseDocumentFile({ collection: 'articles', filename: 'a.ru.md', raw: ruArticle('a') }),
	]

	it('pairs the reference locale with its translation by translationKey', () => {
		const pairs = buildDocumentPairs(files, BILINGUAL)
		expect(pairs).toHaveLength(1)
		expect(pairs[0]!.reference.locale).toBe('ru')
		expect(pairs[0]!.translation.locale).toBe('en')
	})

	it('follows the configured reference locale', () => {
		const [pair] = buildDocumentPairs(files, { locales: ['en', 'ru'], referenceLocale: 'en' })
		expect(pair!.reference.locale).toBe('en')
		expect(pair!.translation.locale).toBe('ru')
	})

	it('has nothing to pair on a one-locale site', () => {
		expect(buildDocumentPairs([files[1]!], { locales: ['ru'], referenceLocale: 'ru' })).toEqual(
			[],
		)
		expect(buildDocumentPairs([files[0]!], { locales: ['en'], referenceLocale: 'en' })).toEqual(
			[],
		)
	})

	it('fails closed on a locale the site does not use', () => {
		expect(() => buildDocumentPairs(files, { locales: ['ru'], referenceLocale: 'ru' })).toThrow(
			/inactive locale "en"/,
		)
	})

	it('fails closed on a missing locale of a published document', () => {
		const published = parseDocumentFile({
			collection: 'articles',
			filename: 'a.en.md',
			raw: enArticle('a').replace('status: draft', 'status: published'),
		})
		expect(() => buildDocumentPairs([published], BILINGUAL)).toThrow(/missing the "ru" locale/)
	})

	// as the content gate, which requires every locale of a published document only
	it('leaves the missing locales of a draft out of its pairs', () => {
		expect(buildDocumentPairs([files[0]!], BILINGUAL)).toEqual([])
		expect(buildDocumentPairs([files[1]!], BILINGUAL)).toEqual([])
	})

	it('fails closed on a duplicate locale', () => {
		expect(() => buildDocumentPairs([files[0]!, files[0]!], BILINGUAL)).toThrow(
			/duplicate locale "en"/,
		)
	})

	it('rejects a marker on the reference-locale document', () => {
		const marked = parseDocumentFile({
			collection: 'articles',
			filename: 'a.ru.md',
			raw: ruArticle('a').replace('---\n\n', `translatedFromDigest: ${HEX}\n---\n\n`),
		})
		expect(() => buildDocumentPairs([files[0]!, marked], BILINGUAL)).toThrow(
			/not allowed on the reference locale "ru"/,
		)
	})
})

describe('pairSourceDigest', () => {
	it('digests the current reference body via the shared helper', () => {
		const pairs = buildDocumentPairs(
			[
				parseDocumentFile({
					collection: 'articles',
					filename: 'a.en.md',
					raw: enArticle('a'),
				}),
				parseDocumentFile({
					collection: 'articles',
					filename: 'a.ru.md',
					raw: ruArticle('a'),
				}),
			],
			BILINGUAL,
		)
		expect(pairSourceDigest(pairs[0]!)).toBe(digestTranslationSource('Русское тело про a.\n'))
	})
})

describe('confirmTranslatedFromDigest', () => {
	it('replaces a stale marker without changing the body or other fields', async () => {
		const stale = 'b'.repeat(64)
		const raw = await format(enArticle('a', `translatedFromDigest: ${stale}\n`), {
			filepath: 'a.en.md',
		})
		const confirmed = await format(confirmTranslatedFromDigest(raw, HEX), {
			filepath: 'a.en.md',
		})
		const parsed = parseDocumentFile({
			collection: 'articles',
			filename: 'a.en.md',
			raw: confirmed,
		})
		expect(parsed.marker).toBe(HEX)
		expect(parsed.data.title).toBe('Title')
		expect(parsed.body).toBe('\nEnglish body about a.\n')
		expect(confirmed).not.toContain(stale)
	})

	it('returns the original bytes when the marker is already current', () => {
		const raw = enArticle('a', `translatedFromDigest: ${HEX}\n`)
		expect(confirmTranslatedFromDigest(raw, HEX)).toBe(raw)
	})

	it('inserts the first marker as a one-line diff after prettier, body untouched', async () => {
		const clean = await format(enArticle('a'), { filepath: 'a.en.md' })
		const confirmed = await format(confirmTranslatedFromDigest(clean, HEX), {
			filepath: 'a.en.md',
		})
		const before = clean.split('\n')
		const added = confirmed.split('\n').filter((line) => !before.includes(line))
		expect(added).toEqual([`translatedFromDigest: ${HEX}`])
		const bodyOf = (text: string) => text.slice(text.indexOf('\n---\n', 4) + 5)
		expect(bodyOf(confirmed)).toBe(bodyOf(clean))
	})

	it('rejects a malformed digest', () => {
		expect(() => confirmTranslatedFromDigest(enArticle('a'), 'nope')).toThrow(/64-hex/)
	})
})
