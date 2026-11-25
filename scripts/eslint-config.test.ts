import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const eslint = new ESLint({ cwd: process.cwd() })

const CORE = 'packages/core/src'

const messagesOf = async (code: string, filePath: string) => {
	const [result] = await eslint.lintText(code, { filePath })
	return result!.messages
}

const ruleIds = async (code: string, filePath: string) =>
	(await messagesOf(code, filePath)).map((message) => message.ruleId)

const importing = (path: string) => `import { a } from '${path}'\nexport { a }\n`

describe('eslint.config.mjs style rules', () => {
	it('bans JSDoc but not JSX comments', async () => {
		expect(await ruleIds('/** x */\nexport const a = 1\n', `${CORE}/probe.ts`)).toContain(
			'astrum-scena/no-jsdoc',
		)
		expect(
			await ruleIds('export const A = () => <div>{/* x */}</div>\n', `${CORE}/probe.tsx`),
		).not.toContain('astrum-scena/no-jsdoc')
	})

	it('bans default exports except in tool configs and the integration entry', async () => {
		const code = 'export default {}\n'
		expect(await ruleIds(code, `${CORE}/probe.ts`)).toContain('no-restricted-exports')
		expect(await ruleIds(code, `${CORE}/collections.ts`)).toContain('no-restricted-exports')
		expect(await ruleIds(code, 'probe.config.ts')).not.toContain('no-restricted-exports')
		expect(await ruleIds(code, `${CORE}/index.ts`)).not.toContain('no-restricted-exports')
	})

	it('requires type over interface', async () => {
		expect(
			await ruleIds('export interface A {\n\ta: number\n}\n', `${CORE}/probe.ts`),
		).toContain('@typescript-eslint/consistent-type-definitions')
	})

	it('requires kebab-case file and folder names in the core and the site sources', async () => {
		const code = 'export const a = 1\n'
		for (const file of [`${CORE}/lib/BadName.ts`, 'demo/src/BadName.ts'])
			expect(await ruleIds(code, file), file).toContain(
				'check-file/filename-naming-convention',
			)
		expect(await ruleIds(code, `${CORE}/lib/BadDir/probe.ts`)).toContain(
			'check-file/folder-naming-convention',
		)
		expect(await ruleIds('---\n---\n', `${CORE}/pages/[locale]/[slug].astro`)).not.toContain(
			'check-file/filename-naming-convention',
		)
		expect(await ruleIds(code, `${CORE}/lib/ui.test.ts`)).not.toContain(
			'check-file/filename-naming-convention',
		)
	})

	it('keeps the core out of scripts/', async () => {
		const rule = 'no-restricted-imports'
		expect(await ruleIds(importing('../scripts/lib/x'), `${CORE}/probe.ts`)).toContain(rule)
		expect(
			await ruleIds(importing('../packages/core/src/lib/x'), 'scripts/probe.ts'),
		).not.toContain(rule)
	})

	it('bans process.cwd() in the core outside the bin entry', async () => {
		const rule = 'no-restricted-properties'
		const code = 'export const root = () => process.cwd()\n'
		for (const file of [
			`${CORE}/lib/probe.ts`,
			`${CORE}/cli/probe.ts`,
			`${CORE}/cli/images/probe.ts`,
			`${CORE}/lib/probe.test.ts`,
		])
			expect(await ruleIds(code, file), file).toContain(rule)
		expect(await ruleIds(code, `${CORE}/cli/index.ts`)).not.toContain(rule)
		expect(await ruleIds(code, 'scripts/probe.ts')).not.toContain(rule)
	})

	it('keeps the config singleton out of lib and lib out of config', async () => {
		const rule = 'no-restricted-imports'
		for (const path of [
			'../config/site.ts',
			'../config/site.js',
			'../config/site',
			'../config/loader.ts',
			'../config/loader.js',
			'../../../scripts/lib/x',
		]) {
			expect(await ruleIds(importing(path), `${CORE}/lib/probe.ts`)).toContain(rule)
		}
		expect(
			await ruleIds(importing('../config/site-schema.ts'), `${CORE}/lib/probe.ts`),
		).not.toContain(rule)
		expect(
			await ruleIds(importing('../config/site.ts'), `${CORE}/lib/probe.test.ts`),
		).toContain(rule)
		expect(
			await ruleIds(importing('../config/loader.ts'), `${CORE}/lib/probe.test.ts`),
		).not.toContain(rule)
		expect(await ruleIds(importing('../lib/x'), `${CORE}/config/probe.ts`)).toContain(rule)
		expect(await ruleIds(importing('./variants.ts'), `${CORE}/config/probe.ts`)).not.toContain(
			rule,
		)
	})

	it('keeps components out of lib, tests included', async () => {
		const rule = 'no-restricted-imports'
		for (const file of [`${CORE}/lib/probe.ts`, `${CORE}/lib/portfolio/probe.test.ts`]) {
			expect(await ruleIds(importing('../components/sizes.ts'), file)).toContain(rule)
			expect(await ruleIds(importing('../../components/portfolio/x.ts'), file)).toContain(
				rule,
			)
		}
		expect(
			await ruleIds(importing('./sizes.ts'), `${CORE}/lib/portfolio/probe.ts`),
		).not.toContain(rule)
		expect(
			await ruleIds(importing('../lib/portfolio/sizes.ts'), `${CORE}/components/probe.ts`),
		).not.toContain(rule)
	})

	it('bans a record keyed or read by a fixed locale outside the config layer and tests', async () => {
		const rule = 'no-restricted-syntax'
		for (const code of [
			'export const text = { en: 1 }\n',
			"export const text = { 'ru': 1 }\n",
			'export const read = (text: { en: string }) => text.en\n',
		])
			expect(await ruleIds(code, `${CORE}/lib/probe.ts`), code).toContain(rule)
		expect(
			await ruleIds(
				'export const read = (text: Record<string, string>, l: string) => text[l]\n',
				`${CORE}/lib/probe.ts`,
			),
		).not.toContain(rule)
		for (const file of [`${CORE}/config/probe.ts`, `${CORE}/lib/probe.test.ts`])
			expect(await ruleIds('export const text = { en: 1 }\n', file), file).not.toContain(rule)
	})

	it('bans locale literals in live code outside the config layer and tests', async () => {
		const rule = 'no-restricted-syntax'
		const literal = "export const locale = 'ru'\n"
		for (const file of [`${CORE}/lib/probe.ts`, 'scripts/probe.ts', 'demo/astro.config.mjs']) {
			expect(await ruleIds(literal, file), file).toContain(rule)
		}
		expect(await ruleIds("export type L = 'en' | 'ru'\n", `${CORE}/lib/probe.ts`)).toContain(
			rule,
		)
		expect(await ruleIds('export const locale = `ru`\n', `${CORE}/lib/probe.ts`)).toContain(
			rule,
		)
		expect(
			await ruleIds('export const path = `/${a}/ru`\nconst a = 1\n', `${CORE}/lib/probe.ts`),
		).not.toContain(rule)
		const astro = (code: string) => ruleIds(`---\n${code}---\n`, `${CORE}/layouts/probe.astro`)
		expect(await astro("const locale = 'ru'\n")).toContain(rule)
		expect(
			await ruleIds("---\nconst locale = 'en'\n---\n", `${CORE}/pages/[locale]/probe.astro`),
		).toContain(rule)
		expect(
			await ruleIds('---\n---\n\n<html lang="en"></html>\n', `${CORE}/layouts/probe.astro`),
		).toContain(rule)
		for (const file of [
			`${CORE}/config/probe.ts`,
			`${CORE}/lib/probe.test.ts`,
			`${CORE}/lib/blocks/probe/test-fixtures.ts`,
		]) {
			expect(await ruleIds(literal, file), file).not.toContain(rule)
		}
		for (const file of [`${CORE}/pages/rights.astro`, `${CORE}/components/site-footer.astro`]) {
			expect(await ruleIds("---\nconst locale = 'ru'\n---\n", file), file).toContain(rule)
		}
		expect(
			await ruleIds("export const id = 'english'\n", `${CORE}/lib/probe.ts`),
		).not.toContain(rule)
		for (const file of ['e2e/probe.spec.ts', 'e2e/probe.test.ts', 'playwright.config.ts'])
			expect(await ruleIds(literal, file), file).toContain(rule)
	})

	it('lowercases comments except ids and acronyms', async () => {
		const comment = async (text: string) =>
			ruleIds(`${text}\nexport const a = 1\n`, `${CORE}/probe.ts`)
		expect(await comment('// S14/01 note')).not.toContain('capitalized-comments')
		expect(await comment('// URL note')).not.toContain('capitalized-comments')
		expect(await comment('// Foo')).toContain('capitalized-comments')
	})

	// every object that sets no-restricted-syntax replaces the list, so enum is checked in each of them
	it('bans enum everywhere, whatever else no-restricted-syntax holds there', async () => {
		const code = 'export enum E {\n\tA,\n}\n'
		for (const file of [
			`${CORE}/lib/probe.ts`,
			`${CORE}/lib/probe.test.ts`,
			`${CORE}/lib/portfolio/layout.ts`,
			`${CORE}/components/probe.ts`,
			`${CORE}/config/probe.ts`,
			'scripts/probe.ts',
			'demo/astro.config.mjs',
			'demo/src/probe.ts',
			'vitest.config.ts',
		]) {
			expect(await ruleIds(code, file), file).toContain('no-restricted-syntax')
		}
	})

	it('bans @ts-ignore and an undescribed @ts-expect-error', async () => {
		const rule = '@typescript-eslint/ban-ts-comment'
		const probe = (comment: string) =>
			ruleIds(`${comment}\nexport const a: number = 1\n`, `${CORE}/probe.ts`)
		expect(await probe('// @ts-ignore')).toContain(rule)
		expect(await probe('// @ts-expect-error')).toContain(rule)
		expect(
			await probe('// @ts-expect-error: the fixture is deliberately invalid'),
		).not.toContain(rule)
	})

	it('ignores and reports inline config comments, so nothing can be suppressed', async () => {
		const messages = await messagesOf(
			'// eslint-disable-next-line prefer-const\nlet a = 1\nexport { a }\n',
			`${CORE}/probe.ts`,
		)
		expect(messages.map((message) => message.ruleId)).toContain('prefer-const')
		expect(
			messages.some(
				(message) => message.ruleId === null && /eslint-disable/.test(message.message),
			),
		).toBe(true)
		// an error of the core's preset, not only ESLint's warning
		for (const file of [`${CORE}/probe.ts`, 'scripts/probe.ts', 'demo/src/probe.ts'])
			expect(
				(
					await messagesOf(
						'// eslint-disable-next-line prefer-const\nlet a = 1\nexport { a }\n',
						file,
					)
				).some(
					(message) =>
						message.ruleId === 'astrum-scena/no-inline-config' &&
						message.severity === 2,
				),
				file,
			).toBe(true)
	})

	it('keeps dynamic import() inside the scripts and components boundaries', async () => {
		const rule = 'no-restricted-syntax'
		const loading = (path: string) => `export const load = () => import('${path}')\n`
		const concatenating = (prefix: string) =>
			`export const load = (name: string) => import('${prefix}' + name)\n`
		for (const file of [
			`${CORE}/probe.ts`,
			`${CORE}/lib/probe.ts`,
			`${CORE}/lib/probe.test.ts`,
		]) {
			expect(await ruleIds(loading('../../../scripts/x.ts'), file), file).toContain(rule)
			expect(await ruleIds(concatenating('../../scripts/'), file), file).toContain(rule)
		}
		for (const file of [`${CORE}/lib/probe.ts`, `${CORE}/lib/portfolio/probe.test.ts`]) {
			expect(await ruleIds(loading('../components/x.astro'), file), file).toContain(rule)
			expect(await ruleIds(concatenating('../components/'), file), file).toContain(rule)
		}
		expect(
			await ruleIds(loading('../components/x.astro'), `${CORE}/pages/probe.ts`),
		).not.toContain(rule)
		expect(await ruleIds(loading('photoswipe'), `${CORE}/lib/probe.ts`)).not.toContain(rule)
		expect(await ruleIds(loading('./x.ts'), `${CORE}/lib/probe.test.ts`)).not.toContain(rule)
	})
})

