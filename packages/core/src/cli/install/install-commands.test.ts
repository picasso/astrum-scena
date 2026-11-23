import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { writeSiteConfig } from '../../config/fixtures/site-files.ts'
import { CORE_ROOT } from '../../core-root.ts'
import { runAstrumScena } from '../test-fixtures.ts'
import { AGENTS_FILE, BLOCK_BEGIN, BLOCK_END, withBlock } from './agents-md.ts'
import { readCoreBundle, SKILL_ROOTS, stampVersion } from './bundle.ts'
import { PRESET_CONFIGS } from './configs.ts'

// `install` and the gate `skills` on temporary sites: neither reads the site config, so a site is a
// directory with a site.yaml

const scratch = mkdtempSync(path.join(tmpdir(), 'astrum-scena-install-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let sites = 0
function makeSite(): string {
	const root = path.join(scratch, `site-${++sites}`)
	return writeSiteConfig(root, 'schemaVersion: 3\n')
}

const bundle = readCoreBundle(CORE_ROOT)
const install = (root: string, coreRoot?: string) =>
	runAstrumScena(root, ['install'], coreRoot ? { coreRoot } : {})
const checkSkills = (root: string) => runAstrumScena(root, ['check', 'skills'])

// every file of the site by its path, to tell which bytes a command changed
function snapshot(root: string): Map<string, string> {
	return new Map(
		readdirSync(root, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => path.join(entry.parentPath, entry.name))
			.map((file) => [path.relative(root, file), readFileSync(file, 'utf8')]),
	)
}

const write = (file: string, text: string) => {
	mkdirSync(path.dirname(file), { recursive: true })
	writeFileSync(file, text)
}

// a core like the installed one at another version
function coreAt(version: string): string {
	const root = path.join(scratch, `core-${version}`)
	if (existsSync(root)) return root
	mkdirSync(root)
	const manifest = JSON.parse(
		readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8'),
	) as object
	writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...manifest, version }))
	for (const directory of ['skills', 'agents', 'presets'])
		symlinkSync(path.join(CORE_ROOT, directory), path.join(root, directory))
	return root
}

