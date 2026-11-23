import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import {
	OVERRIDES_DIR,
	REPLACEMENT_POINTS,
	replacementProblems,
	siteReplacements,
} from './points.ts'

const file = (name: string) => ({ name, isFile: true })

const scratch: string[] = []
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { force: true, recursive: true })
})

const siteWith = (files: Record<string, string>): string => {
	const root = mkdtempSync(path.join(tmpdir(), 'astrum-scena-overrides-'))
	scratch.push(root)
	for (const [name, content] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
		writeFileSync(path.join(root, name), content)
	}
	return root
}

describe('replacement points', () => {
	it('lists the points the core documents, sorted', () => {
		expect(REPLACEMENT_POINTS).toEqual(['footer-copyright', 'logo'])
	})

	it('accepts one .astro component per known point', () => {
		expect(replacementProblems([file('logo.astro'), file('footer-copyright.astro')])).toEqual(
			[],
		)
	})

	it('rejects an unknown point with the file and the known points', () => {
		expect(replacementProblems([file('footer.astro')])).toEqual([
			'src/overrides/footer.astro: unknown replacement point "footer"; known: footer-copyright, logo',
		])
	})

	it('rejects anything but an .astro component', () => {
		expect(
			replacementProblems([
				file('logo.tsx'),
				{ name: 'logo', isFile: false },
				file('README'),
			]),
		).toEqual([
			'src/overrides/logo.tsx: only .astro components replace a point',
			'src/overrides/logo: only .astro components replace a point',
			'src/overrides/README: only .astro components replace a point',
		])
	})

	it('ignores hidden entries of the file system', () => {
		expect(replacementProblems([file('.DS_Store')])).toEqual([])
	})
})

describe('siteReplacements', () => {
	it('replaces nothing for a site without the directory', () => {
		expect(siteReplacements(siteWith({ 'package.json': '{}' }))).toEqual(new Map())
	})

	it('maps each replaced point to its absolute file', () => {
		const root = siteWith({
			[`${OVERRIDES_DIR}/logo.astro`]: '<b />',
			[`${OVERRIDES_DIR}/.DS_Store`]: '',
		})
		expect(siteReplacements(root)).toEqual(
			new Map([['logo', path.join(root, OVERRIDES_DIR, 'logo.astro')]]),
		)
	})

	it('fails with every problem of the directory', () => {
		const root = siteWith({
			[`${OVERRIDES_DIR}/footer.astro`]: '<b />',
			[`${OVERRIDES_DIR}/logo.tsx`]: '',
		})
		expect(() => siteReplacements(root)).toThrow(
			[
				'replacement points (src/overrides/<point>.astro):',
				'  src/overrides/footer.astro: unknown replacement point "footer"; known: footer-copyright, logo',
				'  src/overrides/logo.tsx: only .astro components replace a point',
			].join('\n'),
		)
	})
})
