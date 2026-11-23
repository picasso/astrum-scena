import { coreImportRule, type CoreManifest, installedManifest } from './core-imports.ts'

// the ESLint presets a site adds to its flat config. The base, `astrumScenaEslint`, lets the site
// import the core only through the entry points of the core's package.json `exports` and turns inline
// config comments off, reporting each as an error, so nothing can be suppressed. It is plain
// flat-config data on built-in rules and a rule object of the core, so the core needs no `eslint`
// dependency, and the allowed list is read from the installed package.json, so a new entry point needs
// no change in the site's config. The code style, `astrumScenaStyle`, also needs `typescript-eslint`
// and `eslint-plugin-simple-import-sort`, optional peers of the core it imports only when called.

export type { CoreManifest } from './core-imports.ts'
export { declaredSpecifiers, installedManifest } from './core-imports.ts'

export type ImportPattern = { regex: string; caseSensitive: true; message: string }
export type SyntaxRestriction = { selector: string; message: string }
export type DeepImportRules = { patterns: ImportPattern[]; syntax: SyntaxRestriction[] }
// severity first, as ESLint's own rule entry
export type RuleEntry = ['error', ...unknown[]]

type CommentLike = { type: string; value: string; loc?: unknown }
type ReportDescriptor = { loc: unknown; message: string }
// the part of ESLint's rule context the core's rules read: ESLint types `sourceCode` for any language,
// and only the JavaScript one has comments, so the rules read them through `commentsOf`
type RuleContextLike = {
	sourceCode: unknown
	report(descriptor: ReportDescriptor): void
}
const commentsOf = (sourceCode: unknown): CommentLike[] =>
	(sourceCode as { getAllComments?: () => CommentLike[] }).getAllComments?.() ?? []
type LintRule = {
	meta: { type: 'problem' | 'suggestion'; schema: []; docs: { description: string } }
	create(context: RuleContextLike): { Program: () => void }
}
type LintPlugin = { meta: { name: string }; rules: Record<string, LintRule> }
export type LintConfig = {
	files?: string[]
	ignores?: string[]
	linterOptions?: { noInlineConfig: true }
	// the core's plugin, opaque to the site; typed as `object` since ESLint types a rule's context for any
	// language
	plugins?: Record<string, object>
	rules: Record<string, RuleEntry>
}
// a flat-config object of the style preset, which also carries typescript-eslint's own objects
export type FlatConfig = Record<string, unknown>

const PLUGIN = 'astrum-scena'

// block comments carry every ESLint directive, line comments only the line-scoped `eslint-disable-*`
// (a `// global …` line is prose, not a directive)
const BLOCK_DIRECTIVE =
	/^\s*(?:eslint(?:-disable(?:-line|-next-line)?|-enable)?|globals?|exported)(?:\s|$)/
const LINE_DIRECTIVE = /^\s*eslint-disable-(?:line|next-line)(?:\s|$)/

const commentRule = (
	description: string,
	matches: (comment: CommentLike) => boolean,
	message: string,
): LintRule => ({
	meta: { type: 'problem', schema: [], docs: { description } },
	create: (context) => ({
		Program: () => {
			for (const comment of commentsOf(context.sourceCode))
				if (matches(comment)) context.report({ loc: comment.loc, message })
		},
	}),
})

// one plugin object for every config object that names it: ESLint refuses two objects under one name
const astrumScenaPlugin: LintPlugin = {
	meta: { name: PLUGIN },
	rules: {
		'no-inline-config': commentRule(
			'Inline config comments are ignored (noInlineConfig) and reported as errors.',
			(comment) =>
				comment.type === 'Block'
					? BLOCK_DIRECTIVE.test(comment.value)
					: LINE_DIRECTIVE.test(comment.value),
			'Inline ESLint config is ignored here: fix the code instead of suppressing the rule.',
		),
		// JSX comments `{/* */}` are not JSDoc and pass
		'no-jsdoc': commentRule(
			'Bans JSDoc comments.',
			(comment) => comment.type === 'Block' && comment.value.startsWith('*'),
			'Use // comments; JSDoc is not used in this code.',
		),
	},
}

// esquery reads a regex up to an unescaped slash
const selectorRegex = (source: string) => `/${source.replaceAll('/', '\\/')}/`

export function deepImportRules(manifest: CoreManifest = installedManifest()): DeepImportRules {
	const { undeclared, piece, message } = coreImportRule(manifest)
	const exact = selectorRegex(undeclared)
	const anyPiece = selectorRegex(piece)
	return {
		patterns: [{ regex: undeclared, caseSensitive: true, message }],
		// dynamic import() and `import('…')` types are not imports, so no-restricted-imports misses them
		syntax: [
			{ selector: `ImportExpression > Literal.source[value=${exact}]`, message },
			{
				selector: `ImportExpression > TemplateLiteral.source[expressions.length=0] > TemplateElement[value.cooked=${exact}]`,
				message,
			},
			{
				selector: `ImportExpression > :not(Literal, TemplateLiteral[expressions.length=0]).source :matches(Literal[value=${anyPiece}], TemplateElement[value.cooked=${anyPiece}])`,
				message,
			},
			{ selector: `TSImportType > Literal.source[value=${exact}]`, message },
		],
	}
}