describe('astrum-scena install', () => {
	it('installs the skills, agents, AGENTS.md block and configs, which check skills passes', async () => {
		const root = makeSite()
		const result = await install(root)
		expect(result.status, result.stderr).toBe(0)
		expect(result.stderr).toBe('')
		for (const skillRoot of SKILL_ROOTS)
			for (const skill of bundle.skills) {
				const directory = path.join(root, skillRoot, skill)
				expect(existsSync(directory), directory).toBe(true)
			}
		const skill = readFileSync(path.join(root, '.claude/skills/validate/SKILL.md'), 'utf8')
		expect(stampVersion(skill)).toBe(bundle.version)
		expect(skill.startsWith('---\nname: validate\n')).toBe(true)
		for (const agent of bundle.agents) {
			expect(existsSync(path.join(root, '.claude/agents', `${agent}.md`))).toBe(true)
			expect(existsSync(path.join(root, '.codex/agents', `${agent}.toml`))).toBe(true)
		}
		const agents = readFileSync(path.join(root, AGENTS_FILE), 'utf8')
		expect(agents.startsWith(`${BLOCK_BEGIN}\n`)).toBe(true)
		expect(agents.endsWith(`${BLOCK_END}\n`)).toBe(true)
		expect(stampVersion(agents)).toBe(bundle.version)
		for (const config of PRESET_CONFIGS)
			expect(readFileSync(path.join(root, config.file), 'utf8')).toContain(
				`${bundle.name}/${config.entry}`,
			)
		const check = await checkSkills(root)
		expect(check.status, check.stderr).toBe(0)
		expect(check.stdout).toContain(
			`check skills OK (${bundle.skills.length} skills, ${bundle.agents.length} agents of ${bundle.name} ${bundle.version})`,
		)
		const all = await runAstrumScena(root, ['check'])
		expect(all.stdout).toContain('check skills OK')
	})

	it('changes nothing on a second run', async () => {
		const root = makeSite()
		expect((await install(root)).status).toBe(0)
		const before = snapshot(root)
		const again = await install(root)
		expect(again.status, again.stderr).toBe(0)
		expect(again.stdout).toContain('; 0 written,')
		expect(snapshot(root)).toEqual(before)
	})

	it('refuses a site directory under a core skill name, naming it, and writes nothing', async () => {
		const root = makeSite()
		const own = path.join(root, '.agents/skills/factcheck/SKILL.md')
		write(own, '---\nname: factcheck\n---\n\nThe site skill.\n')
		const before = snapshot(root)
		const result = await install(root)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain("the names of the core's skills and agents are reserved")
		expect(result.stderr).toContain('  .agents/skills/factcheck\n')
		expect(snapshot(root)).toEqual(before)
		const check = await checkSkills(root)
		expect(check.status).toBe(1)
		expect(check.stderr).toContain('.agents/skills/factcheck: not the copy of')
	})

	it('refuses a site agent under a core agent name', async () => {
		const root = makeSite()
		write(path.join(root, '.claude/agents/factcheck-reviewer.md'), '# my reviewer\n')
		const result = await install(root)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('  .claude/agents/factcheck-reviewer.md\n')
		expect(existsSync(path.join(root, AGENTS_FILE))).toBe(false)
	})

	it('leaves a skill of the site alone', async () => {
		const root = makeSite()
		const own = path.join(root, '.agents/skills/site-notes/SKILL.md')
		write(own, '---\nname: site-notes\n---\n\nNotes.\n')
		expect((await install(root)).status).toBe(0)
		expect(readFileSync(own, 'utf8')).toBe('---\nname: site-notes\n---\n\nNotes.\n')
		expect((await checkSkills(root)).status).toBe(0)
		expect(readFileSync(own, 'utf8')).toBe('---\nname: site-notes\n---\n\nNotes.\n')
	})

	it('keeps the text of AGENTS.md outside the markers byte for byte', async () => {
		const root = makeSite()
		const file = path.join(root, AGENTS_FILE)
		const head = '# AGENTS.md\n\nRules of the site.\n\n'
		const tail = '\n\n## More rules\n\nThe end.\n'
		write(file, `${head}${BLOCK_BEGIN}\nan old block\n${BLOCK_END}${tail}`)
		expect((await install(root)).status).toBe(0)
		const text = readFileSync(file, 'utf8')
		expect(text.startsWith(`${head}${BLOCK_BEGIN}\n<!-- `)).toBe(true)
		expect(text.endsWith(`${BLOCK_END}${tail}`)).toBe(true)
		expect(text).not.toContain('an old block')
	})

	it('fails on broken markers in AGENTS.md before writing anything', async () => {
		const root = makeSite()
		write(path.join(root, AGENTS_FILE), `# Rules\n\n${BLOCK_BEGIN}\nno end\n`)
		const before = snapshot(root)
		const result = await install(root)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(`expected one ${BLOCK_BEGIN} … ${BLOCK_END} block`)
		expect(snapshot(root)).toEqual(before)
	})

	it('keeps a config of the site, warning that it does not extend the preset', async () => {
		const root = makeSite()
		const own = path.join(root, 'eslint.config.mjs')
		write(own, 'export default []\n')
		const extending = path.join(root, '.prettierrc.json')
		write(extending, `"${bundle.name}/prettier"\n`)
		const result = await install(root)
		expect(result.status, result.stderr).toBe(0)
		expect(readFileSync(own, 'utf8')).toBe('export default []\n')
		expect(result.stderr).toContain(
			`install WARN: eslint.config.mjs does not extend the core's ESLint preset ${bundle.name}/eslint`,
		)
		expect(result.stderr).not.toContain('prettier')
		expect(existsSync(path.join(root, 'prettier.config.mjs'))).toBe(false)
	})

	it('keeps a Prettier config in package.json, warning that it does not extend the preset', async () => {
		const root = makeSite()
		const manifest = path.join(root, 'package.json')
		const text = `${JSON.stringify({ name: 'site', prettier: { semi: true } }, null, '\t')}\n`
		write(manifest, text)
		const result = await install(root)
		expect(result.status, result.stderr).toBe(0)
		expect(existsSync(path.join(root, 'prettier.config.mjs'))).toBe(false)
		expect(readFileSync(manifest, 'utf8')).toBe(text)
		expect(result.stderr).toContain(
			`install WARN: package.json does not extend the core's Prettier preset ${bundle.name}/prettier`,
		)

		const extending = makeSite()
		write(
			path.join(extending, 'package.json'),
			JSON.stringify({ prettier: `${bundle.name}/prettier` }),
		)
		const quiet = await install(extending)
		expect(quiet.status, quiet.stderr).toBe(0)
		expect(quiet.stderr).not.toContain('Prettier')
		expect(existsSync(path.join(extending, 'prettier.config.mjs'))).toBe(false)
	})

	it('writes a skill once when one skill root links to the other', async () => {
		const root = makeSite()
		mkdirSync(path.join(root, '.claude/skills'), { recursive: true })
		mkdirSync(path.join(root, '.agents'))
		symlinkSync('../.claude/skills', path.join(root, '.agents/skills'))
		const result = await install(root)
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout.match(/ wrote \S+\/validate\n/g)).toHaveLength(1)
		expect(existsSync(path.join(root, '.agents/skills/validate/SKILL.md'))).toBe(true)
		expect((await checkSkills(root)).status).toBe(0)
	})

	it('replaces a skill of an older core, a file added to it included', async () => {
		const root = makeSite()
		expect((await install(root, coreAt('0.0.0-old'))).status).toBe(0)
		write(path.join(root, '.claude/skills/validate/notes.md'), 'mine\n')
		const result = await install(root)
		expect(result.status, result.stderr).toBe(0)
		expect(existsSync(path.join(root, '.claude/skills/validate/notes.md'))).toBe(false)
		expect((await checkSkills(root)).status).toBe(0)
	})
})

