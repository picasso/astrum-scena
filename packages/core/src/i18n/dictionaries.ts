import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { z } from 'astro/zod'

import type { Locale } from '../config/locale-schema.ts'
import { assertSchemaVersion, SCHEMA_VERSION_KEY } from '../config/schema-version.ts'
import { readYaml, validate } from '../config/yaml-file.ts'
import type { CoursesUIKey } from '../modules/courses/manifest.ts'
import type { ModuleManifest } from '../modules/manifest.ts'
import { MODULES } from '../modules/registry.ts'
import en from './en.json' with { type: 'json' }
import ru from './ru.json' with { type: 'json' }
import {
	SITE_DICTIONARY_DIR,
	SITE_DICTIONARY_EXTENSION,
	siteDictionaryPath,
} from './site-dictionary-path.ts'

// the UI texts of a site: the core's full dictionary of each locale and those of the enabled modules,
// with the site's partial overrides from `src/i18n/<locale>.yaml` laid over them. A key no source gives
// fails the build for that locale; no locale ever borrows a text from another.

export type CoreUIKey = keyof typeof en
// a module's keys sit in its namespace (`courses.*`); `t` takes them all, and a build has the texts of
// the enabled modules only
export type UIKey = CoreUIKey | CoursesUIKey
export type Dictionary = Readonly<Record<UIKey, string>>
export type PartialDictionary = Readonly<Partial<Record<UIKey, string>>>

type Dictionaries = Readonly<Partial<Record<Locale, PartialDictionary>>>

// the English dictionary declares the core's key set; every other dictionary of the core has the same
// keys
export const UI_KEYS = Object.keys(en) as CoreUIKey[]

export const CORE_DICTIONARIES: Readonly<Record<Locale, PartialDictionary>> = { en, ru }

// a module's key set is every key of its dictionaries, so a key one locale lacks is reported missing
export const moduleKeys = (module: ModuleManifest): UIKey[] =>
	[
		...new Set(
			Object.values(module.i18n.dictionaries).flatMap((texts) => Object.keys(texts ?? {})),
		),
	].sort() as UIKey[]

// every key the given modules add to the core's
export const uiKeys = (modules: readonly ModuleManifest[]): UIKey[] => [
	...UI_KEYS,
	...modules.flatMap(moduleKeys),
]

// the core's dictionaries with those of the given modules, per locale
export const coreDictionaries = (modules: readonly ModuleManifest[]): Dictionaries =>
	Object.fromEntries(
		(Object.keys(CORE_DICTIONARIES) as Locale[]).map((locale) => [
			locale,
			Object.assign(
				{},
				CORE_DICTIONARIES[locale],
				...modules.map((module) => module.i18n.dictionaries[locale] ?? {}),
			) as PartialDictionary,
		]),
	)

// a text a reader can see: whitespace alone would render an empty label
const text = z.string().regex(/\S/, 'expected a non-blank text')

// the site may override the keys of the core and of the given modules
export const siteDictionarySchemaFor = (modules: readonly ModuleManifest[]) =>
	z.strictObject({
		schemaVersion: z.literal(1),
		...(Object.fromEntries(uiKeys(modules).map((key) => [key, text.optional()])) as Record<
			UIKey,
			z.ZodOptional<typeof text>
		>),
	})

// every key a site may write with all modules enabled: the `i18n` surface of the API snapshot
export const siteDictionarySchema = siteDictionarySchemaFor(MODULES)

// a key of a module the site has not enabled names the module rather than reading as a typo
const disabledModuleKeyErrors = (
	value: unknown,
	filePath: string,
	enabled: readonly ModuleManifest[],
): string[] => {
	if (value === null || typeof value !== 'object') return []
	const disabled = MODULES.filter((module) => !enabled.some(({ id }) => id === module.id))
	return Object.keys(value).flatMap((key) => {
		const owner = disabled.find((module) => key.startsWith(`${module.i18n.namespace}.`))
		return owner
			? [
					`${filePath}: ${key}: key of module "${owner.id}", which is not enabled in site.yaml (modules.${owner.id})`,
				]
			: []
	})
}

export const parseSiteDictionary = (
	value: unknown,
	filePath: string,
	modules: readonly ModuleManifest[] = MODULES,
): PartialDictionary => {
	const schema = siteDictionarySchemaFor(modules)
	assertSchemaVersion(value, filePath, schema)
	const disabled = disabledModuleKeyErrors(value, filePath, modules)
	if (disabled.length > 0) throw new Error(disabled.join('\n'))
	const texts: Record<string, unknown> = { ...validate(schema, value, filePath) }
	delete texts[SCHEMA_VERSION_KEY]
	return texts as PartialDictionary
}

export function mergeDictionaries(
	locales: readonly Locale[],
	site: Readonly<Partial<Record<Locale, PartialDictionary>>>,
	core: Dictionaries = CORE_DICTIONARIES,
	keys: readonly UIKey[] = UI_KEYS,
): Partial<Record<Locale, Dictionary>> {
	const merged = locales.map((locale) => {
		const dictionary = { ...core[locale], ...site[locale] }
		const missing = keys.filter((key) => !dictionary[key])
		return { locale, dictionary: dictionary as Dictionary, missing }
	})
	const errors = merged
		.filter(({ missing }) => missing.length > 0)
		.map(({ locale, missing }) => `i18n (${locale}): missing keys: ${missing.join(', ')}`)
	if (errors.length > 0) throw new Error(errors.join('\n'))
	return Object.fromEntries(merged.map(({ locale, dictionary }) => [locale, dictionary]))
}

// reads the site's dictionaries from the site root it is given: a locale without a file keeps the
// core's texts, and a file for a locale the config does not list is an error rather than dead text
export function loadDictionaries(
	root: string,
	locales: readonly Locale[],
	modules: readonly ModuleManifest[] = [],
): Partial<Record<Locale, Dictionary>> {
	const dir = path.resolve(root, SITE_DICTIONARY_DIR)
	// hidden files (`.DS_Store`) are the system's, not the site's
	const files = existsSync(dir) ? readdirSync(dir).filter((name) => !name.startsWith('.')) : []
	const expected = locales.map((locale) => `${locale}${SITE_DICTIONARY_EXTENSION}`)
	const stray = files.filter((name) => !expected.includes(name))
	if (stray.length > 0)
		throw new Error(
			stray
				.map(
					(name) =>
						`${SITE_DICTIONARY_DIR}/${name}: not a dictionary; expected ${locales.map(siteDictionaryPath).join(', ')} for content.locales (${locales.join(', ')})`,
				)
				.join('\n'),
		)
	const site = Object.fromEntries(
		locales
			.filter((locale) => files.includes(`${locale}${SITE_DICTIONARY_EXTENSION}`))
			.map((locale) => {
				const filePath = siteDictionaryPath(locale)
				return [locale, parseSiteDictionary(readYaml(root, filePath), filePath, modules)]
			}),
	)
	return mergeDictionaries(locales, site, coreDictionaries(modules), uiKeys(modules))
}
