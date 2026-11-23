import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./check-api-breaking.ts', import.meta.url))
const SNAPSHOT = 'packages/core/api-snapshot'
// a run spawns git and Node several times
const TIMEOUT = 30_000

let root: string

const git = (...args: string[]) => {
	const result = spawnSync(
		'git',
		[
			'-c',
			'user.name=test',
			'-c',
			'user.email=test@localhost',
			'-c',
			'core.hooksPath=/dev/null',
			...args,
		],
		{ cwd: root, encoding: 'utf8' },
	)
	if (result.status !== 0) throw new Error(result.stderr)
}

const write = (file: string, content: string) => {
	mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
	writeFileSync(path.join(root, file), content)
}

const changelog = (...entries: string[]) =>
	write('CHANGELOG.md', ['# Changelog', '', '## [Unreleased]', '', ...entries, ''].join('\n'))

const transition = (heading: string) =>
	[
		`### ${heading}`,
		'',
		'**Before:** the old form.',
		'',
		'**After:** the new form.',
		'',
		'**Order:** before the build.',
		'',
		'**Writers:** none.',
		'',
		'**Verify:** `pnpm build` passes.',
		'',
	].join('\n')

const upgrading = (unreleased: string[], ...released: [string, ...string[]][]) =>
	write(
		'UPGRADING.md',
		[
			'# Upgrading',
			'',
			'## [Unreleased]',
			'',
			...unreleased,
			...released.flatMap(([version, ...entries]) => [
				`## [${version}] - 2026-11-06`,
				'',
				...entries,
			]),
		].join('\n'),
	)

const coreVersion = (version: string) =>
	write('packages/core/package.json', `${JSON.stringify({ version }, null, '\t')}\n`)

const repoVersion = (version: string) =>
	write('package.json', `${JSON.stringify({ version }, null, '\t')}\n`)

// a story release: `/ver` moves the [Unreleased] entries into the section of the repository version
const releasedChangelog = (version: string, ...entries: string[]) =>
	write(
		'CHANGELOG.md',
		[
			'# Changelog',
			'',
			'## [Unreleased]',
			'',
			`## [${version}] - 2026-11-07`,
			'',
			...entries,
			'',
		].join('\n'),
	)

const run = () =>
	spawnSync(process.execPath, ['--experimental-strip-types', script, '--base', 'main'], {
		cwd: root,
		encoding: 'utf8',
	})

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), 'api-breaking-'))
	git('init', '-q', '-b', 'main')
	write(`${SNAPSHOT}/i18n.json`, '["nav.home", "nav.portfolio"]\n')
	changelog()
	upgrading([])
	coreVersion('0.3.1')
	repoVersion('1.6.2')
	git('add', '.')
	git('commit', '-q', '-m', 'base')
	git('checkout', '-q', '-b', 'feature')
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

it(
	'passes a compatible change without a CHANGELOG entry',
	() => {
		write(`${SNAPSHOT}/i18n.json`, '["nav.home", "nav.portfolio", "nav.extra"]\n')
		const result = run()
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('i18n: nav.extra — added [compatible]')
	},
	TIMEOUT,
)

it(
	'fails a breaking change until a **Breaking:** entry in [Unreleased] names it',
	() => {
		write(`${SNAPSHOT}/i18n.json`, '["nav.home"]\n')
		const failed = run()
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain('i18n: nav.portfolio — removed [breaking]')

		changelog('### Removed', '', '- `nav.portfolio` is gone.')
		expect(run().status).toBe(1)

		changelog('### Removed', '', '- **Breaking:** the i18n key `nav.portfolio` is removed.')
		const untransitioned = run()
		expect(untransitioned.status).toBe(1)
		expect(untransitioned.stderr).toContain('breaking changes without an UPGRADING.md entry')
		expect(untransitioned.stderr).toContain('i18n: nav.portfolio — removed [breaking]')
		expect(untransitioned.stderr).not.toContain('without a CHANGELOG entry')

		upgrading([transition('`nav.portfolio`')])
		const passed = run()
		expect(passed.status, passed.stderr).toBe(0)
	},
	TIMEOUT,
)

