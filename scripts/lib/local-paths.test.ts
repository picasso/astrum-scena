import { describe, expect, it } from 'vitest'

import { findBinaryLocalPaths, findLocalPaths, isBinary, textFragments } from './local-paths.ts'

// samples are assembled from parts, so this file does not trip the gate it tests
const SLASH = '/'
const BACK = '\\'
const abs = (...parts: string[]) => `${SLASH}${parts.join(SLASH)}`
const escaped = (...parts: string[]) => `${BACK}${SLASH}${parts.join(`${BACK}${SLASH}`)}`
const tilde = (...parts: string[]) => ['~', ...parts].join(SLASH)
const windows = (separator: string, ...parts: string[]) => ['C:', ...parts].join(separator)

describe('findLocalPaths', () => {
	it('flags machine-specific absolute paths', () => {
		expect(findLocalPaths(`theme at \`${abs('Volumes', 'Disk', 'wp-content')}\``)).toEqual([
			abs('Volumes', 'Disk'),
		])
		expect(findLocalPaths(`see ${abs('Users', 'someone', 'notes.txt')}`)).toEqual([
			abs('Users', 'someone'),
		])
		expect(findLocalPaths(`home=${abs('home', 'runner', 'work')}`)).toEqual([
			abs('home', 'runner'),
		])
		expect(findLocalPaths(`tmp ${abs('private', 'tmp', 'x')}`)).toEqual([abs('private', 'tmp')])
		expect(findLocalPaths(`file:/${abs('Users', 'someone')}`)).toEqual([
			abs('Users', 'someone'),
		])
	})

	it('flags a home path but not a tool config dir or the bare prefix', () => {
		expect(findLocalPaths(`clone into ${tilde('Dropbox', 'Coding')}`)).toEqual([
			tilde('Dropbox'),
		])
		expect(findLocalPaths(`"${tilde('projects')}"`)).toEqual([tilde('projects')])
		expect(findLocalPaths(`see ${tilde('.claude', 'skills')}`)).toEqual([])
		expect(findLocalPaths(`cache ${tilde('.npm')} and ${tilde('_bmad')}`)).toEqual([])
		expect(findLocalPaths(`a home path like \`${tilde('')}\``)).toEqual([])
		expect(findLocalPaths(`https://host${SLASH}${tilde('docs')}`)).toEqual([])
		expect(findLocalPaths(`в ${tilde('Проекты', 'site')}`)).toEqual([tilde('Проекты')])
		const escapedTilde = `~${BACK}${SLASH}Dropbox${BACK}${SLASH}x`
		expect(findLocalPaths(`{"p":"${escapedTilde}"}`)).toEqual([`~${BACK}${SLASH}Dropbox`])
		expect(findLocalPaths(`{"p":"~${BACK}${SLASH}.claude"}`)).toEqual([])
	})

	it('flags Windows user paths with either separator, but not the synthetic user', () => {
		expect(findLocalPaths(`at ${windows(BACK, 'Users', 'someone', 'x')}`)).toEqual([
			windows(BACK, 'Users', 'someone'),
		])
		expect(findLocalPaths(`"${windows(BACK + BACK, 'Users', 'someone', 'x')}"`)).toEqual([
			windows(BACK + BACK, 'Users', 'someone'),
		])
		expect(findLocalPaths(`at ${windows(SLASH, 'Users', 'someone')}`)).toEqual([
			windows(SLASH, 'Users', 'someone'),
		])
		expect(findLocalPaths(`at ${windows(SLASH, 'users', 'someone')}`)).toEqual([
			windows(SLASH, 'users', 'someone'),
		])
		expect(findLocalPaths(`at ${windows(BACK, 'USERS', 'someone')}`)).toEqual([
			windows(BACK, 'USERS', 'someone'),
		])
		expect(findLocalPaths(`at ${windows(BACK, 'Users', 'example', 'x')}`)).toEqual([])
		expect(findLocalPaths(`at ${windows(SLASH, 'Users', 'example-real', 'x')}`)).toEqual([
			windows(SLASH, 'Users', 'example-real'),
		])
		expect(findLocalPaths(`at ${windows(BACK, 'Program Files', 'x')}`)).toEqual([])
	})

	it('flags JSON-escaped paths', () => {
		for (const root of ['Users', 'Volumes', 'home'])
			expect(findLocalPaths(`{"p":"${escaped(root, 'someone', 'x')}"}`)).toEqual([
				escaped(root, 'someone'),
			])
		expect(findLocalPaths(`{"p":"${escaped('Users', 'example', 'x')}"}`)).toEqual([])
	})

	it('flags Homebrew and macOS temp dirs, not lookalikes', () => {
		expect(findLocalPaths(`run ${abs('opt', 'homebrew', 'bin', 'node')}`)).toEqual([
			abs('opt', 'homebrew', 'bin'),
		])
		expect(findLocalPaths(`tmp ${abs('var', 'folders', 'xy', 'T')}`)).toEqual([
			abs('var', 'folders', 'xy'),
		])
		expect(
			findLocalPaths(`see ${abs('opt', 'local', 'bin')} and ${abs('var', 'log')}`),
		).toEqual([])
		expect(findLocalPaths(`https://example.com${abs('var', 'folders', 'x')}`)).toEqual([])
	})

	it('allows named roots, synthetic test paths and path-like fragments', () => {
		expect(findLocalPaths('see `$REFERENCE_SITE_ROOT/src/pages`')).toEqual([])
		expect(findLocalPaths(`'see ${abs('Users', 'example', 'secret')}'`)).toEqual([])
		expect(findLocalPaths(`'see ${abs('Users', 'example')}'`)).toEqual([])
		expect(findLocalPaths(`see ${abs('Users', 'example-real', 'x')}`)).toEqual([
			abs('Users', 'example-real'),
		])
		expect(findLocalPaths('see src/Volumes/notes for context')).toEqual([])
		expect(findLocalPaths('https://example.com/home/page and ./Users/x')).toEqual([])
	})

	it('allows placeholder components that only show the shape of a path', () => {
		for (const placeholder of ['…', '...', '<name>'])
			expect(findLocalPaths(`\`${abs('Volumes', placeholder, 'x')}\``), placeholder).toEqual(
				[],
			)
		expect(findLocalPaths(`at ${windows(BACK, 'Users', '<you>')}`)).toEqual([])
		expect(findLocalPaths(`tmp ${abs('var', 'folders', '…')}`)).toEqual([])
		expect(findLocalPaths(`see ${abs('Users', '...secret')}`)).toEqual([
			abs('Users', '...secret'),
		])
		expect(findLocalPaths(`see ${abs('Users', '…me')}`)).toEqual([abs('Users', '…me')])
	})
})

