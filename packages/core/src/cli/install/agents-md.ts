import { stampText } from './bundle.ts'

// the block of the site's AGENTS.md that `astrum-scena install` owns: the rules every site of the core
// shares, between two markers, with the version stamp of the core. The text outside the markers is the
// site's and is never touched

export const AGENTS_FILE = 'AGENTS.md'
export const BLOCK_BEGIN = '<!-- astrum-scena:begin -->'
export const BLOCK_END = '<!-- astrum-scena:end -->'

export const renderBlock = (text: string, version: string): string =>
	`${BLOCK_BEGIN}\n<!-- ${stampText(version)} -->\n\n${text.trim()}\n\n${BLOCK_END}`

const occurrences = (text: string, marker: string): number[] => {
	const found: number[] = []
	for (let at = text.indexOf(marker); at !== -1; at = text.indexOf(marker, at + 1)) found.push(at)
	return found
}

// the file with the block replaced, or appended when it has none; a missing or empty file becomes the block
export function withBlock(current: string | undefined, block: string): string {
	if (current === undefined || current === '') return `${block}\n`
	const begins = occurrences(current, BLOCK_BEGIN)
	const ends = occurrences(current, BLOCK_END)
	if (begins.length === 0 && ends.length === 0) {
		const separator = current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n'
		return `${current}${separator}${block}\n`
	}
	if (begins.length !== 1 || ends.length !== 1 || begins[0]! > ends[0]!)
		throw new Error(
			`${AGENTS_FILE}: expected one ${BLOCK_BEGIN} … ${BLOCK_END} block, found ${begins.length} begin and ${ends.length} end markers`,
		)
	return `${current.slice(0, begins[0])}${block}${current.slice(ends[0]! + BLOCK_END.length)}`
}
