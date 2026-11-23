import { execFileSync, spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const CLI = fileURLToPath(new URL('./check-code-comments.ts', import.meta.url))

let repo: string

beforeEach(async () => {
	repo = await mkdtemp(path.join(tmpdir(), 'code-comments-'))
	execFileSync('git', ['init', '--quiet'], { cwd: repo })
})

afterEach(async () => {
	await rm(repo, { recursive: true, force: true })
})

// untracked files are scanned too, so the temporary repository needs no commit
const runGate = (...args: string[]) =>
	spawnSync(process.execPath, ['--experimental-strip-types', CLI, ...args], {
		cwd: repo,
		encoding: 'utf8',
	})

async function writeRepoFile(file: string, content: string): Promise<void> {
	await mkdir(path.dirname(path.join(repo, file)), { recursive: true })
	await writeFile(path.join(repo, file), content)
}

describe('check:code-comments CLI', () => {
	it('exits 1 and names file:line for a Russian comment in a covered file', async () => {
		await writeFile(path.join(repo, 'a.ts'), 'export const a = 1\n// сначала кеш\n')
		const result = runGate()
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('a.ts:2: Cyrillic in a comment')
	}, 30_000)

	it('exits 0 on a clean repository', async () => {
		await writeFile(path.join(repo, 'a.ts'), '// cache first\nexport const a = 1\n')
		const result = runGate()
		expect(result.status).toBe(0)
		expect(result.stdout).toContain('check:code-comments OK')
	}, 30_000)

	it.each([
		['.github/workflows/ci.yml', '# сначала кеш\non: push\n'],
		['.husky/pre-commit', '# сначала кеш\npnpm lint-staged\n'],
		['config/example.yaml', '# сначала кеш\nkey: value\n'],
		['eslint/example.mjs', '// сначала кеш\nexport const a = 1\n'],
		['scripts/lib/example.ts', '// сначала кеш\nexport const a = 1\n'],
		['scripts/data/example.yaml', '# сначала кеш\nkey: value\n'],
		['packages/core/src/lib/example.ts', '// сначала кеш\nexport const a = 1\n'],
		['packages/core/src/lib/blocks/nested/example.ts', '// сначала кеш\nexport const a = 1\n'],
		['packages/core/src/components/example.astro', '<!-- сначала кеш -->\n<p>a</p>\n'],
		['packages/core/src/config/example.yaml', '# сначала кеш\nkey: value\n'],
		['packages/core/src/i18n/example.ts', '// сначала кеш\nexport const a = 1\n'],
		['packages/core/src/layouts/example.astro', '{/* сначала кеш */}\n<p>a</p>\n'],
		['packages/core/src/pages/[locale]/example.astro', '<p>{1 /* сначала кеш */}</p>\n'],
		['packages/core/src/ui/example.tsx', '// сначала кеш\nexport const a = 1\n'],
		['packages/core/src/example.ts', '// сначала кеш\nexport const a = 1\n'],
		['demo/astro.config.mjs', '// сначала кеш\nexport default {}\n'],
		['demo/src/config/site.yaml', '# сначала кеш\nkey: value\n'],
		['demo/src/theme/theme.css', '/* сначала кеш */\n:root {}\n'],
		['demo/public/_redirects', '# сначала кеш\n/a /b 301\n'],
		['any/new/directory/example.ts', '// сначала кеш\nexport const a = 1\n'],
	])(
		'exits 1 for a Russian comment in covered %s',
		async (file, content) => {
			await writeRepoFile(file, content)
			const result = runGate()
			expect(result.status).toBe(1)
			expect(result.stderr).toContain(`${file}:1: Cyrillic in a comment`)
		},
		30_000,
	)

	it('scans a staged file, not only untracked ones', async () => {
		await writeRepoFile('a.ts', 'export const a = 1\n// сначала кеш\n')
		execFileSync('git', ['add', 'a.ts'], { cwd: repo })
		const result = runGate()
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('a.ts:2: Cyrillic in a comment')
	}, 30_000)

	it('keeps scanning after a clean file and reports the offending one', async () => {
		await writeRepoFile('a.ts', '// cache first\nexport const a = 1\n')
		await writeRepoFile('z.ts', 'export const z = 1\n// сначала кеш\n')
		execFileSync('git', ['add', 'a.ts', 'z.ts'], { cwd: repo })
		const result = runGate()
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('z.ts:2: Cyrillic in a comment')
	}, 30_000)

	it('exits 0 when a tracked file is deleted from the working tree', async () => {
		await writeRepoFile('a.ts', '// сначала кеш\nexport const a = 1\n')
		execFileSync('git', ['add', 'a.ts'], { cwd: repo })
		await rm(path.join(repo, 'a.ts'))
		expect(runGate().status).toBe(0)
	}, 30_000)

	// root reads a mode-000 file anyway, so the failure cannot be provoked
	it.skipIf(process.getuid?.() === 0)(
		'fails when a covered file cannot be read',
		async () => {
			await writeRepoFile('a.ts', '// cache first\nexport const a = 1\n')
			await chmod(path.join(repo, 'a.ts'), 0o000)
			expect(runGate().status).not.toBe(0)
		},
		30_000,
	)

	it.skipIf(process.getuid?.() === 0)(
		'never opens a file without a comment lexer, even an unreadable one',
		async () => {
			await writeRepoFile('notes.md', 'text\n')
			await chmod(path.join(repo, 'notes.md'), 0o000)
			expect(runGate().status).toBe(0)
		},
		30_000,
	)

	it.each([
		'demo/src/content/photos/example.yaml',
		'docs/example.yaml',
		'_bmad/example.yaml',
		'_bmad-output/example.yaml',
		'.claude/example.yaml',
		'.cursor/example.yaml',
		'.agents/example.yaml',
	])(
		'never scans prose or agent tooling in %s',
		async (file) => {
			await writeRepoFile(file, '# сначала кеш\nkey: value\n')
			expect(runGate().status).toBe(0)
		},
		30_000,
	)

	it('excludes the content of the site given by --site, not of the demo', async () => {
		await writeRepoFile('sites/a/src/content/example.yaml', '# сначала кеш\nkey: value\n')
		expect(runGate('--site', 'sites/a').status).toBe(0)
		await writeRepoFile('demo/src/content/example.yaml', '# сначала кеш\nkey: value\n')
		const result = runGate('--site', 'sites/a')
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('demo/src/content/example.yaml:1: Cyrillic in a comment')
	}, 30_000)

	it('skips files without a comment lexer such as markdown and JSON', async () => {
		await writeRepoFile('notes.md', '<!-- сначала кеш -->\n')
		await writeRepoFile('config/example.json', '{ "note": "сначала кеш" }\n')
		expect(runGate().status).toBe(0)
	}, 30_000)

	it('skips a symlink, even one pointing at a directory', async () => {
		await writeRepoFile('target/example.md', 'text\n')
		await symlink('target', path.join(repo, 'link'))
		expect(runGate().status).toBe(0)
	}, 30_000)

	it('scans a source file even when a string literal holds a NUL byte', async () => {
		await writeRepoFile('a.ts', 'export const separator = "\0"\n// сначала кеш\n')
		const result = runGate()
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('a.ts:2: Cyrillic in a comment')
	}, 30_000)
})
