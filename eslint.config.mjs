import path from 'node:path'

import { defineConfig } from 'eslint/config'
import astro from 'eslint-plugin-astro'
import checkFile from 'eslint-plugin-check-file'

import {
	astrumScenaEslint,
	astrumScenaStyle,
	deepImportRules,
	enumDeclaration,
} from './packages/core/src/eslint.ts'

const CORE = 'packages/core/src'
const SITE = 'demo'

const scriptsImport = {
	regex: '(^|/)scripts/',
	message: 'The core must not import scripts/; move the shared code into the core lib.',
}
// the CLI is a Node entry point over the core; the integration, routes and components never load it
const cliImport = {
	regex: '(^|/)cli(/|$)',
	message: 'Only src/cli imports src/cli: the integration and its modules never load the CLI.',
}
const siteConfigImport = {
	regex: '(^|/)config/site(\\.(ts|mts|cts|js|mjs|cjs))?$',
	message:
		'lib takes the site config as an argument; only routes and components import the site singleton.',
}
const libImport = {
	regex: '(^|/)lib/',
	message: 'config must not import lib: lib depends on the config schemas, never the reverse.',
}
const componentsImport = {
	regex: '(^|/)components/',
	message:
		'lib must not import components: move the shared module into lib and import it from the component.',
}
// dynamic import() is not an import, so no-restricted-imports misses it; the same boundaries are
// restated as no-restricted-syntax selectors. Any path piece inside the source counts, so
// concatenated and template sources are caught too
const dynamicImport = (pattern, message) => [
	{ selector: `ImportExpression Literal[value=${pattern}]`, message },
	{ selector: `ImportExpression TemplateElement[value.cooked=${pattern}]`, message },
]
// the locale set and its roles come from site.yaml `content`, and locale metadata from its effective
// `content.catalog` in the lock
const localeLiterals = [
	{
		selector:
			':matches(Literal[value=/^(en|ru)$/], TemplateLiteral[expressions.length=0] > TemplateElement[value.cooked=/^(en|ru)$/])',
		message:
			'Do not hardcode a locale: take it from site.yaml `content` (locales, referenceLocale, defaultLocale()) or its `content.catalog`.',
	},
	// a record keyed or read by a fixed locale is a text of a two-locale site: localized data holds
	// exactly `content.locales`, and locale metadata lives in `content.catalog`
	{
		selector:
			':matches(Property > Identifier.key[name=/^(en|ru)$/], Property > Literal.key[value=/^(en|ru)$/], MemberExpression[computed=false] > Identifier.property[name=/^(en|ru)$/])',
		message:
			'Do not key or read a record by a fixed locale: index it by a locale of site.yaml `content`, or put locale metadata into `content.catalog`.',
	},
]
// the core's default catalog is only what resolve merges the site's `content.catalog` into; code
// outside the config layer reads the effective catalog, so a site's override reaches every consumer;
// a member read catches the namespace import (`locales.DEFAULT_LOCALE_CATALOG`)
const CATALOG_NAMES = '/^(DEFAULT_LOCALE_CATALOG|LOCALE_CATALOG|SUPPORTED_LOCALES)$/'
const catalogImport = {
	selector: `:matches(ImportSpecifier[imported.name=${CATALOG_NAMES}], MemberExpression[computed=false] > Identifier.property[name=${CATALOG_NAMES}])`,
	message:
		"Do not import the core's default locale catalog: read the effective `content.catalog` of the site config.",
}

// the derivative engine runs on sharp at prepare time; reached from runtime code, even through
// another lib module, it would pull sharp into the site build. `lib/images/build` is the core's only
// `build` directory, so any `build` segment names it, whatever `./` pieces surround it. The CLI runs
// at prepare time too, and no runtime module imports it
const imageBuildImport = {
	regex: '(^|/)build(/|$)',
	message:
		'Only lib/images/build itself, the CLI and tests may import lib/images/build: it is prepare-time code on sharp.',
}
const IMAGE_BUILD_EXEMPT = [`${CORE}/lib/images/build/**`, `${CORE}/cli/**`, '**/*.test.{ts,tsx}']

