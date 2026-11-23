import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CORE_ROOT } from '../../core-root.ts'
import { runAstrumScena } from '../test-fixtures.ts'

// a fixture core under `core/` at another version than this checkout, a site beside it; the bin runs
// in `site/`

const manifest = JSON.parse(readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8')) as {
	name: string
	repository: { url: string }
}
const NAME = manifest.name
const REPOSITORY = /github\.com\/(.+?)\.git$/.exec(manifest.repository.url)![1]!
const VERSION = '0.2.0'
const SHA = 'a'.repeat(40)
const reference = (ref: string, comment: string) =>
	`      uses: ${REPOSITORY}/.github/workflows/site.yml@${ref}${comment}`

let root: string
const site = () => path.join(root, 'site')

const write = (relative: string, text: string) => {
	const file = path.join(root, relative)
	mkdirSync(path.dirname(file), { recursive: true })
	writeFileSync(file, text)
}

const workflow = (...uses: string[]) =>
	write(
		'site/.github/workflows/ci.yml',
		['on: push', 'jobs:', '  site:', ...uses, '    secrets:', '      TOKEN: x', ''].join('\n'),
	)

const dependOn = (specifier: string) =>
	write('site/package.json', JSON.stringify({ dependencies: { [NAME]: specifier } }))

// the core in the site's node_modules as a link to `target`, a directory under `root`
function linkCore(target: string) {
	write(`${target}/package.json`, '{}')
	const link = path.join(site(), 'node_modules', ...NAME.split('/'))
	mkdirSync(path.dirname(link), { recursive: true })
	symlinkSync(path.join(root, target), link)
}
const installCore = () => linkCore(`site/node_modules/.pnpm/core@${VERSION}/node_modules/core`)
const pnpmLink = () => linkCore('linked-core')

const run = (env: Record<string, string> = {}) =>
	runAstrumScena(site(), ['check', 'core-version'], { coreRoot: path.join(root, 'core'), env })

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), 'core-version-'))
	write(
		'core/package.json',
		JSON.stringify({ name: NAME, version: VERSION, repository: manifest.repository }),
	)
	write('site/site.yaml', '')
	dependOn(`~${VERSION}`)
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('the workflow references to site.yml', () => {
	it('passes a reference pinned to a SHA whose comment names the installed core', async () => {
		workflow(
			reference(SHA, ` # v${VERSION}`),
			`      uses: "${REPOSITORY}/.github/workflows/site.yml@${SHA}" # v${VERSION}`,
		)
		const result = await run()
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain(
			`check core-version OK (the workflows run site.yml of ${NAME} ${VERSION})`,
		)
	})

	it('passes a site without workflows', async () => {
		const result = await run()
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('no workflow runs its site.yml')
	})

	it('ignores workflows of other repositories and the site its own', async () => {
		workflow(
			'      uses: ./.github/workflows/site.yml',
			'      uses: someone/else/.github/workflows/site.yml@main',
		)
		const result = await run()
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('no workflow runs its site.yml')
	})

	it('fails on a comment naming another version, with the path and both versions', async () => {
		workflow(reference(SHA, ' # v0.1.0'))
		const result = await run()
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			`.github/workflows/ci.yml:4: the comment names v0.1.0, the installed core is ${VERSION}`,
		)
	})

	it('fails on a reference without a version comment', async () => {
		workflow(reference(SHA, ''))
		const result = await run()
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`ci.yml:4: no "# v${VERSION}" comment`)
	})

	it.each(['main', `v${VERSION}`, SHA.slice(0, 7)])(
		'fails on site.yml@%s, which is no 40-hex SHA, with the path',
		async (ref) => {
			workflow(reference(ref, ` # v${VERSION}`))
			const result = await run()
			expect(result.status).toBe(1)
			expect(result.stderr).toContain(
				`.github/workflows/ci.yml:4: site.yml@${ref} must be pinned to a 40-hex commit SHA`,
			)
		},
	)
})

describe('the forms of a reference', () => {
	it.each([
		[
			'a quoted key',
			`      "uses": ${REPOSITORY}/.github/workflows/site.yml@main # v${VERSION}`,
		],
		[
			'a flow mapping',
			`  other: { uses: ${REPOSITORY}/.github/workflows/site.yml@main } # v${VERSION}`,
		],
	])('checks %s, failing on @main', async (_form, line) => {
		workflow(line)
		const result = await run()
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			'.github/workflows/ci.yml:4: site.yml@main must be pinned to a 40-hex commit SHA',
		)
	})

	it('reports a stale reference in a later workflow after a valid one', async () => {
		workflow(reference(SHA, ` # v${VERSION}`))
		write(
			'site/.github/workflows/release.yml',
			['on: push', 'jobs:', '  site:', reference(SHA, ' # v0.1.0'), ''].join('\n'),
		)
		const result = await run()
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			`.github/workflows/release.yml:4: the comment names v0.1.0, the installed core is ${VERSION}`,
		)
		expect(result.stderr).not.toContain('ci.yml')
	})
})

describe('the installed core in CI', () => {
	it('passes the core installed under node_modules', async () => {
		installCore()
		const result = await run({ CI: 'true' })
		expect(result.status, result.stderr).toBe(0)
	})

	it('fails on a core linked from outside node_modules, naming its real path', async () => {
		pnpmLink()
		const result = await run({ CI: 'true' })
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`node_modules/${NAME} resolves to `)
		expect(result.stderr).toContain(`${path.sep}linked-core, outside node_modules`)
	})

	it('fails on a site without the core installed', async () => {
		const result = await run({ CI: 'true' })
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`node_modules/${NAME}: missing`)
	})

	it('passes a linked core outside CI', async () => {
		pnpmLink()
		const result = await run()
		expect(result.status, result.stderr).toBe(0)
	})

	it('passes a workspace core in CI', async () => {
		dependOn('workspace:*')
		pnpmLink()
		const result = await run({ CI: 'true' })
		expect(result.status, result.stderr).toBe(0)
	})
})
