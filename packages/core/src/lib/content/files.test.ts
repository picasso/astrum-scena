import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { coursesModule } from '../../modules/courses/manifest.ts'
import {
	assertValidRepositoryContent,
	CATEGORIES_CONFIG_PATH,
	classAttributeErrors,
	legalContentErrors,
	loadCategoriesConfig,
	loadContentSnapshot,
	loadPlacesConfig,
	loadTagsConfig,
	loadTaxonomyConfig,
	moduleTargetErrors,
	parseLeadingFrontmatter,
	serializeMarkdownDocument,
	serializeYamlDocument,
	TAGS_CONFIG_PATH,
} from './files'
import { validateContentSnapshot } from './integrity'

describe('content files', () => {
	it('reads only the leading frontmatter block', () => {
		const value = '---\nlocale: en\ntranslationKey: test\n---\n\nBody\n---\nnot-frontmatter\n'
		expect(parseLeadingFrontmatter(value)).toEqual({
			data: { locale: 'en', translationKey: 'test' },
			body: '\nBody\n---\nnot-frontmatter\n',
		})
	})

	it('serializes canonical frontmatter with one trailing newline', () => {
		const value = serializeMarkdownDocument({ locale: 'en' }, 'Body\r\n')
		expect(value).toBe('---\nlocale: en\n---\n\nBody\n')
	})

	it('loads nested files recursively and preserves their relative ID', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'content-files-test-'))
		const content = path.join(root, 'src/content')
		await Promise.all([
			mkdir(path.join(content, 'albums/nested'), { recursive: true }),
			mkdir(path.join(content, 'photos'), { recursive: true }),
			mkdir(path.join(content, 'config'), { recursive: true }),
		])
		await Promise.all([
			writeFile(
				path.join(content, 'albums/nested/album.yaml'),
				serializeYamlDocument({
					category: 'series',
					title: { en: 'Album', ru: 'Альбом' },
					description: { en: '', ru: '' },
					status: 'draft',
					coverId: 'photo',
					photoIds: ['photo'],
				}),
			),
			writeFile(
				path.join(content, 'photos/photo.yaml'),
				serializeYamlDocument({
					title: { en: 'Photo', ru: 'Фото' },
					status: 'draft',
				}),
			),
			writeFile(
				path.join(content, 'config/categories.yaml'),
				serializeYamlDocument({
					schemaVersion: 1,
					categories: [
						{ id: 'series', label: { en: 'Series', ru: 'Серии' } },
						{ id: 'places', label: { en: 'Places', ru: 'Места' } },
					],
				}),
			),
			writeFile(
				path.join(content, 'config/places.yaml'),
				serializeYamlDocument({ schemaVersion: 1, places: [] }),
			),
			writeFile(
				path.join(content, 'config/tags.yaml'),
				serializeYamlDocument({ schemaVersion: 1, tags: [] }),
			),
		])
		const snapshot = await loadContentSnapshot(root, [])
		expect(snapshot.albums[0]?.id).toBe('nested/album')
		const result = validateContentSnapshot(snapshot, 'ru')
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.errors).toEqual([
				expect.objectContaining({ code: 'filename-mismatch', entityId: 'nested/album' }),
			])
		}
	})

	// an unknown per-album `layout` must not surface as a bare ZodError without its source
	it('names the file and field when a data entry fails its schema', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'content-files-test-'))
		const content = path.join(root, 'src/content')
		const albums = path.join(content, 'albums')
		await Promise.all(
			['albums', 'photos', 'config', 'articles', 'pages'].map((dir) =>
				mkdir(path.join(content, dir), { recursive: true }),
			),
		)
		await Promise.all([
			writeFile(
				path.join(content, 'config/categories.yaml'),
				serializeYamlDocument({ schemaVersion: 1, categories: [] }),
			),
			writeFile(
				path.join(content, 'config/places.yaml'),
				serializeYamlDocument({ schemaVersion: 1, places: [] }),
			),
			writeFile(
				path.join(content, 'config/tags.yaml'),
				serializeYamlDocument({ schemaVersion: 1, tags: [] }),
			),
		])
		await writeFile(
			path.join(albums, 'broken.yaml'),
			serializeYamlDocument({
				category: 'series',
				title: { en: 'Album', ru: 'Альбом' },
				description: { en: '', ru: '' },
				layout: 'carousel',
				status: 'draft',
				coverId: 'photo',
				photoIds: ['photo'],
			}),
		)
		// the root is a temporary directory, so a label from the working directory would start with ../
		await expect(loadContentSnapshot(root, [])).rejects.toThrow(
			/^src\/content\/albums\/broken\.yaml: layout: /,
		)
	})
})