describe('runtime dependency boundary matrix', () => {
	const forms = [
		(path: string) => `import { value } from '${path}'\nexport { value }\n`,
		(path: string) => `export { value } from '${path}'\n`,
		(path: string) => `export * from '${path}'\n`,
		(path: string) => `export const load = () => import('${path}')\n`,
		(path: string) => `export const load = () => import(\`${path}\`)\n`,
	]
	const blocked = async (file: string, path: string) => {
		for (const form of forms) {
			const ids = await ruleIds(form(path), file)
			expect(
				ids.some((id) => id === 'no-restricted-imports' || id === 'no-restricted-syntax'),
				`${file}: ${form(path)}`,
			).toBe(true)
		}
	}
	const allowed = async (file: string, path: string) => {
		for (const form of forms) {
			const ids = await ruleIds(form(path), file)
			expect(ids, `${file}: ${form(path)}`).not.toContain('no-restricted-imports')
			expect(ids, `${file}: ${form(path)}`).not.toContain('no-restricted-syntax')
		}
	}
	it('applies static and dynamic bans to the core, lib, config, and test overrides', async () => {
		for (const file of [
			`${CORE}/probe.ts`,
			`${CORE}/lib/probe.ts`,
			`${CORE}/lib/probe.test.ts`,
		])
			await blocked(file, '../../../../../scripts/check-identity.ts')
		for (const file of [
			`${CORE}/lib/portfolio/boundary-probe.ts`,
			`${CORE}/lib/probe.test.ts`,
		]) {
			await blocked(file, '../../config/site.ts')
			await blocked(file, '../../components/probe.astro')
		}
		await blocked(`${CORE}/lib/portfolio/boundary-probe.ts`, '../../config/loader.ts')
		await blocked(`${CORE}/config/probe.ts`, '../lib/portfolio/layout.ts')
		await allowed(`${CORE}/lib/probe.test.ts`, '../config/loader.ts')
	})
	it('allows named adapters to load config while retaining runtime and CLI bans', async () => {
		for (const file of [
			`${CORE}/lib/portfolio/build-data.ts`,
			`${CORE}/lib/content/files.ts`,
			`${CORE}/lib/blocks/gallery/image-sets.ts`,
		]) {
			await allowed(file, '../../config/site.ts')
			await allowed(file, '../../config/loader.ts')
			await allowed(file, 'node:fs/promises')
			await blocked(file, '../../../../../scripts/check-identity.ts')
			await blocked(file, '../../components/probe.astro')
		}
	})
	it('keeps the derivative engine out of every core module but its own and tests', async () => {
		for (const [file, source] of [
			[`${CORE}/pages/probe.ts`, '../lib/images/build/engine.ts'],
			[`${CORE}/pages/[locale]/probe.ts`, '../../lib/images/build/config.ts'],
			[`${CORE}/components/portfolio/probe.ts`, '../../lib/images/build/engine.ts'],
			[`${CORE}/layouts/probe.ts`, '../lib/images/build'],
			[`${CORE}/pages/probe.ts`, '../lib/images/./build/engine.ts'],
			[`${CORE}/pages/probe.ts`, './../lib/./images/build/./engine.ts'],
			// an intermediate lib module would carry sharp into the pages that import it
			[`${CORE}/lib/images/catalog.ts`, './build/engine.ts'],
			[`${CORE}/lib/images/probe.ts`, './build/config.ts'],
			[`${CORE}/lib/images/probe.ts`, '././build/config.ts'],
			[`${CORE}/lib/portfolio/build-data.ts`, '../images/build/engine.ts'],
			[`${CORE}/lib/portfolio/layout.ts`, '../images/build/ladder.ts'],
			[`${CORE}/config/probe.ts`, '../lib/images/build/config.ts'],
			[`${CORE}/index.ts`, './lib/images/build/engine.ts'],
		] as const)
			await blocked(file, source)
		const astro = await ruleIds(
			"---\nimport { buildPhotoLadder } from '../lib/images/build/engine.ts'\nexport { buildPhotoLadder }\n---\n",
			`${CORE}/layouts/probe.astro`,
		)
		expect(astro).toContain('no-restricted-imports')
		await allowed(`${CORE}/pages/probe.ts`, '../lib/images/catalog.ts')
		await allowed(`${CORE}/lib/images/probe.ts`, './build-data.ts')
		await allowed(`${CORE}/lib/images/build/probe.ts`, './engine.ts')
		await allowed(`${CORE}/lib/images/build/config.ts`, '../public-config.ts')
		await allowed(`${CORE}/lib/images/probe.test.ts`, './build/config.ts')
		await allowed(`${CORE}/components/probe.test.ts`, '../lib/images/build/engine.ts')
		await blocked(`${CORE}/pages/probe.ts`, '../../../../scripts/check-identity.ts')
		const locale = "export const locale = 'ru'\n"
		for (const file of [`${CORE}/lib/images/build/probe.ts`, `${CORE}/lib/probe.ts`])
			expect(await ruleIds(locale, file), file).toContain('no-restricted-syntax')
		expect(await ruleIds(locale, `${CORE}/lib/images/build/probe.test.ts`)).not.toContain(
			'no-restricted-syntax',
		)
	})
	it('keeps the CLI out of every core module but the CLI itself', async () => {
		for (const [file, source] of [
			[`${CORE}/index.ts`, './cli/run.ts'],
			[`${CORE}/probe.ts`, './cli'],
			[`${CORE}/pages/probe.ts`, '../cli/registry.ts'],
			[`${CORE}/components/probe.test.ts`, '../cli/run.ts'],
			[`${CORE}/lib/probe.ts`, '../cli/css-layers.ts'],
			[`${CORE}/lib/probe.test.ts`, '../cli/css-layers.ts'],
			[`${CORE}/lib/portfolio/build-data.ts`, '../../cli/run.ts'],
			[`${CORE}/lib/portfolio/layout.ts`, '../../cli/run.ts'],
			[`${CORE}/config/probe.ts`, '../cli/run.ts'],
			[`${CORE}/modules/courses/probe.ts`, '../../cli/run.ts'],
		] as const)
			await blocked(file, source)
		await allowed(`${CORE}/cli/probe.ts`, './run.ts')
		await allowed(`${CORE}/cli/commands/probe.ts`, '../context.ts')
		await allowed(`${CORE}/cli/commands/probe.ts`, '../../config/lock.ts')
		await allowed(`${CORE}/cli/probe.ts`, '../lib/images/build/config.ts')
		await blocked(`${CORE}/cli/probe.ts`, '../../../../scripts/check-identity.ts')
		await allowed('scripts/probe.ts', '../packages/core/src/cli/registry.ts')
	})
	it('keeps every declared computation away from IO and its adapters', async () => {
		const modules = [
			'banner/select',
			'cards/select',
			...[
				'layout',
				'album-layout',
				'portfolio-layout',
				'publication',
				'surface',
				'sizes',
				'locale',
				'taxonomy',
				'viewer-data',
			].map((name) => `portfolio/${name}`),
			...['geometry', 'source', 'order'].map((name) => `blocks/gallery/${name}`),
		]
		for (const module of modules) {
			const file = `${CORE}/lib/${module}.ts`
			for (const source of [
				'node:fs',
				'fs/promises',
				'astro:content',
				'astro/loaders',
				'@/lib/images/catalog.ts',
				'@/lib/content/files.ts',
				'@/lib/portfolio/build-data.ts',
				'@/lib/blocks/gallery/image-sets.ts',
			])
				await blocked(file, source)
		}
		const layout = `${CORE}/lib/portfolio/layout.ts`
		const source = `${CORE}/lib/blocks/gallery/source.ts`
		await blocked(layout, '../images/catalog.ts')
		for (const adapter of ['../portfolio/build-data.ts', '../../lib/portfolio/build-data.ts'])
			await blocked(layout, adapter)
		await blocked(source, '../gallery/image-sets.ts')
		await blocked(`${CORE}/lib/banner/select.ts`, './build-data.ts')
		await blocked(source, './image-sets.ts')
		await allowed(layout, './surface.ts')
		const types = await ruleIds(
			"import type { ImageSetOrder } from './image-sets.ts'\nexport type { ImageSetOrder }\n",
			source,
		)
		expect(types).not.toContain('no-restricted-imports')
		expect(types).not.toContain('no-restricted-syntax')
		const reexport = await ruleIds(
			"export type { ImageSetOrder } from './image-sets.ts'\n",
			`${CORE}/lib/blocks/gallery/order.ts`,
		)
		expect(reexport).not.toContain('no-restricted-imports')
		for (const code of [
			"import type { ImageSetOrder } from '../gallery/image-sets.ts'\nexport type { ImageSetOrder }\n",
			"export type { ImageSetOrder } from '../gallery/image-sets.ts'\n",
		]) {
			const alternateTypes = await ruleIds(code, source)
			expect(alternateTypes).not.toContain('no-restricted-imports')
			expect(alternateTypes).not.toContain('no-restricted-syntax')
		}
	})
	it('retains literal-piece checks for concatenations and interpolated templates', async () => {
		for (const code of [
			"export const load = (file: string) => import('../../../scripts/' + file)\n",
			'export const load = (file: string) => import(`../../../scripts/${file}`)\n',
			"export const load = () => import('../images/catalog.ts' + '')\n",
		])
			expect(await ruleIds(code, `${CORE}/lib/portfolio/layout.ts`)).toContain(
				'no-restricted-syntax',
			)
	})
})

