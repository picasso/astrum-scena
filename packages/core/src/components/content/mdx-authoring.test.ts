import path from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { CORE_ROOT } from '../../core-root.ts'
import type { GalleryInput } from '../../lib/blocks/gallery/schema.ts'
import type { WrapAroundInput } from '../../lib/blocks/wrap-around/schema.ts'
import { MDX_COMPONENTS } from './mdx-components.ts'

// exact type equality, not mutual assignability: `A extends B extends A` would accept
// `{ a: string }` vs `{ a: string; b?: never }` and similar drift in union members
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type MdxProps<C> = C extends (props: infer P) => unknown ? P : never

function authoringLiteralContract() {
	const wrapAround: MDXProvidedComponents['WrapAround'] = () => null
	const gallery: MDXProvidedComponents['Gallery'] = () => null
	const privacyController: MDXProvidedComponents['PrivacyController'] = () => null

	wrapAround({ imageId: 'x', position: 'right' })
	gallery({ albumId: 'northland', layout: 'square' })
	privacyController({})

	// @ts-expect-error position is left | right
	wrapAround({ imageId: 'x', position: 'wrong' })
	// @ts-expect-error unknown authoring prop
	wrapAround({ imageId: 'x', className: 'nope' })
	// @ts-expect-error unknown authoring prop
	gallery({ albumId: 'northland', className: 'nope' })
	// @ts-expect-error controller identity comes from config
	privacyController({ name: 'nope' })
}

// the virtual file mirrors what the MDX language server generates: `_components` from
// `MDXProvidedComponents`, JSX tags as `_components.WrapAround`, `.jsx` + `checkJs` like `mdx.checkMdx`
const VIRTUAL_FILE = path.join(CORE_ROOT, 'src/components/content/mdx-authoring.virtual.jsx')
const AUTHORING_FILE = path.join(CORE_ROOT, 'src/components/content/mdx-authoring.d.ts')

function mdxVirtualSource(jsx: string): string {
	return `const _components = {
	// @ts-ignore
	.../** @type {0 extends 1 & MDXProvidedComponents ? {} : MDXProvidedComponents} */ ({}),
}

export default function MDXContent() {
	return (
		<>
			${jsx}
		</>
	)
}
`
}

function createLanguageService(source: string): ts.LanguageService {
	const configPath = ts.findConfigFile(CORE_ROOT, ts.sys.fileExists, 'tsconfig.json')
	if (!configPath) throw new Error('tsconfig.json not found')
	const { config } = ts.readConfigFile(configPath, ts.sys.readFile)
	const parsed = ts.parseJsonConfigFileContent(config, ts.sys, CORE_ROOT)
	const options: ts.CompilerOptions = {
		...parsed.options,
		noEmit: true,
		jsx: ts.JsxEmit.ReactJSX,
		jsxImportSource: 'react',
		strict: true,
		checkJs: true,
		allowJs: true,
	}
	const host: ts.LanguageServiceHost = {
		getCompilationSettings: () => options,
		getScriptFileNames: () => [VIRTUAL_FILE, AUTHORING_FILE],
		getScriptVersion: () => '1',
		getScriptSnapshot: (fileName) => {
			if (fileName === VIRTUAL_FILE) return ts.ScriptSnapshot.fromString(source)
			const text = ts.sys.readFile(fileName)
			return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
		},
		getCurrentDirectory: () => CORE_ROOT,
		getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
		fileExists: ts.sys.fileExists,
		readFile: ts.sys.readFile,
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
		realpath: ts.sys.realpath,
	}
	return ts.createLanguageService(host)
}

function diagnosticCodes(source: string): number[] {
	const service = createLanguageService(source)
	return service.getSemanticDiagnostics(VIRTUAL_FILE).map((diagnostic) => diagnostic.code)
}

function diagnosticMessages(source: string): string[] {
	const service = createLanguageService(source)
	return service
		.getSemanticDiagnostics(VIRTUAL_FILE)
		.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
}

describe('MDX authoring contract', () => {
	it('keeps registry keys and schema input types aligned with the editor contract', () => {
		true satisfies Equal<keyof typeof MDX_COMPONENTS, keyof MDXProvidedComponents>
		true satisfies Equal<MdxProps<MDXProvidedComponents['Gallery']>, GalleryInput>
		true satisfies Equal<MdxProps<MDXProvidedComponents['WrapAround']>, WrapAroundInput>
		authoringLiteralContract()
		expect(Object.keys(MDX_COMPONENTS).sort()).toEqual([
			'Gallery',
			'PrivacyController',
			'WrapAround',
		])
	})

	it('rejects an invalid WrapAround position through the MDX language-server pattern', () => {
		const source = mdxVirtualSource('<_components.WrapAround imageId="x" position="wrong" />')
		const messages = diagnosticMessages(source)
		expect(messages.some((message) => /wrong/.test(message) && /left/.test(message))).toBe(true)
		expect(diagnosticCodes(source)).toContain(2322)
	})

	it('rejects an unknown WrapAround prop through the MDX language-server pattern', () => {
		const source = mdxVirtualSource('<_components.WrapAround imageId="x" className="nope" />')
		const messages = diagnosticMessages(source)
		expect(messages.some((message) => /className/.test(message))).toBe(true)
	})

	it('accepts a valid WrapAround through the MDX language-server pattern', () => {
		const source = mdxVirtualSource(
			'<_components.WrapAround imageId="x" position="right" width={70} />',
		)
		expect(diagnosticMessages(source)).toEqual([])
	})

	it('completes only left and right for WrapAround position', () => {
		const source = mdxVirtualSource('<_components.WrapAround imageId="x" position="" />')
		const offset = source.indexOf('position="') + 'position="'.length
		const service = createLanguageService(source)
		const completions = service.getCompletionsAtPosition(VIRTUAL_FILE, offset, {
			includeCompletionsWithInsertText: true,
		})
		const names = (completions?.entries ?? []).map((entry) => entry.name.replaceAll('"', ''))
		expect(names).toEqual(expect.arrayContaining(['left', 'right']))
		expect(names).not.toContain('wrong')
		expect(
			names.filter((name) => name === 'left' || name === 'right' || name === 'center'),
		).toEqual(['left', 'right'])
	})
})
