import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

import { type CliContext, label } from '../context.ts'

// a site runs the core's reusable workflow at the version it installs: every reference of its
// workflows to the core's `site.yml` is pinned to a commit SHA whose `# v<version>` comment names the
// installed core, and in CI the core comes from the site's lockfile, never from `pnpm link`. The
// skills stamp is the gate `skills`, not this one. The SHA is not matched against the tag: that
// needs the network

const WORKFLOWS_DIR = '.github/workflows'
const WORKFLOW_FILE = /\.ya?ml$/
const SHA = /^[0-9a-f]{40}$/
// a `uses` key, bare or quoted, at the start of a line (after `- `) or inside a flow mapping, and its
// value; the comment is the trailing `# …` of the line
const USES = /(?:^|[{,])\s*(?:-\s+)?(['"]?)uses\1\s*:\s*(['"]?)([^\s'"#,{}]+)\2/g
const COMMENT = /\s#\s*(.*?)\s*$/
const GITHUB_REPOSITORY = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/i

type CoreManifest = {
	name: string
	version: string
	repository?: string | { url?: string }
}

type SiteManifest = Partial<
	Record<'dependencies' | 'devDependencies', Record<string, string | undefined>>
>

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T

// `<owner>/<repo>` of the core's GitHub repository, from its package.json
function coreRepository(manifest: CoreManifest): string {
	const url =
		typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
	const repository = url === undefined ? undefined : GITHUB_REPOSITORY.exec(url)?.[1]
	if (repository === undefined)
		throw new Error(`${manifest.name} names no GitHub repository in its package.json`)
	return repository
}

function workflowProblems(context: CliContext, core: CoreManifest): string[] | undefined {
	const directory = path.join(context.root, WORKFLOWS_DIR)
	if (!existsSync(directory)) return undefined
	const prefix = `${coreRepository(core).toLowerCase()}/.github/workflows/site.yml@`
	const expected = `v${core.version}`
	const problems: string[] = []
	let references = 0
	for (const file of readdirSync(directory)
		.filter((name) => WORKFLOW_FILE.test(name))
		.sort()) {
		const workflow = path.join(directory, file)
		readFileSync(workflow, 'utf8')
			.split('\n')
			.forEach((line, index) => {
				const comment = COMMENT.exec(line)?.[1]
				for (const [, , , target] of line.matchAll(USES)) {
					if (target === undefined || !target.toLowerCase().startsWith(prefix)) continue
					references++
					const where = `${label(context, workflow)}:${index + 1}`
					const ref = target.slice(prefix.length)
					if (!SHA.test(ref))
						problems.push(
							`${where}: site.yml@${ref} must be pinned to a 40-hex commit SHA`,
						)
					if (comment !== expected)
						problems.push(
							comment === undefined || comment === ''
								? `${where}: no "# ${expected}" comment; the installed core is ${core.version}`
								: `${where}: the comment names ${comment}, the installed core is ${core.version}`,
						)
				}
			})
	}
	return references === 0 ? undefined : problems
}

// a site in the core's own monorepo (the demo) takes the core from the workspace by design
function fromWorkspace(context: CliContext, name: string): boolean {
	const file = path.join(context.root, 'package.json')
	if (!existsSync(file)) return false
	const manifest = readJson<SiteManifest>(file)
	const specifier = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]
	return specifier?.startsWith('workspace:') ?? false
}

function installProblem(context: CliContext, name: string): string | undefined {
	if (context.env.CI !== 'true' || fromWorkspace(context, name)) return undefined
	const modules = path.join(context.root, 'node_modules')
	const installed = path.join(modules, ...name.split('/'))
	if (!existsSync(installed)) return `${label(context, installed)}: missing`
	const real = realpathSync(installed)
	if (real.startsWith(realpathSync(modules) + path.sep)) return undefined
	return `${label(context, installed)} resolves to ${real}, outside ${label(context, modules)}: CI installs the core from the site's lockfile, not through pnpm link`
}

export function checkCoreVersion(context: CliContext): number {
	const core = readJson<CoreManifest>(path.join(context.coreRoot, 'package.json'))
	const workflows = workflowProblems(context, core)
	const install = installProblem(context, core.name)
	const problems = [...(workflows ?? []), ...(install === undefined ? [] : [install])]
	if (problems.length > 0) {
		context.err(`check core-version FAIL: the site does not run ${core.name} ${core.version}:`)
		for (const line of problems) context.err(`  ${line}`)
		return 1
	}
	context.out(
		workflows === undefined
			? `check core-version OK (${core.name} ${core.version}, no workflow runs its site.yml)`
			: `check core-version OK (the workflows run site.yml of ${core.name} ${core.version})`,
	)
	return 0
}