const configLoaderImport = {
	regex: '(^|/)config/loader(\\.(ts|mts|cts|js|mjs|cjs))?$',
	message: 'lib takes the site config as an argument; only tests read it through the loader.',
}

// besides the config layer, the declarations of the dictionaries the core ships: one JSON per
// locale of the default catalog, imported by name
const LOCALE_EXEMPT = [
	`${CORE}/config/**`,
	`${CORE}/i18n/dictionaries.ts`,
	`${CORE}/modules/*/manifest.ts`,
	'**/*.test.{ts,tsx}',
	'**/test-fixtures.ts',
	'**/fixtures/**',
]

// adapters may read sources; reusable computations cannot reach these modules at runtime.
const ADAPTERS = [
	'featured',
	'site-files',
	'variant-css',
	'banner/build-data',
	'cards/build-data',
	'content/build-data',
	'portfolio/build-data',
	'content/files',
	'content/localized-glob',
	'content/more-docs/resolve',
	'images/catalog',
	'images/public-config',
	'images/release',
	'images/build/config',
	'images/build/watermark-source',
	'portfolio/photo-page',
	'portfolio/footer-promo-build',
	'blocks/gallery/image-sets',
]
const COMPUTATIONS = [
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
const ioImport = {
	regex: '^(node:)?fs(/|$)|^astro:content$|^astro/loaders$',
	message:
		'Computations receive data as arguments; filesystem and Astro loaders belong in adapters.',
	allowTypeImports: true,
}
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const syntaxFor = (restriction) =>
	dynamicImport(`/${restriction.regex.replaceAll('/', '\\/')}/`, restriction.message)
// the site's ban on core internals, from the core's own preset, as a site gets it
const coreImports = deepImportRules()
const NO_EXTRA = { patterns: [], syntax: [] }
// a later object replaces a rule's whole list, so each exemption pair gets an object of its own: the
// last one matching a file carries every restriction that applies to it. `extra` carries prebuilt
// restrictions whose import patterns and selectors are already paired
const boundaries = (files, patterns, extra = NO_EXTRA) => {
	const rulesFor = (restrictions) => {
		const imports = [...restrictions, ...extra.patterns]
		return {
			syntax: [enumDeclaration, ...restrictions.flatMap(syntaxFor), ...extra.syntax],
			imports:
				imports.length > 0
					? { 'no-restricted-imports': ['error', { patterns: imports }] }
					: {},
		}
	}
	const base = rulesFor(patterns)
	const inCore = files.every((file) => file.startsWith(`${CORE}/`))
	const localeBans = inCore ? [...localeLiterals, catalogImport] : localeLiterals
	const objects = [
		{ files, rules: { ...base.imports, 'no-restricted-syntax': ['error', ...base.syntax] } },
		{
			files,
			ignores: LOCALE_EXEMPT,
			rules: { 'no-restricted-syntax': ['error', ...base.syntax, ...localeBans] },
		},
	]
	if (!inCore) return objects
	const build = rulesFor([...patterns, imageBuildImport])
	return [
		...objects,
		{
			files,
			ignores: IMAGE_BUILD_EXEMPT,
			rules: { ...build.imports, 'no-restricted-syntax': ['error', ...build.syntax] },
		},
		{
			files,
			ignores: [...LOCALE_EXEMPT, ...IMAGE_BUILD_EXEMPT],
			rules: { 'no-restricted-syntax': ['error', ...build.syntax, ...localeBans] },
		},
	]
}

export default defineConfig(
	// the recursive `**` keeps the ignores working when paths are passed explicitly, not only on `eslint .`
	{
		ignores: [
			'**/dist/',
			'**/.astro/',
			'**/.cache/',
			'**/playwright-report/',
			'**/test-results/',
			'**/node_modules/',
			'.claude/',
			'.agents/',
			'.cursor/',
			'_bmad/',
			'_bmad-output/',
		],
	},
	// the code style the core gives its sites, with typescript-eslint's recommended rules
	...(await astrumScenaStyle()),
	astro.configs.recommended,
	// the Astro integration entry default-exports
	{ files: [`${CORE}/index.ts`], rules: { 'no-restricted-exports': 'off' } },
	// the workspace holds several tsconfig roots, so typescript-eslint cannot infer which one to use
	{ languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
	{
		files: [`${CORE}/**/*.{ts,tsx,astro}`, `${SITE}/src/**/*.{ts,tsx,astro}`],
		// flat config: the exceptions must live in this same object, since a separate ignores-only block
		// does not turn off a rule already applied here. Only bracketed dynamic Astro routes are excluded
		// (`index.astro` and `404.astro` already satisfy KEBAB_CASE; a literal `[` in minimatch is `[[]`),
		// in the core's and the site's `src/pages` and in a module's own `pages`.
		ignores: [
			'**/src/pages/**/[[]*].astro',
			'**/src/pages/**/[[]*]/**',
			`${CORE}/modules/*/pages/**/[[]*].astro`,
			`${CORE}/modules/*/pages/**/[[]*]/**`,
		],
		plugins: { 'check-file': checkFile },
		rules: {
			'check-file/filename-naming-convention': [
				'error',
				{ '**/*.{ts,tsx,astro}': 'KEBAB_CASE' },
				// ui.test.ts and *.en.mdx are checked by the base name before the first dot
				{ ignoreMiddleExtensions: true },
			],
			'check-file/folder-naming-convention': [
				'error',
				{ [`${CORE}/**/`]: 'KEBAB_CASE', [`${SITE}/src/**/`]: 'KEBAB_CASE' },
			],
		},
	},
	...boundaries(['scripts/**'], []),
	// the demo is checked by the preset a site adds; its config also keeps the locale ban
	...astrumScenaEslint({ files: [`${SITE}/**`], syntax: [enumDeclaration] }),
	...boundaries([`${SITE}/astro.config.mjs`], [], coreImports),
	// e2e expectations come from the demo's config and the core dictionaries, so no e2e file, its
	// unit tests included, names a locale
	{
		files: ['e2e/**', 'playwright.config.ts'],
		rules: {
			'no-restricted-syntax': ['error', enumDeclaration, ...localeLiterals, catalogImport],
		},
	},
	// core files resolve from the package and site files from the site root; only the bin's entry reads
	// the current directory, to resolve `--root` against it
	{
		files: [`${CORE}/**`],
		ignores: [`${CORE}/cli/index.ts`],
		rules: {
			'no-restricted-properties': [
				'error',
				{
					object: 'process',
					property: 'cwd',
					message:
						'Resolve core files from CORE_ROOT and site files from the site root, never from process.cwd().',
				},
			],
		},
	},
	...boundaries([`${CORE}/**`], [scriptsImport, cliImport]),
	...boundaries([`${CORE}/cli/**`], [scriptsImport]),
	...boundaries(
		[`${CORE}/lib/**`],
		[scriptsImport, cliImport, siteConfigImport, configLoaderImport, componentsImport],
	),
	...boundaries(
		[`${CORE}/lib/**/*.test.ts`],
		[scriptsImport, cliImport, siteConfigImport, componentsImport],
	),
	...boundaries([`${CORE}/config/**`], [scriptsImport, cliImport, libImport]),
	...boundaries(
		ADAPTERS.map((name) => `${CORE}/lib/${name}.ts`),
		[scriptsImport, cliImport, componentsImport],
	),
	...COMPUTATIONS.flatMap((name) => {
		const adapters = ADAPTERS.flatMap((adapter) => {
			const relative = path.posix.relative(path.posix.dirname(name), adapter)
			return [relative.startsWith('.') ? relative : `./${relative}`, `@/lib/${adapter}`]
		})
		const adapterSuffixes = ADAPTERS.flatMap((adapter) => [
			adapter,
			adapter.split('/').slice(-2).join('/'),
		])
		const adapterImport = {
			regex: `(^(${adapters.map(escaped).join('|')})|(^|/)(${adapterSuffixes.map(escaped).join('|')}))(\\.(ts|mts|cts|js|mjs|cjs))?$`,
			message:
				'Computations must not import IO/Astro adapters; pass their results as arguments.',
			allowTypeImports: true,
		}
		return boundaries(
			[`${CORE}/lib/${name}.ts`],
			[
				scriptsImport,
				cliImport,
				siteConfigImport,
				configLoaderImport,
				componentsImport,
				ioImport,
				adapterImport,
			],
		)
	}),
)
