import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'

import { type Locale, SUPPORTED_LOCALES } from '../config/locale-schema.ts'
import { site } from '../config/site.ts'
import { siteRoot } from '../config/site-root.ts'
import { coursesModule } from '../modules/courses/manifest.ts'
import {
	CORE_DICTIONARIES,
	coreDictionaries,
	loadDictionaries,
	mergeDictionaries,
	moduleKeys,
	type PartialDictionary,
	UI_KEYS,
	type UIKey,
	uiKeys,
} from './dictionaries.ts'
import { siteDictionaryPath } from './site-dictionary-path.ts'

// the fixtures name the two catalog locales
const en: Locale = 'en'
const ru: Locale = 'ru'

const roots: string[] = []

const makeRoot = (files: Record<string, unknown> = {}): string => {
	const root = mkdtempSync(path.join(tmpdir(), 'i18n-dictionaries-'))
	roots.push(root)
	for (const [relativePath, content] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true })
		writeFileSync(
			path.join(root, relativePath),
			typeof content === 'string' ? content : stringify(content),
		)
	}
	return root
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('core dictionaries', () => {
	it('give every catalog locale the full key set and nothing else', () => {
		for (const locale of SUPPORTED_LOCALES) {
			const dictionary = CORE_DICTIONARIES[locale]
			expect(Object.keys(dictionary).sort(), locale).toEqual([...UI_KEYS].sort())
			for (const key of UI_KEYS) expect(dictionary[key], `${locale}: ${key}`).toBeTruthy()
		}
	})
})

describe('the demo dictionaries', () => {
	it('are complete for every locale of its content.locales', () => {
		const dictionaries = loadDictionaries(siteRoot, site.content.locales)
		for (const locale of site.content.locales)
			for (const key of UI_KEYS)
				expect(dictionaries[locale]?.[key], `${locale}: ${key}`).toBeTruthy()
	})
})

describe('loadDictionaries', () => {
	it('gives the core texts when the site has no dictionaries', () => {
		const dictionaries = loadDictionaries(makeRoot(), [en, ru])
		expect(dictionaries[en]).toEqual(CORE_DICTIONARIES[en])
		expect(dictionaries[ru]).toEqual(CORE_DICTIONARIES[ru])
	})

	it('lays a partial site dictionary over the core one of its locale only', () => {
		const root = makeRoot({
			[siteDictionaryPath(en)]: { schemaVersion: 1, 'footer.quote': 'A site quote.' },
		})
		const dictionaries = loadDictionaries(root, [en, ru])
		expect(dictionaries[en]).toEqual({
			...CORE_DICTIONARIES[en],
			'footer.quote': 'A site quote.',
		})
		expect(dictionaries[ru]).toEqual(CORE_DICTIONARIES[ru])
	})

	it('names the file and the key path of an unknown key', () => {
		const root = makeRoot({
			[siteDictionaryPath(en)]: { schemaVersion: 1, 'nav.hom': 'Home' },
		})
		expect(() => loadDictionaries(root, [en, ru])).toThrow(
			`${siteDictionaryPath(en)}: nav.hom: unrecognized key`,
		)
	})

	it.each(['', ' \n\t'])('rejects a blank text %j', (blank) => {
		const root = makeRoot({
			[siteDictionaryPath(en)]: { schemaVersion: 1, 'footer.quote': blank },
		})
		expect(() => loadDictionaries(root, [en])).toThrow(
			`${siteDictionaryPath(en)}: footer.quote:`,
		)
	})

	it('rejects a dictionary for a locale outside content.locales, with the config locales', () => {
		const root = makeRoot({ [siteDictionaryPath(ru)]: { schemaVersion: 1 } })
		expect(() => loadDictionaries(root, [en])).toThrow(
			`${siteDictionaryPath(ru)}: not a dictionary; expected ${siteDictionaryPath(en)} for content.locales (${en})`,
		)
	})

	it('rejects any other entry of the dictionary directory, naming the expected files', () => {
		const root = makeRoot({ 'src/i18n/en.yml': { schemaVersion: 1 } })
		expect(() => loadDictionaries(root, [en, ru])).toThrow(
			`src/i18n/en.yml: not a dictionary; expected ${siteDictionaryPath(en)}, ${siteDictionaryPath(ru)} for content.locales (${en}, ${ru})`,
		)
	})

	it('ignores hidden files of the dictionary directory', () => {
		const root = makeRoot({ 'src/i18n/.DS_Store': 'binary' })
		expect(loadDictionaries(root, [en])[en]).toEqual(CORE_DICTIONARIES[en])
	})

	it('rejects a file without schemaVersion, with the supported versions', () => {
		const root = makeRoot({ [siteDictionaryPath(en)]: { 'footer.quote': 'A site quote.' } })
		expect(() => loadDictionaries(root, [en])).toThrow(
			`${siteDictionaryPath(en)}: missing schemaVersion; supported: 1`,
		)
	})

	it('rejects an unsupported schemaVersion', () => {
		const root = makeRoot({ [siteDictionaryPath(en)]: { schemaVersion: 2 } })
		expect(() => loadDictionaries(root, [en])).toThrow(
			`${siteDictionaryPath(en)}: schemaVersion 2 is not supported; supported: 1`,
		)
	})
})

