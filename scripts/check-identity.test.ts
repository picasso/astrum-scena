import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

// samples are assembled from parts, so this file does not trip the gate it tests
const OWNER = ['Acme', 'Owner'].join(' ')
const LEAKED_URL = ['https:', '', 'owner-site.dev', 'about'].join('/')

describe('check-identity CLI', () => {
	const script = fileURLToPath(new URL('./check-identity.ts', import.meta.url))
	const root = mkdtempSync(join(tmpdir(), 'check-identity-'))
	afterAll(() => rmSync(root, { recursive: true, force: true }))

	const repoWith = (files: Record<string, string | Buffer>) => {
		const repo = mkdtempSync(join(root, 'repo-'))
		spawnSync('git', ['init', '-q'], { cwd: repo })
		for (const [file, content] of Object.entries(files)) {
			mkdirSync(dirname(join(repo, file)), { recursive: true })
			writeFileSync(join(repo, file), content)
		}
		return repo
	}
	const run = (repo: string, denylist?: string, { ci = false } = {}) => {
		const env = { ...process.env }
		delete env.IDENTITY_DENYLIST
		delete env.CI
		if (denylist !== undefined) env.IDENTITY_DENYLIST = denylist
		if (ci) env.CI = 'true'
		return spawnSync(process.execPath, ['--experimental-strip-types', script], {
			cwd: repo,
			env,
			encoding: 'utf8',
		})
	}

	it('passes a clean tree', () => {
		const repo = repoWith({
			'packages/core/index.ts': 'export const name = "core"\n',
			'docs/adr/0001.md': 'about the reference site\n',
		})
		const result = run(repo, `# owner\n${OWNER}\n`)
		expect(result.stderr).toBe('')
		expect(result.status).toBe(0)
	})

	it('scans docs/ and _bmad-output/, file names included', () => {
		const repo = repoWith({
			'docs/adr/0001.md': `about ${OWNER}\n${LEAKED_URL}\n`,
			[`_bmad-output/notes-${OWNER}.md`]: 'clean\n',
			'_bmad-output/plan.md': `# plan\nby ${OWNER}\n`,
		})
		const result = run(repo, OWNER)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('docs/adr/0001.md:1:7: denylist entry #1')
		expect(result.stderr).toContain('_bmad-output/plan.md:2:4: denylist entry #1')
		expect(result.stderr).toContain('docs/adr/0001.md:2:1: domain')
		expect(result.stderr).toContain('<file name withheld #1>: file name, denylist entry #1')
		expect(result.stderr).not.toMatch(/acme/i)
	})

	it('fails on an owner string with file, line and entry number, never the string', () => {
		const repo = repoWith({
			'packages/core/index.ts': `// one\n// by ${OWNER.toUpperCase()}\n`,
		})
		const result = run(repo, `first-entry\n${OWNER}\n`)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('packages/core/index.ts:2:7: denylist entry #2')
		expect(result.stderr + result.stdout).not.toMatch(/acme/i)
	})

	it('scans committed files, not only new ones', () => {
		const repo = repoWith({ 'scripts/a.ts': `// ${OWNER}\n` })
		spawnSync('git', ['add', '.'], { cwd: repo })
		const result = run(repo, OWNER)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('scripts/a.ts:1:4: denylist entry #1')
	})

	it('fails on an owner string in a file name and withholds the name everywhere', () => {
		const result = run(repoWith({ [`demo/public/${OWNER}.txt`]: `by ${OWNER}\n` }), OWNER)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('<file name withheld #1>: file name, denylist entry #1')
		expect(result.stderr).toContain('<file name withheld #1>:1:4: denylist entry #1')
		expect(result.stderr).not.toMatch(/acme/i)
	})

	it('withholds a leaking name in binary findings too', () => {
		const binary = Buffer.concat([Buffer.from([0x89, 0x00]), Buffer.from(OWNER)])
		const result = run(repoWith({ [`demo/public/${OWNER}.jpg`]: binary }), OWNER)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('<file name withheld #1>: denylist entry #1')
		expect(result.stderr + result.stdout).not.toMatch(/acme/i)
	})

	it('drops a name finding once the leaking file is deleted from the working tree', () => {
		const repo = repoWith({ [`demo/${OWNER}.txt`]: 'x\n', 'a.ts': 'x\n' })
		spawnSync('git', ['add', '.'], { cwd: repo })
		rmSync(join(repo, `demo/${OWNER}.txt`))
		expect(run(repo, OWNER).status).toBe(0)
	})

	it.skipIf(process.getuid?.() === 0)('fails on a file it cannot read', () => {
		const repo = repoWith({ 'scripts/a.ts': 'x\n' })
		chmodSync(join(repo, 'scripts/a.ts'), 0o000)
		const result = run(repo, OWNER)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('scripts/a.ts: unreadable (EACCES)')
	})

	it.skipIf(process.getuid?.() === 0)(
		'withholds a leaking name when the file cannot be read',
		() => {
			const repo = repoWith({ [`scripts/${OWNER}.ts`]: 'x\n' })
			chmodSync(join(repo, `scripts/${OWNER}.ts`), 0o000)
			const result = run(repo, OWNER)
			expect(result.status).toBe(1)
			expect(result.stderr).toContain('<file name withheld #1>: unreadable (EACCES)')
			expect(result.stderr + result.stdout).not.toMatch(/acme/i)
		},
	)

	it('finds an owner string inside a binary file', () => {
		const binary = Buffer.concat([Buffer.from([0x89, 0x00]), Buffer.from(OWNER)])
		const result = run(repoWith({ 'demo/public/photo.jpg': binary }), OWNER)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('demo/public/photo.jpg: denylist entry #1')
	})

	it('fails on pattern leaks with file and line', () => {
		const repo = repoWith({
			'demo/site.yaml': `url: ${LEAKED_URL}\naccount: ${'ab'.repeat(16)}\n`,
		})
		const result = run(repo, OWNER)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('demo/site.yaml:1:6: domain')
		expect(result.stderr).toContain('demo/site.yaml:2:10: hex-id')
		expect(result.stderr).not.toContain('owner-site')
	})

	it('reads the gitignored list file when the variable is unset', () => {
		const repo = repoWith({
			'.gitignore': '.identity-denylist\n',
			'.identity-denylist': `${OWNER}\n`,
			'scripts/a.ts': `// ${OWNER}\n`,
		})
		const result = run(repo)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('scripts/a.ts:1:4: denylist entry #1')
	})

	it('fails in CI with a hint when no list is given, even if the list file exists', () => {
		for (const [repo, denylist] of [
			[repoWith({ 'a.ts': 'x\n' }), undefined],
			[repoWith({ 'a.ts': 'x\n', '.identity-denylist': `${OWNER}\n` }), ''],
			[repoWith({ 'a.ts': 'x\n' }), '# comments only\n\n'],
		] as const) {
			const result = run(repo, denylist, { ci: true })
			expect(result.status).toBe(1)
			expect(result.stderr).toContain('owner denylist is missing or empty')
			expect(result.stderr).toContain('.identity-denylist')
			expect(result.stderr).toContain('IDENTITY_DENYLIST')
		}
	})

	it('passes outside CI without a list, warning on stderr', () => {
		for (const denylist of [undefined, '', '# comments only\n']) {
			const result = run(repoWith({ 'a.ts': `// ${OWNER}\n` }), denylist)
			expect(result.status).toBe(0)
			expect(result.stderr).toContain('owner denylist is missing or empty')
			expect(result.stderr).toContain('.identity-denylist')
			expect(result.stdout).toContain('check:identity OK without the owner denylist')
		}
	})

	it('still fails on pattern leaks outside CI without a list', () => {
		const result = run(repoWith({ 'demo/site.yaml': `url: ${LEAKED_URL}\n` }))
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('demo/site.yaml:1:6: domain')
	})
})