describe('isBinary', () => {
	it('treats a NUL byte as binary, whatever the size', () => {
		expect(isBinary(new Uint8Array([0x89, 0x50, 0x00, 0x47]))).toBe(true)
		const large = new TextEncoder().encode('x'.repeat(3 * 1024 * 1024))
		expect(isBinary(large)).toBe(false)
	})
})

describe('binary files', () => {
	const binary = (...parts: (string | number[])[]) =>
		Buffer.concat(
			parts.map((part) =>
				typeof part === 'string' ? Buffer.from(part, 'utf8') : Buffer.from(part),
			),
		)

	it('splits text at control bytes and invalid UTF-8', () => {
		expect(textFragments(binary('ab', [0x00, 0x01], 'cd', [0xff], 'e\tf'))).toEqual([
			'ab',
			'cd',
			'e\tf',
		])
	})

	it('finds a path between control bytes, with a non-ASCII user name too', () => {
		const ascii = abs('Users', 'someone', 'Pictures', 'master.tif')
		const cyrillic = abs('Users', 'Пётр', 'Фото')
		const file = binary([0x89, 0x50, 0x00], ascii, [0x00, 0x1f], 'x', [0x00], cyrillic, [0x00])
		expect(findBinaryLocalPaths(file)).toEqual([abs('Users', 'someone'), abs('Users', 'Пётр')])
		const windowsPath = windows(BACK, 'Users', 'someone', 'x')
		expect(findBinaryLocalPaths(binary([0x00], windowsPath, [0x00]))).toEqual([
			windows(BACK, 'Users', 'someone'),
		])
	})

	it('does not let a control byte join a path to its neighbour', () => {
		expect(findBinaryLocalPaths(binary('x', [0x00], abs('Users', 'someone')))).toEqual([
			abs('Users', 'someone'),
		])
		expect(findBinaryLocalPaths(binary(abs('Users'), [0x00], 'someone'))).toEqual([])
	})

	it('ignores a home prefix that compressed data spells by chance', () => {
		expect(findBinaryLocalPaths(binary([0x00, 0x91], tilde('Kq7'), [0x00]))).toEqual([])
		expect(findLocalPaths(tilde('Kq7'))).toEqual([tilde('Kq7')])
	})

	it('passes a binary without paths', () => {
		expect(
			findBinaryLocalPaths(binary([0x89, 0x50, 0x4e, 0x47, 0x00], 'IHDR', [0x00])),
		).toEqual([])
	})
})
