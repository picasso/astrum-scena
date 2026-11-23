import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import {
	checkCommitMessage,
	identityViolations,
	parseScopes,
	parseTypes,
} from './check-commit-msg.ts'

// samples are assembled from parts, so this file does not trip the gate it tests
const OWNER = ['Acme', 'Owner'].join(' ')
const LEAKED_URL = ['https:', '', 'owner-site.dev', 'about'].join('/')

const SCOPES = ['alpha', 'beta-two']
const TYPES = ['feat', 'fix', 'chore', 'refactor']
const check = (message: string) => checkCommitMessage(message, { types: TYPES, scopes: SCOPES })

describe('parseScopes', () => {
	it('reads backtick tokens between "scopes:" and the dash in the Commits section', () => {
		const agentsMd = [
			'## Other',
			'',
			'- the scopes: `wrong` — elsewhere',
			'',
			'## Commits',
			'',
			'- this repo defines only the scopes:',
			'  `alpha` · `beta-two` —',
			'  domain scopes only, `not-a-scope`.',
			'',
			'## Next',
		].join('\n')
		expect(parseScopes(agentsMd)).toEqual(SCOPES)
		expect(parseScopes(agentsMd.replaceAll('\n', '\r\n'))).toEqual(SCOPES)
	})

	it('fails closed on a missing, empty or malformed list', () => {
		expect(() => parseScopes('## Other\n\nscopes: `alpha` —\n')).toThrow()
		expect(() => parseScopes('## Commits\n\n- the scopes: none —\n')).toThrow()
		expect(() => parseScopes('## Commits\n\n- the scopes: `alpha` `beta`\n')).toThrow()
		expect(() => parseScopes('## Commits\n\n- the scopes: `Bad Scope` —\n')).toThrow()
	})

	it('reads non-empty kebab-case type and scope lists from the real AGENTS.md', () => {
		const agentsMd = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8')
		for (const list of [parseTypes(agentsMd), parseScopes(agentsMd)]) {
			expect(list.length).toBeGreaterThan(0)
			for (const item of list) expect(item).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
		}
	})
})

describe('parseTypes', () => {
	it('reads backtick tokens between "types:" and the dash, apart from the scopes', () => {
		const agentsMd = [
			'## Commits',
			'',
			'- the types:',
			'  `feat` · `fix` — conventional; and the scopes:',
			'  `alpha` —',
			'',
		].join('\n')
		expect(parseTypes(agentsMd)).toEqual(['feat', 'fix'])
		expect(parseScopes(agentsMd)).toEqual(['alpha'])
	})

	it('fails closed on a missing or malformed list', () => {
		expect(() =>
			parseTypes('## Commits\n\n- the types: `feat` `fix` and the scopes: `alpha` —\n'),
		).toThrow()
		expect(() => parseTypes('## Commits\n\n- the scopes: `alpha` —\n')).toThrow()
		expect(() => parseTypes('## Commits\n\n- the types: `Feat` —\n')).toThrow()
		expect(() => parseTypes('## Commits\n\n- the types: `feat` `fix`\n')).toThrow()
	})
})