describe('site imports of the core (the core ESLint preset on the demo)', () => {
	const PACKAGE = '@picasso-ai/astrum-scena'
	const SITE_FILES = [
		'demo/src/probe.ts',
		'demo/src/probe.tsx',
		'demo/src/probe.astro',
		'demo/astro.config.mjs',
	]
	const forms = [
		(source: string) => `import x from '${source}'\nexport { x }\n`,
		(source: string) => `export * from '${source}'\n`,
		(source: string) => `export const load = () => import('${source}')\n`,
		(source: string) =>
			`export const load = (x: string) => import(\`${source}\${x}\`)\nexport const y = 1\n`,
	]
	const lint = (code: string, file: string) =>
		messagesOf(file.endsWith('.astro') ? `---\n${code}---\n` : code, file)
	const restricted = async (code: string, file: string) =>
		(await lint(code, file)).filter(
			(message) =>
				(message.ruleId === 'no-restricted-imports' ||
					message.ruleId === 'no-restricted-syntax') &&
				message.message.includes(`${PACKAGE} only through its package.json "exports"`),
		)

	it('allows the package root and its declared entry points', async () => {
		for (const file of SITE_FILES)
			for (const source of [PACKAGE, `${PACKAGE}/collections`, `${PACKAGE}/eslint`]) {
				for (const form of forms.slice(0, 3))
					expect(
						await restricted(form(source), file),
						`${file}: ${form(source)}`,
					).toEqual([])
			}
	})

	it('allows a package whose name only starts like the core', async () => {
		for (const file of SITE_FILES)
			for (const form of forms.slice(0, 3))
				expect(await restricted(form(`${PACKAGE}-extra`), file), file).toEqual([])
	})

	it('bans deep imports, re-exports, dynamic import() and node_modules paths', async () => {
		for (const file of SITE_FILES)
			for (const source of [
				`${PACKAGE}/src/lib/x`,
				`${PACKAGE}/dist/index.js`,
				`../node_modules/${PACKAGE}/src/x`,
			]) {
				for (const form of forms)
					expect(
						await restricted(form(source), file),
						`${file}: ${form(source)}`,
					).toHaveLength(1)
			}
	})

	it('bans internal paths in import() types', async () => {
		const typeOf = (source: string) => `export type T = import('${source}').X\n`
		for (const file of ['demo/src/probe.ts', 'demo/src/probe.astro']) {
			expect(await restricted(typeOf(`${PACKAGE}/src/x`), file), file).toHaveLength(1)
			expect(await restricted(typeOf(`${PACKAGE}/collections`), file), file).toEqual([])
		}
	})

	it('names the specifier and points to exports in a static import', async () => {
		const [message] = await restricted(
			`import x from '${PACKAGE}/src/lib/x'\nexport { x }\n`,
			'demo/src/probe.ts',
		)
		expect(message!.message).toContain(`'${PACKAGE}/src/lib/x'`)
		expect(message!.message).toContain('"exports"')
	})

	it('keeps the locale and enum bans of the demo config next to the preset', async () => {
		const ids = await ruleIds(
			`export const locale = 'ru'\nexport enum E {\n\tA,\n}\nexport * from '${PACKAGE}/src/x'\n`,
			'demo/astro.config.mjs',
		)
		expect(ids.filter((id) => id === 'no-restricted-syntax')).toHaveLength(2)
		expect(ids).toContain('no-restricted-imports')
	})
})