describe('taxonomy loaders', () => {
	const writeConfig = async (files: Record<string, unknown>) => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'content-taxonomy-test-'))
		const config = path.join(root, 'src/content/config')
		await mkdir(config, { recursive: true })
		await Promise.all(
			Object.entries(files).map(([name, data]) =>
				writeFile(path.join(config, name), serializeYamlDocument(data)),
			),
		)
		return root
	}

	it('loads the places without the categories and tags files', async () => {
		const place = { id: 'harbor', name: { en: 'Harbor', ru: 'Гавань' }, kind: 'locality' }
		const root = await writeConfig({ 'places.yaml': { schemaVersion: 1, places: [place] } })
		expect(await loadPlacesConfig(root)).toEqual([place])
	})

	it('rejects a places entry that fails its schema', async () => {
		const root = await writeConfig({
			'places.yaml': {
				schemaVersion: 1,
				places: [{ id: 'harbor', name: { en: 'Harbor' }, kind: 'city' }],
			},
		})
		await expect(loadPlacesConfig(root)).rejects.toThrow()
	})

	it('assembles each file into its own field', async () => {
		const category = { id: 'series', label: { en: 'Series', ru: 'Серии' } }
		const place = { id: 'harbor', name: { en: 'Harbor', ru: 'Гавань' }, kind: 'locality' }
		const tag = { id: 'fog', label: { en: 'Fog', ru: 'Туман' }, kind: 'condition' }
		const root = await writeConfig({
			'categories.yaml': { schemaVersion: 1, categories: [category] },
			'places.yaml': { schemaVersion: 1, places: [place] },
			'tags.yaml': { schemaVersion: 1, tags: [tag] },
		})
		expect(await loadTaxonomyConfig(root)).toEqual({
			categories: [category],
			places: [place],
			tags: [tag],
		})
	})

	it('rejects a taxonomy file without a supported schemaVersion, naming it', async () => {
		const root = await writeConfig({
			'categories.yaml': { categories: [] },
			'tags.yaml': { schemaVersion: 2, tags: [] },
		})
		await expect(loadCategoriesConfig(root)).rejects.toThrow(
			`${CATEGORIES_CONFIG_PATH}: missing schemaVersion; supported: 1`,
		)
		await expect(loadTagsConfig(root)).rejects.toThrow(
			`${TAGS_CONFIG_PATH}: schemaVersion 2 is not supported; supported: 1`,
		)
	})

	it('fails with the path when the places file is missing', async () => {
		const root = await writeConfig({
			'categories.yaml': { schemaVersion: 1, categories: [] },
			'tags.yaml': { schemaVersion: 1, tags: [] },
		})
		const missing = expect.objectContaining({
			code: 'ENOENT',
			message: expect.stringContaining(path.join('src/content/config', 'places.yaml')),
		})
		await expect(loadPlacesConfig(root)).rejects.toEqual(missing)
		await expect(loadTaxonomyConfig(root)).rejects.toEqual(missing)
	})
})

describe('class attributes in content', () => {
	const writeContent = async (files: Record<string, string>) => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'content-class-test-'))
		await Promise.all(
			Object.entries(files).map(async ([name, text]) => {
				const file = path.join(root, 'src/content', name)
				await mkdir(path.dirname(file), { recursive: true })
				await writeFile(file, text)
			}),
		)
		return root
	}

	it('names the file and line of every class attribute', async () => {
		const root = await writeContent({
			'articles/a.en.mdx': '---\ntitle: A\n---\n\n<div className="lead">x</div>\n',
			'articles/b.ru.md': 'Text\n<span class="aside">y</span>\n:::note{class="wide"}\n',
			'albums/c.yaml': 'description: <b class=lead>c</b>\n',
		})
		expect(await classAttributeErrors(root)).toEqual([
			'src/content/albums/c.yaml:1: class attribute in content; style through a component or directive',
			'src/content/articles/a.en.mdx:5: class attribute in content; style through a component or directive',
			'src/content/articles/b.ru.md:2: class attribute in content; style through a component or directive',
			'src/content/articles/b.ru.md:3: class attribute in content; style through a component or directive',
		])
	})

	it('allows the word class in prose and other attributes', async () => {
		const root = await writeContent({
			'pages/p.en.md':
				'A class of device, a master class.\n<abbr data-class="x" subclass="y">z</abbr>\n',
		})
		expect(await classAttributeErrors(root)).toEqual([])
	})

	it('catches the = on the next line, any letter case and CR-only line breaks', async () => {
		const root = await writeContent({
			'articles/a.en.md': 'Text\n<div class\n="lead">x</div>\n',
			'articles/b.en.md': '<p>\r\n<span CLASS="wide">y</span>\r\n',
			'articles/c.en.md': 'One\rTwo\r<b Class="aside">z</b>\r',
		})
		const at = (location: string) =>
			`${location}: class attribute in content; style through a component or directive`
		expect(await classAttributeErrors(root)).toEqual([
			at('src/content/articles/a.en.md:2'),
			at('src/content/articles/b.en.md:2'),
			at('src/content/articles/c.en.md:3'),
		])
	})

	it('fails repository validation on a class attribute', async () => {
		const legal = serializeMarkdownDocument({ title: 'Image rights' }, 'Text')
		const root = await writeContent({
			'config/categories.yaml': serializeYamlDocument({ schemaVersion: 1, categories: [] }),
			'config/places.yaml': serializeYamlDocument({ schemaVersion: 1, places: [] }),
			'config/tags.yaml': serializeYamlDocument({ schemaVersion: 1, tags: [] }),
			'legal/rights.en.md': legal,
		})
		await expect(assertValidRepositoryContent(root, 'en', ['en'], [])).resolves.toBeDefined()
		await writeFile(
			path.join(root, 'src/content/legal/rights.en.md'),
			`${legal}<span class="lead">x</span>\n`,
		)
		await expect(assertValidRepositoryContent(root, 'en', ['en'], [])).rejects.toThrow(
			/Content markup failed:\n- src\/content\/legal\/rights\.en\.md:6: class attribute/,
		)
	})
})