describe('checkCommitMessage', () => {
	it('accepts listed types and scopes, no scope and the breaking marker', () => {
		expect(check('feat(alpha): add toggle')).toEqual([])
		expect(check('fix(beta-two)!: drop field')).toEqual([])
		expect(check('chore: bump version to 1.5.9')).toEqual([])
		expect(check('refactor!: drop field')).toEqual([])
	})

	it('rejects an unlisted type and names the allowed ones', () => {
		expect(check('wip(alpha): x')).toEqual([
			'type "wip" is not allowed; use one of: feat, fix, chore, refactor',
		])
		expect(check('Feat(alpha): x')).toHaveLength(1)
		expect(check('build-deps(gallery): x')).toHaveLength(2)
	})

	it('rejects a header without a type, a space after the colon or a subject', () => {
		for (const header of [
			'add toggle',
			'feat(alpha):x',
			'feat(alpha):',
			'feat(alpha):\tx',
			'feat(alpha)  : x',
			'feat (alpha): x',
			': x',
			'',
		])
			expect(check(header), header).toHaveLength(1)
	})

	it('rejects unlisted, multiple and empty scopes and names the allowed ones', () => {
		expect(check('feat(gallery): x')).toEqual([
			'scope "gallery" is not allowed; use one of: alpha, beta-two',
		])
		for (const header of [
			'fix(alpha,beta-two): x',
			'fix(alpha beta-two): x',
			'feat(): x',
			'feat(gallery)!: x',
		])
			expect(check(header)).toHaveLength(1)
	})

	it('accepts messages git writes itself: merge, revert, fixup, squash and amend', () => {
		expect(check("Merge branch 'main' into feat/x")).toEqual([])
		expect(check("Merge remote-tracking branch 'origin/main' into feat/x")).toEqual([])
		expect(check('Merge pull request #30 from owner/branch')).toEqual([])
		expect(check('amend! feat(gallery): x')).toEqual([])
		expect(check('Revert "feat(gallery): x"\n\nThis reverts commit abc.')).toEqual([])
		expect(check('fixup! feat(gallery): x')).toEqual([])
		expect(check('squash! feat(gallery): x')).toEqual([])
	})

	it('rejects AI co-authors in any case', () => {
		for (const trailer of [
			'Co-authored-by: Claude Opus 5.5 <noreply@anthropic.com>',
			'Co-authored-by: Codex <codex@openai.com>',
			'Co-authored-by: Cursor Agent <cursoragent@cursor.com>',
			'co-authored-by: Copilot <198982749+Copilot@users.noreply.github.com>',
			'CO-AUTHORED-BY: Gemini <gemini@google.com>',
			'Co-authored-by: bot <noreply@chatgpt.com>',
			'Co-authored-by : Codex <codex@openai.com>',
		])
			expect(check(`feat(alpha): x\n\nBody.\n\n${trailer}`)).toHaveLength(1)
	})

	it('rejects an AI tool in any trailer, not only Co-authored-by', () => {
		for (const trailer of [
			'Assisted-by: Claude',
			'Signed-off-by: Codex <codex@openai.com>',
			'Generated-by: Cursor',
			'AI-Assistant: GPT-5',
		])
			expect(check(`feat(alpha): x\n\n${trailer}`), trailer).toHaveLength(1)
		expect(check('fix: x\n\nSigned-off-by: Jane <jane@x.dev>')).toEqual([])
		expect(check('fix: x\n\nThe cursor: now moves.')).toEqual([])
	})

	it('rejects an AI tool in a single-word trailer of the final trailer paragraph only', () => {
		expect(check('feat: x\n\nBody.\n\nAssistant: Claude')).toHaveLength(1)
		expect(check('feat: x\n\nBody.\n\nReviewed-by: Jane <j@x.dev>\nTool: Codex')).toHaveLength(
			1,
		)
		expect(check('feat: x\n\nNote: cursor moves\n\nCo-authored-by: Claudette <c@x>')).toEqual(
			[],
		)
		expect(
			check('feat: x\n\nBody.\n\nNote: cursor moves and more prose.\nSecond line'),
		).toEqual([])
	})

	it('rejects "Made with" and "Generated by" naming a tool anywhere in a line', () => {
		for (const line of [
			'Made with Claude',
			'This change was made with [Cursor](https://cursor.com).',
			'Generated by Codex.',
			'Body made by *Copilot*.',
		])
			expect(check(`feat: x\n\n${line}`), line).toHaveLength(1)
		expect(check('feat: x\n\nMade with care for the cursor position.')).toEqual([])
		expect(check('feat: x\n\nThe fix was made by moving the cursor.')).toEqual([])
	})

	it('rejects attribution in the subject line', () => {
		expect(check('feat: Made with Claude')).toHaveLength(1)
		expect(check('feat: Generated by Codex')).toHaveLength(1)
	})

	it('allows capitalized words between the phrase and the tool', () => {
		expect(check('feat: x\n\nThis was made with GitHub Copilot.')).toHaveLength(1)
		expect(check('feat: x\n\nMade with "Anthropic\'s Claude Code".')).toHaveLength(1)
	})

	it('needs a tool name after "Generated by" or "Made with", not after a line-start "Generated with"', () => {
		expect(check('feat: x\n\nGenerated by the release script.')).toEqual([])
		expect(check('feat: x\n\nMade by hand.')).toEqual([])
		expect(check('feat: x\n\nGenerated with the release script.')).toHaveLength(1)
	})

	it('rejects "Generated with" lines after non-letter prefixes', () => {
		expect(
			check('feat: x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'),
		).toHaveLength(1)
		expect(check('feat: x\n\nGenerated with some tool')).toHaveLength(1)
		expect(check('feat: x\n\nThe file was generated with a script.')).toEqual([])
		expect(check('feat: x\n\nGenerated without AI assistance.')).toEqual([])
	})

	it('accepts human co-authors and words that merely contain a tool name', () => {
		expect(check('feat: x\n\nCo-authored-by: Claudette <c@x>')).toEqual([])
		expect(check('feat: x\n\nCo-authored-by: Jane <jane@x.dev>')).toEqual([])
		expect(check('feat: x\n\nCo-authored-by: Claudette <c@x.dev>')).toEqual([])
	})

	it('ignores git comments and everything below the scissors line', () => {
		const message = [
			'# Please enter the commit message',
			'',
			'feat(alpha): x',
			'# Co-authored-by: Claude <noreply@anthropic.com>',
			'# ------------------------ >8 ------------------------',
			'feat(gallery): diff content',
			'Co-authored-by: Claude <noreply@anthropic.com>',
		].join('\n')
		expect(check(message)).toEqual([])
		expect(check(message.replaceAll('\n', '\r\n'))).toEqual([])
	})
})

