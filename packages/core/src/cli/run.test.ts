import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { siteRoot } from '../config/site-root.ts'
import {
	cliSurface,
	COMMANDS,
	CONTENT_COMMANDS,
	CONTRACTS,
	GATES,
	IMAGE_COMMANDS,
	optionForm,
	optionName,
	OWNER,
} from './registry.ts'
import { OPTION_FORMS, parseArgs } from './run.ts'
import { runAstrumScena } from './test-fixtures.ts'

const scratch = mkdtempSync(path.join(tmpdir(), 'astrum-scena-cli-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('astrum-scena dispatcher', () => {
	it('runs every gate on the demo and passes', async () => {
		const result = await runAstrumScena(siteRoot, ['check'])
		expect(result.status, result.stderr).toBe(0)
		for (const gate of GATES) expect(result.stdout).toContain(`check ${gate} OK`)
	})

	it('reads the site --root names, relative to the current directory', async () => {
		const parent = path.dirname(siteRoot)
		const result = await runAstrumScena(parent, [
			'check',
			'config-lock',
			'--root',
			path.basename(siteRoot),
		])
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain(`path: ${path.basename(siteRoot)}/site.lock.yaml`)
	})

	it('refuses a root without a site config, naming the path', async () => {
		const empty = path.join(scratch, 'empty')
		mkdirSync(empty)
		const result = await runAstrumScena(scratch, ['check', '--root', 'empty'])
		expect(result.status).not.toBe(0)
		expect(result.stderr).toContain('empty/site.yaml: missing; --root must name a site root')
		const absent = await runAstrumScena(scratch, ['config', 'resolve', '--root', '../nowhere'])
		expect(absent.status).not.toBe(0)
		expect(absent.stderr).toContain('../nowhere/site.yaml: missing')
	})

	it('fails on an unknown command, listing the commands', async () => {
		const result = await runAstrumScena(siteRoot, ['chek'])
		expect(result.status).not.toBe(0)
		expect(result.stderr).toContain('unknown command: chek')
		for (const { name } of COMMANDS) expect(result.stderr).toContain(`  ${name} `)
		expect((await runAstrumScena(siteRoot, ['check', 'everything'])).stderr).toContain(
			'unknown command: check everything',
		)
		expect((await runAstrumScena(siteRoot, [])).status).not.toBe(0)
	})

	it.each([['--root'], ['--root', ''], ['--root', '--help'], ['--root=']])(
		'fails on %j without a directory',
		async (...args) => {
			const result = await runAstrumScena(siteRoot, ['check', ...args])
			expect(result.status).not.toBe(0)
			expect(result.stderr).toContain('--root needs a directory')
		},
	)

	it('runs every gate of a failing site, reporting the later ones after a failure or a throw', async () => {
		const site = path.join(scratch, 'failing')
		cpSync(siteRoot, site, {
			recursive: true,
			filter: (source) => !/(?:^|[\\/])(?:node_modules|dist|\.astro)$/.test(source),
		})
		// a color literal in markup, which only color-literals reads
		writeFileSync(path.join(site, 'src', 'color-probe.astro'), '<p style="color: #fff">x</p>\n')
		const violated = await runAstrumScena(site, ['check'])
		expect(violated.status).toBe(1)
		expect(violated.stderr).toContain('check color-literals FAILED')
		for (const gate of ['css-layers', 'pages', 'image-files'])
			expect(violated.stdout).toContain(`check ${gate} OK`)

		rmSync(path.join(site, 'site.lock.yaml'))
		const thrown = await runAstrumScena(site, ['check'])
		expect(thrown.status).toBe(1)
		expect(thrown.stderr).toContain('check config-lock FAIL')
		expect(thrown.stderr).toContain('check layout-tokens FAIL: site.lock.yaml: missing')
		for (const gate of ['css-layers', 'pages'])
			expect(thrown.stdout).toContain(`check ${gate} OK`)
		expect(thrown.stderr).toContain('check image-files FAIL')
	})

	it('takes no inherited property for a command', async () => {
		for (const name of ['toString', 'constructor', '__proto__']) {
			const result = await runAstrumScena(siteRoot, [name])
			expect(result.status, name).toBe(2)
			expect(result.stderr).toContain(`unknown command: ${name}`)
		}
	})

	it('fails on an unknown option with code 2, listing the options of the command', async () => {
		const result = await runAstrumScena(siteRoot, ['check', '--site', 'demo'])
		expect(result.status).toBe(2)
		expect(result.stderr).toContain('unknown option: --site')
		expect(result.stderr).toContain('options of check: --root <dir>')
		expect((await runAstrumScena(siteRoot, ['check', '-h'])).stderr).toContain(
			'unknown option: -h',
		)
		// an option of another command
		const foreign = await runAstrumScena(siteRoot, ['check', 'pages', '--release', 'x'])
		expect(foreign.status).toBe(2)
		expect(foreign.stderr).toContain('unknown option: --release')
		expect(foreign.stderr).toContain('options of check pages: --root <dir>')
		// no command to list the options of
		const bare = await runAstrumScena(siteRoot, ['--foo'])
		expect(bare.status).toBe(2)
		expect(bare.stderr).toContain('usage: astrum-scena')
	})

	it('lists the images commands on images --help', async () => {
		const result = await runAstrumScena(scratch, ['images', '--help'])
		expect(result.status).toBe(0)
		for (const { name } of IMAGE_COMMANDS) expect(result.stdout).toContain(`  ${name} `)
		expect(result.stdout).toContain(
			'--masters <dir> --archive <dir> --release <id> --photos <ids>',
		)
	})

	it('lists the content commands with their options on --help', async () => {
		const result = await runAstrumScena(scratch, ['content', '--help'])
		expect(result.status).toBe(0)
		for (const { name } of CONTENT_COMMANDS) expect(result.stdout).toContain(`  ${name} `)
		expect(result.stdout).toContain('--document <collection>/<key>… --all --write')
	})

	it('prints the commands on --help and runs nothing', async () => {
		const result = await runAstrumScena(scratch, ['check', '--help'])
		expect(result.status).toBe(0)
		for (const { name } of COMMANDS) expect(result.stdout).toContain(`  ${name} `)
	})

	it('runs every registered command: none falls through to unknown', async () => {
		for (const { name } of COMMANDS) {
			const result = await runAstrumScena(scratch, [...name.split(' '), '--root', 'nowhere'])
			expect(result.stderr, name).toContain('nowhere/site.yaml: missing')
		}
	})
})