// a later config object that sets no-restricted-syntax replaces this list, so every such object
// repeats it
export const enumDeclaration: SyntaxRestriction = {
	selector: 'TSEnumDeclaration',
	message: 'Use a union type instead of enum.',
}

// a later config object that sets a rule replaces its whole list, so a site that has its own
// no-restricted-syntax passes those selectors in `syntax`, or builds its object from deepImportRules()
export function astrumScenaEslint(
	{ files, syntax = [] }: { files?: string[]; syntax?: SyntaxRestriction[] } = {},
	manifest: CoreManifest = installedManifest(),
): LintConfig[] {
	const rules = deepImportRules(manifest)
	return [
		{
			...(files ? { files } : {}),
			linterOptions: { noInlineConfig: true },
			plugins: { [PLUGIN]: astrumScenaPlugin },
			rules: {
				[`${PLUGIN}/no-inline-config`]: ['error'],
				'no-restricted-imports': ['error', { patterns: rules.patterns }],
				'no-restricted-syntax': ['error', ...syntax, ...rules.syntax],
			},
		},
	]
}

const STYLE_PEERS = ['typescript-eslint', 'eslint-plugin-simple-import-sort'] as const

type StylePeers = { typescript: { configs: { recommended: FlatConfig[] } }; importSort: object }

type StylePeerImport = (name: (typeof STYLE_PEERS)[number]) => Promise<unknown>

const isMissingPeer = (error: unknown, name: string): boolean =>
	(error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' &&
	(error as Error).message.includes(`'${name}'`)

const defaultOf = (module: unknown): unknown => (module as { default?: unknown }).default ?? module

async function importStylePeers(importPeer: StylePeerImport): Promise<StylePeers> {
	const loaded: unknown[] = []
	for (const name of STYLE_PEERS) {
		try {
			loaded.push(defaultOf(await importPeer(name)))
		} catch (error) {
			if (!isMissingPeer(error, name)) throw error
			throw new Error(
				`the style preset of ${PLUGIN} needs ${STYLE_PEERS.join(' and ')}, optional peers of the core; ` +
					`install them in the site: pnpm add -D ${STYLE_PEERS.join(' ')}`,
				{ cause: error },
			)
		}
	}
	const [typescript, importSort] = loaded
	return { typescript, importSort } as StylePeers
}

// the code style the core and its sites share: typescript-eslint's recommended rules, sorted imports
// and exports, no `any`, enum, interface, JSDoc or default export (but in tool configs `*.config.*`),
// lowercase comments and no inline config. `importPeer` is for tests; a site calls it without arguments
export async function astrumScenaStyle(
	importPeer: StylePeerImport = (name) => import(name),
): Promise<FlatConfig[]> {
	const { typescript, importSort } = await importStylePeers(importPeer)
	return [
		...typescript.configs.recommended,
		{
			linterOptions: { noInlineConfig: true },
			plugins: { 'simple-import-sort': importSort, [PLUGIN]: astrumScenaPlugin },
			rules: {
				'simple-import-sort/imports': 'error',
				'simple-import-sort/exports': 'error',
				'@typescript-eslint/no-explicit-any': 'error',
				'@typescript-eslint/ban-ts-comment': [
					'error',
					{ 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' },
				],
				'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
				'capitalized-comments': [
					'error',
					'never',
					// a first word with two capitals is an acronym or CamelCase name (URL, PhotoSwipe), a
					// capital and a digit start an id (R2, A11y); continuation lines of a multi-line
					// comment keep their case (sentences, key names like Enter)
					{
						ignorePattern: '[^\\s]*\\p{Lu}[^\\s]*\\p{Lu}|\\p{Lu}\\d',
						ignoreConsecutiveComments: true,
					},
				],
				'no-restricted-syntax': ['error', enumDeclaration],
				'no-restricted-exports': [
					'error',
					{
						restrictDefaultExports: {
							direct: true,
							named: true,
							defaultFrom: true,
							namedFrom: true,
							namespaceFrom: true,
						},
					},
				],
				[`${PLUGIN}/no-inline-config`]: 'error',
				[`${PLUGIN}/no-jsdoc`]: 'error',
				'prefer-const': 'error',
			},
		},
		{
			// tool configs default-export
			files: ['**/*.config.{ts,mts,cts,js,mjs,cjs}'],
			rules: { 'no-restricted-exports': 'off' },
		},
	]
}
