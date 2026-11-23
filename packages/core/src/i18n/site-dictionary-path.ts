// where a site keeps its dictionaries, apart from the core's own so the integration can watch them
// without loading them

export const SITE_DICTIONARY_DIR = 'src/i18n'
export const SITE_DICTIONARY_EXTENSION = '.yaml'
// the published name of the site's dictionary files, one per active locale
export const SITE_DICTIONARY_PATH = `${SITE_DICTIONARY_DIR}/<locale>${SITE_DICTIONARY_EXTENSION}`

export const siteDictionaryPath = (locale: string): string =>
	`${SITE_DICTIONARY_DIR}/${locale}${SITE_DICTIONARY_EXTENSION}`