describe('check skills', () => {
	it('passes a site with no core skills', async () => {
		const result = await checkSkills(makeSite())
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain('check skills OK (no core skills installed)')
	})

	it('fails on an edited skill, naming its path and the install command', async () => {
		const root = makeSite()
		expect((await install(root)).status).toBe(0)
		const file = path.join(root, '.claude/skills/fixcontent/SKILL.md')
		writeFileSync(file, `${readFileSync(file, 'utf8')}\nA local rule.\n`)
		const result = await checkSkills(root)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			`.claude/skills/fixcontent: differs from the copy of ${bundle.name} ${bundle.version}`,
		)
		expect(result.stderr).toContain('Reinstall them: astrum-scena install')
	})

	it('fails on a link added to an installed skill', async () => {
		const root = makeSite()
		expect((await install(root)).status).toBe(0)
		const skill = path.join(root, '.claude/skills/validate')
		symlinkSync('SKILL.md', path.join(skill, 'copy.md'))
		symlinkSync('nowhere', path.join(skill, 'dangling.md'))
		const result = await checkSkills(root)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			`.claude/skills/validate: differs from the copy of ${bundle.name} ${bundle.version}`,
		)
	})

	it('fails on skills of another core version, naming both versions', async () => {
		const root = makeSite()
		expect((await install(root, coreAt('9.9.9'))).status).toBe(0)
		const result = await checkSkills(root)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			`.agents/skills/validate: installed by ${bundle.name} 9.9.9, the installed core is ${bundle.version}`,
		)
	})

	it('fails on a missing skill once any is installed', async () => {
		const root = makeSite()
		expect((await install(root)).status).toBe(0)
		rmSync(path.join(root, '.codex'), { recursive: true })
		const result = await checkSkills(root)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('.codex/agents/factcheck-researcher.toml: missing')
	})
})

describe('withBlock', () => {
	const block = `${BLOCK_BEGIN}\nnew\n${BLOCK_END}`

	it('makes a missing or empty file the block alone', () => {
		expect(withBlock(undefined, block)).toBe(`${block}\n`)
		expect(withBlock('', block)).toBe(`${block}\n`)
	})

	it('appends the block to a file without one, after a blank line', () => {
		expect(withBlock('# Rules', block)).toBe(`# Rules\n\n${block}\n`)
		expect(withBlock('# Rules\n', block)).toBe(`# Rules\n\n${block}\n`)
		expect(withBlock('# Rules\n\n', block)).toBe(`# Rules\n\n${block}\n`)
	})

	it('replaces only the text between the markers', () => {
		expect(withBlock(`a\n${BLOCK_BEGIN}\nold\n${BLOCK_END}\nb`, block)).toBe(`a\n${block}\nb`)
	})

	it('refuses a lone, repeated or reversed marker', () => {
		for (const text of [
			`${BLOCK_BEGIN}\n`,
			`${BLOCK_END}\n`,
			`${BLOCK_END}\n${BLOCK_BEGIN}\n`,
			`${block}\n${block}\n`,
		])
			expect(() => withBlock(text, block), text).toThrow('expected one')
	})
})