// a site's src/overrides/logo.astro stops building once the core drops the point
it(
	'fails the removal of a replacement point until the CHANGELOG and UPGRADING.md name it',
	() => {
		git('checkout', '-q', 'main')
		write(`${SNAPSHOT}/replacement-points.json`, '["footer-copyright", "logo"]\n')
		git('add', '.')
		git('commit', '-q', '-m', 'points')
		git('checkout', '-q', 'feature')
		git('merge', '-q', 'main')
		write(`${SNAPSHOT}/replacement-points.json`, '["footer-copyright"]\n')
		const failed = run()
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain('replacement-points: logo — removed [breaking]')

		changelog('### Removed', '', '- **Breaking:** the replacement point `logo` is removed.')
		upgrading([transition('The `logo` replacement point')])
		const passed = run()
		expect(passed.status, passed.stderr).toBe(0)
	},
	TIMEOUT,
)

// a new route segment of a module may shadow a page of the site, so the module surface breaks on it
it(
	'fails a segment added to a module until the CHANGELOG and UPGRADING.md name it',
	() => {
		const modules = (segments: string[]) =>
			`${JSON.stringify({ courses: { namespace: 'courses', segments } })}\n`
		git('checkout', '-q', 'main')
		write(`${SNAPSHOT}/modules.json`, modules(['courses']))
		git('add', '.')
		git('commit', '-q', '-m', 'modules')
		git('checkout', '-q', 'feature')
		git('merge', '-q', 'main')
		write(`${SNAPSHOT}/modules.json`, modules(['courses', 'workshops']))
		const failed = run()
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain('modules: courses.segments.workshops — added [breaking]')

		changelog('- **Breaking:** the courses module serves `courses.segments.workshops`.')
		upgrading([transition('`courses.segments.workshops`')])
		const passed = run()
		expect(passed.status, passed.stderr).toBe(0)
	},
	TIMEOUT,
)

// a site's package script stops working once the bin drops a command or an option of it
it(
	'fails the removal of a CLI command until the CHANGELOG and UPGRADING.md name it, and passes an addition',
	() => {
		const cli = (...commands: string[]) => `${JSON.stringify(commands)}\n`
		git('checkout', '-q', 'main')
		write(
			`${SNAPSHOT}/cli.json`,
			cli('astrum-scena check pages', 'astrum-scena check pages --root <dir>'),
		)
		git('add', '.')
		git('commit', '-q', '-m', 'cli')
		git('checkout', '-q', 'feature')
		git('merge', '-q', 'main')

		write(
			`${SNAPSHOT}/cli.json`,
			cli(
				'astrum-scena check pages',
				'astrum-scena check pages --root <dir>',
				'astrum-scena check routes',
			),
		)
		const added = run()
		expect(added.status, added.stderr).toBe(0)
		expect(added.stdout).toContain('cli: astrum-scena check routes — added [compatible]')

		write(`${SNAPSHOT}/cli.json`, cli('astrum-scena check pages'))
		const failed = run()
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain(
			'cli: astrum-scena check pages --root <dir> — removed [breaking]',
		)

		changelog('- **Breaking:** `astrum-scena check pages --root <dir>` is removed.')
		upgrading([transition('`astrum-scena check pages --root <dir>`')])
		const passed = run()
		expect(passed.status, passed.stderr).toBe(0)
	},
	TIMEOUT,
)

it(
	'compares against the merge base, not the tip of the base branch',
	() => {
		git('checkout', '-q', 'main')
		write(`${SNAPSHOT}/i18n.json`, '["nav.home"]\n')
		git('commit', '-q', '-am', 'main moves on')
		git('checkout', '-q', 'feature')
		expect(run().status).toBe(0)
	},
	TIMEOUT,
)