describe('identityViolations', () => {
	it('flags owner strings and pattern leaks by line, past comments and the scissors line', () => {
		const message = [
			'chore: x',
			'',
			`made for ${OWNER.toLowerCase()}`,
			`# ${OWNER} in a comment`,
			`see ${LEAKED_URL}`,
			'# ------------------------ >8 ------------------------',
			OWNER,
		].join('\n')
		expect(identityViolations(message, { entries: [OWNER], allowed: [] })).toEqual([
			'line 3 leaks identity (denylist entry #1)',
			'line 5 leaks identity (domain)',
		])
	})

	it('flags a local path by line without repeating it', () => {
		const path = ['', 'Users', 'someone', 'notes'].join('/')
		expect(
			identityViolations(`chore: x\n\nfrom ${path}`, { entries: [OWNER], allowed: [] }),
		).toEqual(['line 3 leaks a local path'])
	})

	it('passes a clean message and fails closed without a denylist in CI', () => {
		expect(
			identityViolations('chore: x\n\nSee https://example.com/a', {
				entries: [OWNER],
				allowed: [],
			}),
		).toEqual([])
		const none = { entries: [], allowed: [] }
		expect(identityViolations('chore: x', none, { ci: true })).toHaveLength(1)
	})

	it('checks only the generic patterns without a denylist outside CI', () => {
		const none = { entries: [], allowed: [] }
		expect(identityViolations(`chore: x\n\nThanks ${OWNER}.`, none, { ci: false })).toEqual([])
		expect(identityViolations(`chore: x\n\nSee ${LEAKED_URL}`, none, { ci: false })).toEqual([
			'line 3 leaks identity (domain)',
		])
	})
})

