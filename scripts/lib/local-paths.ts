import { readFile } from 'node:fs/promises'

// absolute paths from an owner's machine must not reach the repository: outside directories are named
// roots from `.env.example` (`$REFERENCE_SITE_ROOT`, …) whose values live only in the gitignored `.env`.
// `example` is the allowed synthetic user name for tests. A prefix preceded by a word character, a dot
// or `$` is a fragment (`src/Volumes/notes`, `site.com/home/`), not a local path.
// `~/` (or JSON-escaped `~\/`) followed by a dot, `_` or anything but a letter or digit stays allowed:
// tool config dirs (`~/.claude`, `~/_bmad`) and prose that quotes the prefix alone are not
// machine-specific.

const NAME_CHAR = String.raw`[^\s\\/'"${'`'})]`
const NAME = `${NAME_CHAR}+`
// a slash, optionally JSON-escaped (`\/`)
const SLASH = String.raw`\\?/`
const BACKSLASHES = String.raw`\\{1,2}`
// only the whole `example` path component is exempt, not `example-real`; so is a placeholder component
// (`/Volumes/…`, `/Users/...`, `/Users/<name>`) that only shows the shape of a path
const NOT_EXAMPLE = `(?!example(?!${NAME_CHAR}))`
const NOT_PLACEHOLDER = `(?!(?:…|\\.\\.\\.)(?!${NAME_CHAR})|<)`
const ANY_NAME = `${NOT_EXAMPLE}${NOT_PLACEHOLDER}${NAME}`

const ABSOLUTE_PATHS = [
	String.raw`(?<![\w.$-])${SLASH}(?:Volumes|Users|home|private)${SLASH}${ANY_NAME}`,
	String.raw`(?<![\w.$-])${SLASH}(?:opt${SLASH}homebrew|var${SLASH}folders)${SLASH}${NOT_PLACEHOLDER}${NAME}`,
	String.raw`(?<!\w)[A-Za-z]:(?:${BACKSLASHES}|/)[Uu][Ss][Ee][Rr][Ss](?:${BACKSLASHES}|/)${ANY_NAME}`,
]
const HOME_PATH = String.raw`(?<![\w.$/~-])~${SLASH}[\p{L}\p{N}]${NAME_CHAR}*`

const LOCAL_PATH = new RegExp([...ABSOLUTE_PATHS, HOME_PATH].join('|'), 'gu')
// compressed image data spells `~/` and a letter by chance about three times per megabyte, so a binary
// file is searched for absolute paths only
const BINARY_LOCAL_PATH = new RegExp(ABSOLUTE_PATHS.join('|'), 'gu')

export function findLocalPaths(text: string): string[] {
	return [...text.matchAll(LOCAL_PATH)].map((match) => match[0])
}

// text of any size is scanned; a NUL byte marks a binary file
export const isBinary = (buffer: Uint8Array): boolean => buffer.includes(0)

const TAB = 0x09
const LINE_FEED = 0x0a
const CARRIAGE_RETURN = 0x0d
const DELETE = 0x7f
const REPLACEMENT = 0xfffd

// whitespace controls stay inside a fragment, where they already end a path
const isSeparator = (code: number): boolean =>
	(code < 0x20 && code !== TAB && code !== LINE_FEED && code !== CARRIAGE_RETURN) ||
	code === DELETE ||
	code === REPLACEMENT

// metadata strings (XMP, EXIF, PNG text chunks) sit between control bytes; bytes that are not valid
// UTF-8 decode to U+FFFD and split the text as well
export function textFragments(buffer: Uint8Array): string[] {
	const text = new TextDecoder('utf-8').decode(buffer)
	const fragments: string[] = []
	let start = 0
	for (let index = 0; index <= text.length; index += 1) {
		if (index < text.length && !isSeparator(text.charCodeAt(index))) continue
		if (index > start) fragments.push(text.slice(start, index))
		start = index + 1
	}
	return fragments
}

export function findBinaryLocalPaths(buffer: Uint8Array): string[] {
	return textFragments(buffer).flatMap((fragment) =>
		[...fragment.matchAll(BINARY_LOCAL_PATH)].map((match) => match[0]),
	)
}

// a file deleted in the working tree, or a symlink to a directory, has nothing to scan; any other read
// error fails the gate, so an unreadable file cannot pass unscanned
export async function readScannedFile(file: string): Promise<Buffer | null> {
	return readFile(file).catch((error: NodeJS.ErrnoException) => {
		if (error.code === 'ENOENT' || error.code === 'EISDIR') return null
		throw error
	})
}
