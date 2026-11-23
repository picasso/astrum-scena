import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { coursesModule } from '../../modules/courses/manifest.ts'
import { loadDocumentFiles } from './documents.ts'

const document = (key: string, locale: string, extra = '') =>
	`---\ntranslationKey: ${key}\nlocale: ${locale}\nslug: ${key}\ntitle: Title\nstatus: draft\n${extra}---\n\nBody.\n`

const scratch = mkdtempSync(path.join(tmpdir(), 'astrum-scena-documents-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let sites = 0
function makeRoot(files: Record<string, string>): string {
	const root = path.join(scratch, `site-${++sites}`)
	for (const [relative, raw] of Object.entries(files)) {
		const file = path.join(root, 'src/content', relative)
		mkdirSync(path.dirname(file), { recursive: true })
		writeFileSync(file, raw)
	}
	return root
}

const listed = (files: Awaited<ReturnType<typeof loadDocumentFiles>>['files']) =>
	files.map((file) => [file.collection, file.translationKey, file.locale])

describe('loadDocumentFiles', () => {
	it('lists articles, pages and nested files with the source as the collection', async () => {
		const root = makeRoot({
			'articles/a.en.md': document('a', 'en'),
			'pages/b.ru.mdx': document('b', 'ru'),
			'pages/nested/c.en.md': document('c', 'en'),
		})
		const { files, pathOf } = await loadDocumentFiles(root, [])
		expect(listed(files)).toEqual([
			['articles', 'a', 'en'],
			['pages', 'b', 'ru'],
			['pages', 'c', 'en'],
		])
		expect(pathOf(files[2]!)).toBe(path.join(root, 'src/content/pages/nested/c.en.md'))
	})

	it('skips a directory whose name looks like a document', async () => {
		const root = makeRoot({ 'pages/x.en.md/a.en.md': document('a', 'en') })
		expect(listed((await loadDocumentFiles(root, [])).files)).toEqual([['pages', 'a', 'en']])
	})

	it('lists the documents of an enabled module only', async () => {
		const root = makeRoot({
			'courses/night.en.md': document('night', 'en', 'courseStatus: current\n'),
		})
		expect(listed((await loadDocumentFiles(root, [])).files)).toEqual([])
		expect(listed((await loadDocumentFiles(root, [coursesModule])).files)).toEqual([
			['courses', 'night', 'en'],
		])
	})

	it('fails closed with the path from the site root when the filename disagrees', async () => {
		const root = makeRoot({ 'pages/other.ru.md': document('anime', 'ru') })
		await expect(loadDocumentFiles(root, [])).rejects.toThrow(
			/^src\/content\/pages\/other\.ru\.md: .*does not match filename/,
		)
	})

	it('fails closed with the path when the frontmatter is missing', async () => {
		const root = makeRoot({ 'articles/anime.ru.md': 'Body without frontmatter\n' })
		await expect(loadDocumentFiles(root, [])).rejects.toThrow(
			'src/content/articles/anime.ru.md: ',
		)
	})
})
