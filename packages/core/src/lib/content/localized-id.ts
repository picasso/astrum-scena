import { LOCALE_FILE_PATTERN } from '../../config/locale-schema.ts'

// the extension only picks the body format (directives vs MDX components), not a different document;
// the loader (`localized-glob.ts`) enforces translation-key × locale uniqueness since it sees all files

export function localizedDocumentId(entry: string): string {
	const filename = entry.split('/').at(-1)
	const match = LOCALE_FILE_PATTERN.exec(filename ?? '')
	if (!match) {
		throw new Error(
			`Localized content filename must match <translation-key>.<locale>.md or .mdx: "${entry}"`,
		)
	}
	return `${match[1]}-${match[2]}`
}
