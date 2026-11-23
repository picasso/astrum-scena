import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

// the config files of a site that extend the presets of the core. `astrum-scena install` writes one only
// when the site has no config of that tool; an existing one is the site's and is never overwritten, and
// install only warns when it does not name the core's preset

export type PresetConfig = {
	tool: string
	// the core's entry point the config extends, after the package name
	entry: string
	// the file install writes
	file: string
	// every name the tool reads its config from, the written one among them
	candidates: readonly string[]
	// the key of the site's package.json the tool also reads its config from
	packageKey?: string
	content: (packageName: string) => string
}

const SCRIPT_EXTENSIONS = ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts']

export const PRESET_CONFIGS: readonly PresetConfig[] = [
	{
		tool: 'ESLint',
		entry: 'eslint',
		file: 'eslint.config.mjs',
		candidates: SCRIPT_EXTENSIONS.map((extension) => `eslint.config.${extension}`),
		content: (name) =>
			[
				'import {',
				'\tastrumScenaEslint,',
				'\tastrumScenaStyle,',
				'\tenumDeclaration,',
				`} from '${name}/eslint'`,
				'',
				"// the core's presets: its code style (on typescript-eslint and eslint-plugin-simple-import-sort),",
				'// no inline config comments, and imports of the core only through its entry points',
				'export default [',
				"\t{ ignores: ['dist/', '.astro/'] },",
				'\t...(await astrumScenaStyle()),',
				'\t...astrumScenaEslint({ syntax: [enumDeclaration] }),',
				']',
				'',
			].join('\n'),
	},
	{
		tool: 'Prettier',
		entry: 'prettier',
		file: 'prettier.config.mjs',
		candidates: [
			...SCRIPT_EXTENSIONS.map((extension) => `prettier.config.${extension}`),
			'.prettierrc',
			...['json', 'json5', 'yaml', 'yml', 'toml', ...SCRIPT_EXTENSIONS].map(
				(extension) => `.prettierrc.${extension}`,
			),
		],
		packageKey: 'prettier',
		content: (name) =>
			[
				`import { astrumScenaPrettier } from '${name}/prettier'`,
				'',
				'export default astrumScenaPrettier',
				'',
			].join('\n'),
	},
	{
		tool: 'TypeScript',
		entry: 'tsconfig.json',
		file: 'tsconfig.json',
		candidates: ['tsconfig.json'],
		content: (name) =>
			[
				'{',
				`\t"extends": "${name}/tsconfig.json",`,
				'\t"include": [".astro/types.d.ts", "**/*"],',
				'\t"exclude": ["dist"]',
				'}',
				'',
			].join('\n'),
	},
	{
		tool: 'markdownlint',
		entry: 'markdownlint.json',
		file: '.markdownlint.json',
		candidates: [
			...['json', 'jsonc', 'yaml', 'yml', 'cjs', 'mjs'].map(
				(extension) => `.markdownlint.${extension}`,
			),
			...['jsonc', 'yaml', 'cjs', 'mjs'].map(
				(extension) => `.markdownlint-cli2.${extension}`,
			),
		],
		content: (name) => ['{', `\t"extends": "${name}/markdownlint.json"`, '}', ''].join('\n'),
	},
]

export type ConfigPlan =
	| { config: PresetConfig; action: 'write'; content: string }
	// the site's own configs of the tool that do not name the preset
	| { config: PresetConfig; action: 'keep'; foreign: string[] }

const PACKAGE_FILE = 'package.json'

// the text of each config of the tool the site has, by its file; a config in a key of package.json
// is named by that file
function existingConfigs(root: string, config: PresetConfig): Map<string, string> {
	const found = new Map(
		config.candidates
			.filter((file) => existsSync(path.join(root, file)))
			.map((file) => [file, readFileSync(path.join(root, file), 'utf8')] as const),
	)
	const manifest = path.join(root, PACKAGE_FILE)
	if (config.packageKey !== undefined && existsSync(manifest)) {
		const value = (JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, unknown>)[
			config.packageKey
		]
		if (value !== undefined) found.set(PACKAGE_FILE, JSON.stringify(value))
	}
	return found
}

export function planConfigs(root: string, packageName: string): ConfigPlan[] {
	return PRESET_CONFIGS.map((config): ConfigPlan => {
		const existing = existingConfigs(root, config)
		if (existing.size === 0)
			return { config, action: 'write', content: config.content(packageName) }
		const specifier = `${packageName}/${config.entry}`
		const foreign = [...existing]
			.filter(([, text]) => !text.includes(specifier))
			.map(([file]) => file)
		return { config, action: 'keep', foreign }
	})
}
