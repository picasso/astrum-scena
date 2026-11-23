import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// publishes every non-private workspace package of `packages/*` from its `pnpm pack` tarball, the
// artifact the demo installs: pnpm has already rewritten `workspace:` ranges there, which `npm publish`
// of the package directory would not. A version npm already has is skipped, so a re-run after a
// partial failure only publishes what is missing. Every check runs before the first publish, so a
// version mismatch, a missing tarball, an old npm or a registry failure publishes nothing.
// Trusted publishing (OIDC, provenance on by itself) needs npm 11.5.1 or newer.

const ROOT = fileURLToPath(new URL('..', import.meta.url))
export const MIN_NPM_VERSION = '11.5.1'

export type NpmResult = { status: number | null; stdout: string; stderr: string }
export type Npm = (args: readonly string[]) => NpmResult
export type PublishablePackage = { name: string; version: string }
export type ReleaseOptions = {
	dryRun: boolean
	packDir: string
	root?: string
	npm?: Npm
	log?: (line: string) => void
}

type Manifest = { name?: string; version?: string; private?: boolean }

export function publishablePackages(root: string): PublishablePackage[] {
	const packages = join(root, 'packages')
	return readdirSync(packages, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(packages, entry.name, 'package.json'))
		.filter((file) => existsSync(file))
		.map((file) => JSON.parse(readFileSync(file, 'utf8')) as Manifest)
		.filter((manifest) => manifest.private !== true)
		.map((manifest) => {
			if (!manifest.name || !manifest.version)
				throw new Error(`a package in ${packages} has no name or version`)
			return { name: manifest.name, version: manifest.version }
		})
		.sort((a, b) => a.name.localeCompare(b.name))
}

export function sharedVersion(packages: readonly PublishablePackage[]): string {
	if (packages.length === 0) throw new Error('no publishable package in packages/*')
	const versions = new Set(packages.map((pkg) => pkg.version))
	if (versions.size > 1)
		throw new Error(
			`publishable packages must share one version: ${packages
				.map((pkg) => `${pkg.name}@${pkg.version}`)
				.join(', ')}`,
		)
	return packages[0]!.version
}

const numericParts = (version: string): number[] =>
	version
		.trim()
		.split(/[-+]/)[0]!
		.split('.')
		.map((part) => Number(part))

export function isNpmRecentEnough(version: string, minimum = MIN_NPM_VERSION): boolean {
	const actual = numericParts(version)
	const wanted = numericParts(minimum)
	if (actual.length !== 3 || actual.some((part) => !Number.isInteger(part))) return false
	for (let index = 0; index < 3; index++)
		if (actual[index] !== wanted[index]) return actual[index]! > wanted[index]!
	return true
}

// the file name `pnpm pack` gives a package: the scope's `@` dropped and its `/` turned into `-`
export const tarballName = ({ name, version }: PublishablePackage): string =>
	`${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`

export function findTarball(packDir: string, pkg: PublishablePackage): string {
	const file = join(packDir, tarballName(pkg))
	if (!existsSync(file))
		throw new Error(`no tarball for ${pkg.name}@${pkg.version}: ${file} is missing`)
	return file
}

const npmOutput = ({ status, stdout, stderr }: NpmResult): string =>
	[`exit ${status}`, stdout.trim(), stderr.trim()].filter(Boolean).join('\n')

// `npm view <name>@<version> version` prints the version when it exists and fails with E404 when the
// package or the version does not; any other outcome is a registry failure
export function isPublished(npm: Npm, pkg: PublishablePackage): boolean {
	const spec = `${pkg.name}@${pkg.version}`
	const result = npm(['view', spec, 'version'])
	if (result.status === 0 && result.stdout.trim() !== '') return true
	if (result.status !== 0 && /^npm (?:error|ERR!) code E404$/m.test(result.stderr)) return false
	throw new Error(`npm view ${spec} failed:\n${npmOutput(result)}`)
}

export function release({
	dryRun,
	packDir,
	root = ROOT,
	npm = runNpm,
	log = console.log,
}: ReleaseOptions): void {
	const packages = publishablePackages(root)
	sharedVersion(packages)
	const npmVersion = npm(['--version'])
	if (npmVersion.status !== 0) throw new Error(`npm --version failed:\n${npmOutput(npmVersion)}`)
	if (!isNpmRecentEnough(npmVersion.stdout))
		throw new Error(
			`npm ${npmVersion.stdout.trim()} cannot publish through trusted publishing; ${MIN_NPM_VERSION} or newer is needed`,
		)
	const plan = packages.map((pkg) => ({
		pkg,
		tarball: findTarball(packDir, pkg),
		published: isPublished(npm, pkg),
	}))
	for (const { pkg, tarball, published } of plan) {
		const spec = `${pkg.name}@${pkg.version}`
		if (published) {
			log(`skip ${spec}: already published`)
			continue
		}
		log(`publish ${spec}${dryRun ? ' (dry-run)' : ''}`)
		const result = npm(['publish', tarball, ...(dryRun ? ['--dry-run'] : [])])
		if (result.stdout.trim()) log(result.stdout.trim())
		if (result.stderr.trim()) console.error(result.stderr.trim())
		if (result.status !== 0)
			throw new Error(`npm publish ${spec} failed (exit ${result.status})`)
	}
}

function runNpm(args: readonly string[]): NpmResult {
	const result = spawnSync('npm', args, { encoding: 'utf8' })
	if (result.error) throw result.error
	return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

export function parseArgs(argv: readonly string[]): { dryRun: boolean; packDir: string } {
	let dryRun = false
	let packDir: string | undefined
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]
		if (arg === '--dry-run') dryRun = true
		else if (arg === '--pack-dir') {
			const value = argv[++index]
			if (!value || value.startsWith('--')) throw new Error('--pack-dir needs a directory')
			packDir = resolve(value)
		} else throw new Error(`unknown argument: ${arg}`)
	}
	if (!packDir) throw new Error('--pack-dir <dir> is required')
	return { dryRun, packDir }
}

function main(): void {
	try {
		release(parseArgs(process.argv.slice(2)))
	} catch (error) {
		console.error(error instanceof Error ? error.message : error)
		process.exitCode = 1
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