describe('mergeDictionaries', () => {
	const without = (dictionary: PartialDictionary, ...keys: UIKey[]): PartialDictionary =>
		Object.fromEntries(
			Object.entries(dictionary).filter(([key]) => !keys.includes(key as UIKey)),
		)

	it('fails a locale missing a key in the core and the site, without borrowing another locale', () => {
		const core = {
			[en]: CORE_DICTIONARIES[en],
			[ru]: without(CORE_DICTIONARIES[ru], 'footer.quote', 'contacts.intro'),
		}
		const missing = UI_KEYS.filter((key) => key === 'footer.quote' || key === 'contacts.intro')
		expect(() => mergeDictionaries([en, ru], {}, core)).toThrow(
			`i18n (${ru}): missing keys: ${missing.join(', ')}`,
		)
	})

	it('takes a key the core lacks from the site dictionary', () => {
		const core = { [ru]: without(CORE_DICTIONARIES[ru], 'footer.quote') }
		const merged = mergeDictionaries([ru], { [ru]: { 'footer.quote': 'Цитата сайта.' } }, core)
		expect(merged[ru]?.['footer.quote']).toBe('Цитата сайта.')
	})

	it('builds only the given locales', () => {
		expect(Object.keys(mergeDictionaries([en], {}))).toEqual([en])
	})
})

describe('module dictionaries', () => {
	const MODULE_KEYS = moduleKeys(coursesModule)

	it("give every catalog locale the module's full key set, in its namespace", () => {
		expect(MODULE_KEYS.length).toBeGreaterThan(0)
		for (const key of MODULE_KEYS) expect(key.startsWith('courses.')).toBe(true)
		for (const locale of SUPPORTED_LOCALES) {
			const dictionary = coursesModule.i18n.dictionaries[locale] ?? {}
			expect(Object.keys(dictionary).sort(), locale).toEqual(MODULE_KEYS)
		}
	})

	it('add the texts of an enabled module, which the demo has', () => {
		const dictionaries = loadDictionaries(siteRoot, site.content.locales, [coursesModule])
		for (const locale of site.content.locales)
			for (const key of uiKeys([coursesModule]))
				expect(dictionaries[locale]?.[key], `${locale}: ${key}`).toBeTruthy()
		expect(loadDictionaries(makeRoot(), [en], [])[en]).not.toHaveProperty('courses.title')
	})

	it('fail a locale whose module dictionary lacks a key, without borrowing another locale', () => {
		const core = {
			...coreDictionaries([coursesModule]),
			[ru]: { ...coreDictionaries([coursesModule])[ru], 'courses.title': '' },
		}
		expect(() => mergeDictionaries([en, ru], {}, core, uiKeys([coursesModule]))).toThrow(
			`i18n (${ru}): missing keys: courses.title`,
		)
	})

	it("let the site override an enabled module's key", () => {
		const root = makeRoot({
			[siteDictionaryPath(en)]: { schemaVersion: 1, 'courses.title': 'Workshops' },
		})
		expect(loadDictionaries(root, [en], [coursesModule])[en]?.['courses.title']).toBe(
			'Workshops',
		)
	})

	it('reject a key of a module the site has not enabled, naming the module', () => {
		const root = makeRoot({
			[siteDictionaryPath(en)]: { schemaVersion: 1, 'courses.title': 'Workshops' },
		})
		expect(() => loadDictionaries(root, [en], [])).toThrow(
			`${siteDictionaryPath(en)}: courses.title: key of module "courses", which is not enabled in site.yaml (modules.courses)`,
		)
	})

	it('reject the keys the courses module took over from the core', () => {
		const root = makeRoot({
			[siteDictionaryPath(en)]: { schemaVersion: 1, 'course.status.archive': 'Past' },
		})
		expect(() => loadDictionaries(root, [en], [coursesModule])).toThrow(
			`${siteDictionaryPath(en)}: course.status.archive: unrecognized key`,
		)
	})
})
