import { fileURLToPath } from 'node:url'

import { fromMarkdown } from 'mdast-util-from-markdown'
import { mdxFromMarkdown } from 'mdast-util-mdx'
import { mdxjs } from 'micromark-extension-mdxjs'

import { coreImportRule, type CoreManifest, installedManifest } from '../../core-imports.ts'

// ESLint does not read `.mdx`, and MDX content may hold ESM `import`/`export … from`, so the build
// rejects a site's MDX that reaches core internals, by the same `exports` rule as the ESLint preset.
// MDX runs through the site's satteri processor, which ignores remark plugins, so this is a satteri
// mdast plugin; satteri hands an ESM block over as raw text, which is parsed here for its sources.

type EsmStatement = { type: string; source?: { value?: unknown } | null }
type EsmNode = { type: string; data?: { estree?: { body?: EsmStatement[] } } }

// satteri's visitor types are a transitive dependency that src cannot import; astro.config
// type-checks the full plugin shape when passing it to `mdastPlugins`
type EsmVisitorContext = { fileURL?: URL }

const MODULE_STATEMENTS = new Set([
	'ImportDeclaration',
	'ExportAllDeclaration',
	'ExportNamedDeclaration',
])

export function esmSources(esm: string): string[] {
	const tree = fromMarkdown(esm, {
		extensions: [mdxjs()],
		mdastExtensions: [mdxFromMarkdown()],
	}) as { children: EsmNode[] }
	return tree.children
		.filter((node) => node.type === 'mdxjsEsm')
		.flatMap((node) => node.data?.estree?.body ?? [])
		.filter((statement) => MODULE_STATEMENTS.has(statement.type))
		.map((statement) => statement.source?.value)
		.filter((source): source is string => typeof source === 'string')
}

export function coreImportsMdastPlugin(manifest: CoreManifest = installedManifest()) {
	const rule = coreImportRule(manifest)
	const undeclared = new RegExp(rule.undeclared)
	return {
		name: 'astrum-scena-core-imports',
		mdxjsEsm(node: { value: string }, ctx: EsmVisitorContext): void {
			const banned = esmSources(node.value).filter((source) => undeclared.test(source))
			if (banned.length === 0) return
			const file = ctx.fileURL ? fileURLToPath(ctx.fileURL) : '<unknown>'
			throw new Error(
				`${file} imports ${banned.map((source) => `'${source}'`).join(', ')}. ${rule.message}`,
			)
		},
	}
}