it(
	'reports a removal both branches made after the fork, which the base tip would hide',
	() => {
		git('checkout', '-q', 'main')
		write(`${SNAPSHOT}/i18n.json`, '["nav.home"]\n')
		git('commit', '-q', '-am', 'main removes the key')
		git('checkout', '-q', 'feature')
		write(`${SNAPSHOT}/i18n.json`, '["nav.home"]\n')
		git('commit', '-q', '-am', 'feature removes the key too')

		const failed = run()
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain('i18n: nav.portfolio — removed [breaking]')

		changelog('### Removed', '', '- **Breaking:** the i18n key `nav.portfolio` is removed.')
		upgrading([transition('`nav.portfolio`')])
		const passed = run()
		expect(passed.status, passed.stderr).toBe(0)
	},
	TIMEOUT,
)

it(
	'takes a surface the merge base has no snapshot of as new',
	() => {
		write(`${SNAPSHOT}/directives.json`, '["note"]\n')
		expect(run().status).toBe(0)
	},
	TIMEOUT,
)

it(
	'requires an entry for a new required token, not for a new optional one',
	() => {
		git('checkout', '-q', 'main')
		write(`${SNAPSHOT}/tokens.json`, '{ "--color-ink": "required" }\n')
		git('add', '.')
		git('commit', '-q', '-m', 'tokens')
		git('checkout', '-q', '-b', 'tokens')

		write(`${SNAPSHOT}/tokens.json`, '{ "--color-ink": "required", "--gap": "optional" }\n')
		const optional = run()
		expect(optional.status, optional.stderr).toBe(0)
		expect(optional.stdout).toContain('tokens: --gap — added (optional) [compatible]')

		write(`${SNAPSHOT}/tokens.json`, '{ "--color-ink": "required", "--gap": "required" }\n')
		const required = run()
		expect(required.status).toBe(1)
		expect(required.stderr).toContain(
			'tokens: --gap — added, the theme must define it [breaking]',
		)
		changelog('- **Breaking:** themes must define `--gap`.')
		upgrading([transition('`--gap`')])
		expect(run().status).toBe(0)
	},
	TIMEOUT,
)

it(
	'does not take an UPGRADING.md entry for a longer name, or one of a released section, as naming it',
	() => {
		write(`${SNAPSHOT}/i18n.json`, '["nav.home"]\n')
		changelog('- **Breaking:** the i18n key `nav.portfolio` is removed.')
		upgrading([transition('`nav.portfolio-extra`')], ['0.3.0', transition('`nav.portfolio`')])
		const failed = run()
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain('breaking changes without an UPGRADING.md entry')
	},
	TIMEOUT,
)

it(
	'leaves compatible changes alone when UPGRADING.md is untouched',
	() => {
		write(`${SNAPSHOT}/i18n.json`, '["nav.home", "nav.portfolio", "nav.extra"]\n')
		coreVersion('0.3.2')
		const result = run()
		expect(result.status, result.stderr).toBe(0)
	},
	TIMEOUT,
)

it(
	'takes a 0.y.z bump with transitions for the breaking release, which needs its section',
	() => {
		coreVersion('0.3.2')
		upgrading([transition('`nav.portfolio`')])
		const unreleased = run()
		expect(unreleased.status).toBe(1)
		expect(unreleased.stderr).toContain('needs a `## [0.3.2]` section in UPGRADING.md')

		upgrading([], ['0.3.2', transition('`nav.portfolio`')])
		const section = run()
		expect(section.status, section.stderr).toBe(0)
	},
	TIMEOUT,
)

it(
	'requires an UPGRADING.md section for 1.0.0 and passes with it',
	() => {
		coreVersion('1.0.0')
		const missing = run()
		expect(missing.status).toBe(1)
		expect(missing.stderr).toContain('needs a `## [1.0.0]` section in UPGRADING.md')

		upgrading([], ['1.0.0', transition('`nav.portfolio`')])
		const passed = run()
		expect(passed.status, passed.stderr).toBe(0)
	},
	TIMEOUT,
)

