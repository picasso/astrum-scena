import { execFileSync } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { CORE_SRC } from './lib/site-root.ts'

// gate: the taxonomy files of a site are read only by their loaders in the core (one loader, schema and
// path per file), so a consumer such as GPS bounds over the places cannot grow a second reader with its
// own path and parsing. A dimension's dictionary is named by its id, so a path into
// `src/content/config/` built at runtime is one of them. Tests and fixtures name the files to build
// sites and are exempt.

const LOADER_FILE = `${CORE_SRC}/lib/content/files.ts`
const GATE_FILE = 'scripts/check-taxonomy-readers.ts'
const SCANNED_TREES = [CORE_SRC, 'scripts']
const LOADERS = 'loadCategoriesConfig, loadPlacesConfig, loadTagsConfig or loadDimensionConfig'

const TAXONOMY_FILE =
	/(?<![\w.-])(?:categories|places|tags)\.ya?ml(?![\w.-])|content\/config\/\$\{[^}]*\}/g
const CODE_FILE = /\.(?:[cm]?[jt]sx?|astro)$/
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/
const FIXTURE_NAMES = new Set(['test-fixtures', '__fixtures__'])

export function isScanned(file: string): boolean {
	if (file === LOADER_FILE || file === GATE_FILE) return false
	if (!CODE_FILE.test(file) || TEST_FILE.test(file)) return false
	return !file.split('/').some((segment) => FIXTURE_NAMES.has(segment.replace(/\..*$/, '')))
}

export function findTaxonomyReaders(
	file: string,
	source: string,
): { file: string; line: number; name: string }[] {
	return source.split(/\r\n|\r|\n/).flatMap((text, index) =>
		[...text.matchAll(TAXONOMY_FILE)].map((match) => ({
			file,
			line: index + 1,
			name: match[0],
		})),
	)
}

function repositoryFiles(): string[] {
	const output = execFileSync(
		'git',
		['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...SCANNED_TREES],
		{ encoding: 'utf8' },
	)
	return output.split('\0').filter(Boolean)
}

async function main(): Promise<void> {
	const offenders: string[] = []
	for (const file of repositoryFiles().filter(isScanned)) {
		const stats = await lstat(file).catch(() => null)
		if (stats?.isSymbolicLink()) continue
		// a file deleted in the working tree has nothing to scan; any other read error fails the gate
		const source = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
			if (error.code === 'ENOENT') return null
			throw error
		})
		if (source === null) continue
		for (const { line, name } of findTaxonomyReaders(file, source))
			offenders.push(`${file}:${line}: ${name}`)
	}
	if (offenders.length > 0) {
		console.error('check:taxonomy-readers FAILED — taxonomy files named outside their loaders:')
		for (const offender of offenders) console.error(`  - ${offender}`)
		console.error(`Read them through ${LOADERS} from ${LOADER_FILE}.`)
		process.exitCode = 1
		return
	}
	console.log('check:taxonomy-readers OK')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
