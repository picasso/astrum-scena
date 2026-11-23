import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

describe('check-local-paths CLI', () => {
	const script = fileURLToPath(new URL('./check-local-paths.ts', import.meta.url))
	const root = mkdtempSync(join(tmpdir(), 'check-local-paths-'))
	afterAll(() => rmSync(root, { recursive: true, force: true }))
	// assembled from parts, so this file does not trip the gate it tests
	const leaked = ['', 'Users', 'someone', 'notes'].join('/')

	const repoWith = (files: Record<string, string | Buffer>) => {
		const repo = mkdtempSync(join(root, 'repo-'))
		spawnSync('git', ['init', '-q'], { cwd: repo })
		for (const [file, content] of Object.entries(files))
			writeFileSync(join(repo, file), content)
		return repo
	}
	const run = (repo: string) =>
		spawnSync(process.execPath, ['--experimental-strip-types', script], {
			cwd: repo,
			encoding: 'utf8',
		})

	it('scans a text file past 2 MiB and names it', () => {
		const repo = repoWith({ 'big.txt': `${'x'.repeat(3 * 1024 * 1024)}\n${leaked}\n` })
		const result = run(repo)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('big.txt:2:')
	})

	it('finds a path inside a binary file and names the file', () => {
		const repo = repoWith({
			'photo.webp': Buffer.concat([
				Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]),
				Buffer.from(`${leaked}/master.tif`, 'utf8'),
				Buffer.from([0x00, 0xff]),
			]),
		})
		const result = run(repo)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`photo.webp: ${leaked.split('/').slice(0, 3).join('/')}`)
	})

	it('passes a binary file without paths', () => {
		const repo = repoWith({ 'mark.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]) })
		const result = run(repo)
		expect(result.status, result.stderr).toBe(0)
	})

	it('scans committed files, not only new ones', () => {
		const repo = repoWith({ 'notes.md': `see ${leaked}\n` })
		spawnSync('git', ['add', '.'], { cwd: repo })
		const result = run(repo)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('notes.md:1:')
	})

	it.skipIf(process.getuid?.() === 0)('fails on a file it cannot read', () => {
		const repo = repoWith({ 'notes.md': 'x\n' })
		chmodSync(join(repo, 'notes.md'), 0o000)
		const result = run(repo)
		expect(result.status).not.toBe(0)
		expect(result.stderr).toContain('EACCES')
	})
})