describe('check-commit-msg CLI', () => {
	const script = fileURLToPath(new URL('./check-commit-msg.ts', import.meta.url))
	const dir = mkdtempSync(join(tmpdir(), 'check-commit-msg-'))
	afterAll(() => rmSync(dir, { recursive: true, force: true }))
	const env = (denylist: string, ci = false) => {
		const vars: NodeJS.ProcessEnv = { ...process.env, IDENTITY_DENYLIST: denylist }
		delete vars.CI
		return ci ? { ...vars, CI: 'true' } : vars
	}
	const run = (message: string, denylist = OWNER, { ci = false } = {}) => {
		const file = join(dir, 'COMMIT_EDITMSG')
		writeFileSync(file, message)
		return spawnSync(process.execPath, ['--experimental-strip-types', script, file], {
			env: env(denylist, ci),
			encoding: 'utf8',
		})
	}
	const git = (repo: string, ...args: string[]) =>
		spawnSync('git', args, { cwd: repo, encoding: 'utf8' }).stdout.trim()
	const repoWith = (...messages: string[]) => {
		const repo = mkdtempSync(join(dir, 'repo-'))
		git(repo, 'init', '-q')
		for (const message of ['chore: base', ...messages])
			git(
				repo,
				'-c',
				'user.name=t',
				'-c',
				'user.email=t@x.dev',
				'-c',
				'core.hooksPath=/dev/null',
				'commit',
				'-q',
				'--allow-empty',
				'--cleanup=verbatim',
				'-m',
				message,
			)
		return repo
	}
	const runRange = (repo: string, range: string) =>
		spawnSync(process.execPath, ['--experimental-strip-types', script, '--range', range], {
			cwd: repo,
			env: env(OWNER),
			encoding: 'utf8',
		})

	it('exits 1 on a leaked owner string or URL without printing it', () => {
		for (const message of [`chore: x\n\nThanks ${OWNER}.\n`, `fix: x\n\nSee ${LEAKED_URL}\n`]) {
			const leaked = run(message)
			expect(leaked.status).toBe(1)
			expect(leaked.stderr).toContain('line 3 leaks identity')
			expect(leaked.stderr).not.toContain(OWNER)
			expect(leaked.stderr).not.toContain(LEAKED_URL)
		}
	})

	it('exits 1 in CI with a hint when no owner denylist is given', () => {
		const missing = run('chore: x\n', '', { ci: true })
		expect(missing.status).toBe(1)
		expect(missing.stderr).toContain('owner denylist is missing')
	})

	it('passes outside CI without a denylist, warning, and still fails on a pattern leak', () => {
		const clean = run('chore: x\n', '')
		expect(clean.status).toBe(0)
		expect(clean.stderr).toContain('commit-msg WARNING')
		expect(clean.stderr).toContain('.identity-denylist')
		const leaked = run(`fix: x\n\nSee ${LEAKED_URL}\n`, '')
		expect(leaked.status).toBe(1)
		expect(leaked.stderr).toContain('line 3 leaks identity')
	})

	it('names a leaking commit of a --range by its hash only', () => {
		const repo = repoWith(`feat(ui): thanks ${OWNER}`)
		const failed = runRange(repo, 'HEAD~1..HEAD')
		expect(failed.status).toBe(1)
		expect(failed.stderr).toMatch(/[0-9a-f]{7}: line 1 leaks identity/)
		expect(failed.stderr).not.toContain(OWNER)
	})

	it('prints only the leak of a message that also breaks another rule', () => {
		const message = `feat(ui):x thanks ${OWNER}`
		const file = run(`${message}\n`)
		const range = runRange(repoWith(message), 'HEAD~1..HEAD')
		for (const result of [file, range]) {
			expect(result.status).toBe(1)
			expect(result.stderr).toContain('leaks identity')
			expect(result.stderr).not.toContain(OWNER)
		}
	})

	it('exits 1 with the reason for an unlisted scope or an AI co-author', () => {
		const scope = run('feat(gallery): x\n')
		expect(scope.status).toBe(1)
		expect(scope.stderr).toContain('scope "gallery" is not allowed')
		const coAuthor = run('chore: x\n\nCo-authored-by: Codex <codex@openai.com>\n')
		expect(coAuthor.status).toBe(1)
		expect(coAuthor.stderr).toContain('AI attribution is not allowed')
	})

	it('exits 1 for an unlisted type or a malformed header', () => {
		const type = run('wip(ui): x\n')
		expect(type.status).toBe(1)
		expect(type.stderr).toContain('type "wip" is not allowed')
		expect(run('feat(ui):x\n').status).toBe(1)
	})

	it('exits 0 for a valid message', () => {
		expect(run('chore: x\n').status).toBe(0)
	})

	it('checks every commit of a --range and names the offending one', () => {
		const repo = repoWith('feat(ui): good', 'wip(ui): bad', 'fix: x\n\nAssisted-by: Claude')
		const base = git(repo, 'rev-list', '--max-parents=0', 'HEAD')
		const failed = runRange(repo, `${base}..HEAD`)
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain('wip(ui): bad: type "wip" is not allowed')
		expect(failed.stderr).toContain('AI attribution is not allowed: "Assisted-by: Claude"')
		expect(failed.stderr).not.toContain('chore: base')
		expect(runRange(repo, 'HEAD~3..HEAD~2').status).toBe(0)
		expect(runRange(repo, `${base}...HEAD`).status).not.toBe(0)
	})

	it('reads a stored commit whole in --range mode, past a scissors line and # lines', () => {
		const repo = repoWith(
			'feat(ui): x\n\n# ------------------------ >8 ------------------------\nCo-authored-by: Claude <noreply@anthropic.com>',
		)
		const failed = runRange(repo, 'HEAD~1..HEAD')
		expect(failed.status).toBe(1)
		expect(failed.stderr).toContain('AI attribution is not allowed')
	})

	it('finds a leak in a stored # line and past the scissors line in --range mode', () => {
		const repo = repoWith(
			`feat(ui): x\n\n# by ${OWNER}`,
			`feat(ui): y\n\n# ------------------------ >8 ------------------------\n${OWNER}`,
		)
		const failed = runRange(repo, 'HEAD~2..HEAD')
		expect(failed.status).toBe(1)
		expect(failed.stderr).toMatch(/[0-9a-f]{7}: line 3 leaks identity/)
		expect(failed.stderr).toMatch(/[0-9a-f]{7}: line 4 leaks identity/)
		expect(failed.stderr).not.toContain(OWNER)
	})

	it('runs from the husky hook with the denylist given only in .env', () => {
		const hook = fileURLToPath(new URL('../.husky/commit-msg', import.meta.url))
		const site = mkdtempSync(join(dir, 'hook-'))
		// copies, not a symlink: the entry guard compares the script path with its resolved URL
		for (const file of [
			'AGENTS.md',
			'scripts/check-commit-msg.ts',
			'scripts/lib/identity.ts',
			'scripts/lib/local-paths.ts',
		])
			cpSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), join(site, file))
		writeFileSync(join(site, '.env'), `IDENTITY_DENYLIST=${OWNER}\n`)
		const hookEnv = { ...process.env }
		delete hookEnv.IDENTITY_DENYLIST
		const commit = (message: string) => {
			writeFileSync(join(site, 'COMMIT_EDITMSG'), message)
			return spawnSync('sh', [hook, 'COMMIT_EDITMSG'], {
				cwd: site,
				env: hookEnv,
				encoding: 'utf8',
			})
		}
		expect(commit('chore: x\n').status).toBe(0)
		const leaked = commit(`chore: x\n\nThanks ${OWNER}.\n`)
		expect(leaked.status).toBe(1)
		expect(leaked.stderr).toContain('line 3 leaks identity')
	})
})