describe('legal content', () => {
	const writeLegal = async (files: Record<string, string>) => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'content-legal-test-'))
		const legal = path.join(root, 'src/content/legal')
		await mkdir(legal, { recursive: true })
		await Promise.all(
			Object.entries(files).map(([name, title]) =>
				writeFile(path.join(legal, name), serializeMarkdownDocument({ title }, 'Text')),
			),
		)
		return root
	}

	it('requires every legal text in every active locale', async () => {
		const root = await writeLegal({ 'rights.en.md': 'Image rights' })
		expect(await legalContentErrors(root, ['en'])).toEqual([])
		expect(await legalContentErrors(root, ['en', 'ru'])).toEqual([
			'src/content/legal/rights.ru.md is missing',
		])
	})

	it('requires the rights text even when no legal file exists', async () => {
		const root = await writeLegal({})
		expect(await legalContentErrors(root, ['en', 'ru'])).toEqual([
			'src/content/legal/rights.en.md is missing',
			'src/content/legal/rights.ru.md is missing',
		])
	})

	it('requires every discovered legal key besides rights', async () => {
		const root = await writeLegal({ 'rights.ru.md': 'Права', 'terms.en.md': 'Terms' })
		expect(await legalContentErrors(root, ['ru'])).toEqual([
			'src/content/legal/terms.ru.md is missing',
		])
	})

	it('needs only the one locale of a one-locale site', async () => {
		const root = await writeLegal({ 'rights.ru.md': 'Права на изображения' })
		expect(await legalContentErrors(root, ['ru'])).toEqual([])
	})

	it('rejects unknown frontmatter', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'content-legal-test-'))
		const legal = path.join(root, 'src/content/legal')
		await mkdir(legal, { recursive: true })
		await writeFile(
			path.join(legal, 'rights.en.md'),
			serializeMarkdownDocument({ title: 'Image rights', slug: 'rights' }, 'Text'),
		)
		await expect(legalContentErrors(root, ['en'])).rejects.toThrow()
	})
})

describe('module content', () => {
	const doc = (data: Record<string, unknown>) =>
		serializeMarkdownDocument(
			{ locale: 'en', slug: data.translationKey, title: 'T', status: 'draft', ...data },
			'Text',
		)
	const writeSite = async (files: Record<string, string>) => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'content-modules-test-'))
		const taxonomy = {
			'config/categories.yaml': serializeYamlDocument({ schemaVersion: 1, categories: [] }),
			'config/places.yaml': serializeYamlDocument({ schemaVersion: 1, places: [] }),
			'config/tags.yaml': serializeYamlDocument({ schemaVersion: 1, tags: [] }),
		}
		for (const [file, text] of Object.entries({ ...taxonomy, ...files })) {
			await mkdir(path.dirname(path.join(root, 'src/content', file)), { recursive: true })
			await writeFile(path.join(root, 'src/content', file), text)
		}
		return root
	}

	it('reads the collection of an enabled module and leaves a disabled one empty', async () => {
		const root = await writeSite({
			'courses/night.en.md': doc({ translationKey: 'night', courseStatus: 'current' }),
		})
		expect((await loadContentSnapshot(root, [coursesModule])).courses).toEqual([
			expect.objectContaining({ id: 'night-en' }),
		])
		expect((await loadContentSnapshot(root, [])).courses).toEqual([])
	})

	it('rejects the old page kind of a course', async () => {
		const root = await writeSite({
			'pages/night.en.md': doc({ translationKey: 'night', kind: 'course' }),
		})
		await expect(loadContentSnapshot(root, [])).rejects.toThrow(
			/pages[\\/]night\.en\.md: \(root\): Unrecognized key: "kind"/,
		)
	})

	it('names a moreDocs target of a disabled module with its file and key', async () => {
		const targets = {
			docs: [
				{ kind: 'article', slug: 'a' },
				{ kind: 'course', slug: 'night' },
			],
		}
		const root = await writeSite({
			'pages/about.en.md': doc({ translationKey: 'about', moreDocs: targets }),
			'articles/a.en.md': doc({ translationKey: 'a', moreDocs: 'off' }),
		})
		expect(await moduleTargetErrors(root, [])).toEqual([
			'src/content/pages/about.en.md: moreDocs.docs.1.kind: "course": module "courses" is not enabled in site.yaml (modules.courses)',
		])
		expect(await moduleTargetErrors(root, [coursesModule])).toEqual([])
	})
})