describe('parseArgs', () => {
	it('takes the words as the command and --root anywhere', () => {
		expect(parseArgs(['--root', 'x', 'check', 'pages'])).toEqual({
			command: 'check pages',
			root: 'x',
			help: false,
			options: {},
			unknown: [],
		})
		expect(parseArgs(['config', 'resolve', '--root=../site'])).toEqual({
			command: 'config resolve',
			root: '../site',
			help: false,
			options: {},
			unknown: [],
		})
	})

	it('reads the options of the commands by their form, anywhere on the line', () => {
		expect(
			parseArgs(['images', '--release', 'r-1', 'activate', '--recover', '--photos=a,b']),
		).toEqual({
			command: 'images activate',
			help: false,
			options: { '--release': 'r-1', '--recover': true, '--photos': 'a,b' },
			unknown: [],
		})
		expect(parseArgs(['images', 'build', '--foo', 'x']).unknown).toEqual(['--foo'])
		expect(() => parseArgs(['images', 'build', '--release'])).toThrow('--release needs a value')
		expect(() => parseArgs(['images', 'build', '--release', '--recover'])).toThrow(
			'--release needs a value',
		)
		expect(() => parseArgs(['images', 'activate', '--recover=yes'])).toThrow(
			'--recover takes no value',
		)
	})

	it('collects every value of a repeated option in order', () => {
		const args = parseArgs([
			'content',
			'translation-marker',
			'confirm',
			'--document',
			'articles/a',
			'--write',
			'--document=pages/b',
		])
		expect(args.options).toEqual({ '--document': ['articles/a', 'pages/b'], '--write': true })
		expect(() =>
			parseArgs(['content', 'translation-marker', 'confirm', '--document', '--all']),
		).toThrow('--document needs a value')
	})

	it('reads one form per option name across every command', () => {
		const forms = new Map<string, Set<string>>()
		for (const option of COMMANDS.flatMap(({ options }) => options)) {
			const name = optionName(option)
			forms.set(name, (forms.get(name) ?? new Set()).add(optionForm(option)))
		}
		const mixed = [...forms].filter(([, set]) => set.size > 1).map(([name]) => name)
		expect(mixed).toEqual([])
		expect(OPTION_FORMS.get('--document')).toBe('repeated')
		expect(OPTION_FORMS.get('--key')).toBe('value')
		expect(OPTION_FORMS.get('--all')).toBe('flag')
	})
})

describe('cliSurface', () => {
	it('lists the bin with each command and each command with its options', () => {
		const surface = cliSurface()
		expect(surface).toContain('astrum-scena --help')
		expect(surface).toContain('astrum-scena config resolve --root <dir>')
		for (const gate of GATES) {
			expect(surface).toContain(`astrum-scena check ${gate}`)
			expect(surface).toContain(`astrum-scena check ${gate} --root <dir>`)
		}
		for (const { name, options } of IMAGE_COMMANDS) {
			expect(surface).toContain(`astrum-scena ${name}`)
			for (const option of options)
				expect(surface).toContain(`astrum-scena ${name} ${option}`)
		}
		for (const { name, options } of CONTENT_COMMANDS)
			for (const option of options)
				expect(surface).toContain(`astrum-scena ${name} ${option}`)
		expect(surface).toContain('astrum-scena images build --masters <dir>')
		expect(surface).toContain('astrum-scena images activate --recover')
		expect(surface).toContain(
			'astrum-scena content translation-marker confirm --document <collection>/<key>…',
		)
		expect(surface).toContain('astrum-scena check content --root <dir>')
		expect(surface).toEqual([...surface].sort())
	})
})

describe('the gate registry', () => {
	it('gives each gate a contract of its own and a writer that is a command or the owner', () => {
		const writers = new Set([OWNER, ...COMMANDS.map(({ name }) => name)])
		const entries = GATES.map((gate) => ({ gate, ...CONTRACTS[gate] }))
		expect(Object.keys(CONTRACTS).sort()).toEqual([...GATES].sort())
		expect(entries.filter(({ writer }) => !writers.has(writer))).toEqual([])
		expect(entries.filter(({ writer }) => writer.startsWith('check'))).toEqual([])
		const contracts = entries.map(({ contract }) => contract)
		expect(new Set(contracts).size).toBe(contracts.length)
		expect(contracts.filter((contract) => contract.trim() === '')).toEqual([])
	})
})
