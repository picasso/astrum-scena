import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./check-notices.ts', import.meta.url))

const CORE_NOTICES = '| `src/assets/icons/a.svg` | original | MIT |\n'
const ROOT_NOTICES = '- `demo/public/fonts/f/font.woff2`\n- `demo/public/fonts/f/LICENCE.txt`\n'

let root: string

const write = (file: string, content: string) => {
	mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
	writeFileSync(path.join(root, file), content)
}

const run = (cwd?: string) =>
	spawnSync(process.execPath, ['--experimental-strip-types', script], { cwd, encoding: 'utf8' })

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), 'notices-'))
	write('packages/core/THIRD_PARTY_NOTICES.md', CORE_NOTICES)
	write('packages/core/src/assets/icons/a.svg', '<svg/>')
	write('packages/core/src/assets/icons/.DS_Store', '')
	write('THIRD_PARTY_NOTICES.md', ROOT_NOTICES)
	write('demo/public/fonts/f/font.woff2', '')
	write('demo/public/fonts/f/LICENCE.txt', '')
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

it('passes the repository notices', () => {
	const result = run()
	expect(result.stderr).toBe('')
	expect(result.status).toBe(0)
})

it('passes when every asset and font is listed', () => {
	const result = run(root)
	expect(result.stderr).toBe('')
	expect(result.status).toBe(0)
})

it('fails naming a new asset without an entry', () => {
	write('packages/core/src/assets/icons/x.svg', '<svg/>')
	const result = run(root)
	expect(result.status).toBe(1)
	expect(result.stderr).toContain('src/assets/icons/x.svg: not listed in the notices')
})

it('fails naming a new font without an entry', () => {
	write('demo/public/fonts/f/bold.woff2', '')
	const result = run(root)
	expect(result.status).toBe(1)
	expect(result.stderr).toContain('demo/public/fonts/f/bold.woff2: not listed in the notices')
})

it('fails naming an entry whose file is gone', () => {
	write(
		'packages/core/THIRD_PARTY_NOTICES.md',
		`${CORE_NOTICES}| \`src/assets/gone.svg\` | x | MIT |\n`,
	)
	const result = run(root)
	expect(result.status).toBe(1)
	expect(result.stderr).toContain(
		'src/assets/gone.svg: listed in the notices but not in the tree',
	)
})

it('fails when a notices file is missing', () => {
	rmSync(path.join(root, 'THIRD_PARTY_NOTICES.md'))
	const result = run(root)
	expect(result.status).toBe(1)
	expect(result.stderr).toContain('check:notices FAILED: THIRD_PARTY_NOTICES.md')
})