it(
	'takes the section of the bumped version as naming the breaking changes of the release',
	() => {
		write(`${SNAPSHOT}/i18n.json`, '["nav.home"]\n')
		changelog('- **Breaking:** the i18n key `nav.portfolio` is removed.')
		coreVersion('0.4.0')
		upgrading([], ['0.4.0', transition('`nav.portfolio`')])
		const passed = run()
		expect(passed.status, passed.stderr).toBe(0)
	},
	TIMEOUT,
)

it(
	'accepts a **Breaking:** entry in the section of the repository version this branch bumps to',
	() => {
		write(`${SNAPSHOT}/i18n.json`, '["nav.home"]\n')
		upgrading([transition('`nav.portfolio`')])
		releasedChangelog('1.6.3', '- **Breaking:** the i18n key `nav.portfolio` is removed.')
		const unbumped = run()
		expect(unbumped.status).toBe(1)
		expect(unbumped.stderr).toContain('breaking changes without a CHANGELOG entry')
		expect(unbumped.stderr).toContain('under `## [Unreleased]`')

		repoVersion('1.6.3')
		const released = run()
		expect(released.status, released.stderr).toBe(0)
	},
	TIMEOUT,
)

it(
	'does not accept an entry in the section of another repository version',
	() => {
		write(`${SNAPSHOT}/i18n.json`, '["nav.home"]\n')
		upgrading([transition('`nav.portfolio`')])
		repoVersion('1.6.4')
		releasedChangelog('1.6.3', '- **Breaking:** the i18n key `nav.portfolio` is removed.')
		const failed = run()
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain('breaking changes without a CHANGELOG entry')
		expect(failed.stderr).toContain('under `## [1.6.4]`')
	},
	TIMEOUT,
)

const onMain = (change: () => void) => {
	git('checkout', '-q', 'main')
	change()
	git('add', '.')
	git('commit', '-q', '-m', 'main')
	git('checkout', '-q', '-b', 'release')
}

it(
	'fails a patch bump that drops [Unreleased] entries the merge base already has',
	() => {
		onMain(() => upgrading([transition('`nav.portfolio`')]))
		coreVersion('0.3.2')
		upgrading([])
		const failed = run()
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain('UPGRADING.md entries of the merge base are gone')
		expect(failed.stderr).toContain('`nav.portfolio`')
		expect(failed.stderr).toContain('needs a `## [0.3.2]` section in UPGRADING.md')
	},
	TIMEOUT,
)

it(
	'fails when a released section of the merge base is deleted',
	() => {
		onMain(() => {
			coreVersion('0.4.0')
			upgrading([], ['0.4.0', transition('`nav.portfolio`')])
		})
		upgrading([])
		const failed = run()
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain('UPGRADING.md entries of the merge base are gone')
	},
	TIMEOUT,
)

it(
	'does not take a name in the body of another entry as an UPGRADING.md entry for it',
	() => {
		write(`${SNAPSHOT}/i18n.json`, '["nav.home"]\n')
		changelog('- **Breaking:** the i18n key `nav.portfolio` is removed.')
		upgrading([transition('`nav.other`').replace('the old form', 'the old `nav.portfolio`')])
		const failed = run()
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain('breaking changes without an UPGRADING.md entry')
	},
	TIMEOUT,
)

it(
	'fails a breaking change the CHANGELOG does not mark, even with its UPGRADING.md entry',
	() => {
		write(`${SNAPSHOT}/i18n.json`, '["nav.home"]\n')
		upgrading([transition('`nav.portfolio`')])
		const missing = run()
		expect(missing.status).toBe(1)
		expect(missing.stderr).toContain('without a CHANGELOG entry')
		expect(missing.stderr).not.toContain('without an UPGRADING.md entry')

		changelog('### Removed', '', '- `nav.portfolio` is gone.')
		const unmarked = run()
		expect(unmarked.status).toBe(1)
		expect(unmarked.stderr).toContain('without a CHANGELOG entry')
	},
	TIMEOUT,
)
