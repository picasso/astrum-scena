// where each content collection's loader reads, relative to the site root (Astro resolves the base
// against it); the API snapshot keys the collection schemas by the same paths
export const DATA_ENTRY_PATTERN = '**/*.{yaml,yml}'
export const LOCALIZED_DOCUMENT_PATTERN = '**/*.{md,mdx}'

export const COLLECTION_SOURCES = {
	albums: { base: './src/content/albums', pattern: DATA_ENTRY_PATTERN },
	articles: { base: './src/content/articles', pattern: LOCALIZED_DOCUMENT_PATTERN },
	legal: { base: './src/content/legal', pattern: LOCALIZED_DOCUMENT_PATTERN },
	pages: { base: './src/content/pages', pattern: LOCALIZED_DOCUMENT_PATTERN },
	photos: { base: './src/content/photos', pattern: DATA_ENTRY_PATTERN },
} as const
