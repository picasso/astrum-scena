import { readdir } from 'node:fs/promises'
import path from 'node:path'

import { type CliContext, coreSrcDir, label } from '../context.ts'

// no test files under the core's `src/pages/`, a module's `src/modules/<id>/pages/` or the site's
// `src/pages/`. The integration injects every core page as a route and Astro's file-based routing
// serves the site's own, so a colocated `foo.test.ts` turns into `/foo.test` and breaks the build.
// Route tests live outside `src/pages/`.

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/

const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT'

async function collectTestFiles(directory: string): Promise<string[]> {
	let entries
	try {
		entries = await readdir(directory, { withFileTypes: true })
	} catch (error) {
		if (missing(error)) return []
		throw error
	}
	const found: string[] = []
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name)
		if (entry.isDirectory()) found.push(...(await collectTestFiles(entryPath)))
		else if (entry.isFile() && TEST_FILE.test(entry.name)) found.push(entryPath)
	}
	return found
}

// the pages of each module the core has, which the integration injects while a site enables it
async function modulePagesDirs(coreSrc: string): Promise<string[]> {
	try {
		const modules = await readdir(path.join(coreSrc, 'modules'), { withFileTypes: true })
		return modules
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join(coreSrc, 'modules', entry.name, 'pages'))
			.sort()
	} catch (error) {
		if (missing(error)) return []
		throw error
	}
}

export async function checkPages(context: CliContext): Promise<number> {
	const coreSrc = coreSrcDir(context)
	const pagesDirs = [
		path.join(coreSrc, 'pages'),
		...(await modulePagesDirs(coreSrc)),
		path.join(context.root, 'src', 'pages'),
	]
	const offenders: string[] = []
	for (const directory of pagesDirs)
		for (const file of await collectTestFiles(directory)) offenders.push(label(context, file))
	offenders.sort()
	const scanned = pagesDirs.map((directory) => `${label(context, directory)}/`).join(', ')
	if (offenders.length > 0) {
		context.err(
			`check pages FAILED — test files under ${scanned} become Astro routes and break the build:`,
		)
		for (const file of offenders) context.err(`  - ${file}`)
		context.err('Move route tests out of src/pages/ (e.g. into lib/ next to the route code).')
		return 1
	}
	context.out(`check pages OK (no test files under ${scanned})`)
	return 0
}
