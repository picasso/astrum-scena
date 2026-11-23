import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { BIN } from '../registry.ts'

// what `astrum-scena install` puts into a site, read from the installed core: the skills under
// `skills/` (a directory each, the directory of shared rules among them), the agents of each host under
// `agents/<host>/` and the text of the managed AGENTS.md block. Every installed file but the block
// carries the version stamp of the core, so the site's copy is the core's copy byte for byte

export const SKILLS_DIR = 'skills'
export const AGENTS_DIR = 'agents'
export const BLOCK_FILE = 'presets/agents-block.md'

// the site directories a skill goes into: the shared one and Claude Code's
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills'] as const

// the agents of each host, by the directory the core keeps them in
export const AGENT_ROOTS = { claude: '.claude/agents', codex: '.codex/agents' } as const

export type CoreItem = {
	// the path the site sees from its root, a directory for a skill and a file for an agent
	sitePath: string
	kind: 'directory' | 'file'
	// the stamped files by their path inside the directory; one entry under '' for a file
	files: ReadonlyMap<string, string>
	// the file whose stamp marks a directory as the core's
	stampFile: string
}

export type CoreBundle = {
	name: string
	version: string
	skills: readonly string[]
	agents: readonly string[]
	// one per skill root and skill, then one per agent
	items: readonly CoreItem[]
	block: string
}

export const stampText = (version: string): string =>
	`${BIN} ${version}: installed by ${BIN} install; an edit fails ${BIN} check skills`

const STAMP = new RegExp(`${BIN} (\\S+): installed by ${BIN} install`)

// the version an installed file was stamped with, or undefined for a file the core did not install
export const stampVersion = (content: string | undefined): string | undefined =>
	content === undefined ? undefined : STAMP.exec(content)?.[1]

const FRONTMATTER = /^---\n[\s\S]*?\n---\n/

// markdown gets an HTML comment after its frontmatter, YAML and TOML a `#` comment on the first line
export function stamped(file: string, content: string, version: string): string {
	const text = stampText(version)
	if (file.endsWith('.md')) {
		const frontmatter = FRONTMATTER.exec(content)?.[0] ?? ''
		return `${frontmatter}<!-- ${text} -->\n${content.slice(frontmatter.length)}`
	}
	if (/\.(?:ya?ml|toml)$/.test(file)) return `# ${text}\n${content}`
	return content
}

const posix = (file: string): string => file.split(path.sep).join('/')

// a link to a directory or to nothing has no text, yet it is an entry the core did not install
const UNREADABLE = '\0unreadable'

const readThrough = (file: string): string => {
	try {
		return readFileSync(file, 'utf8')
	} catch {
		return UNREADABLE
	}
}

// every entry under `directory` but its subdirectories, links read through, by its POSIX path inside
// it, sorted
export function filesUnder(directory: string): Map<string, string> {
	const files = readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => !entry.isDirectory())
		.map((entry) => path.join(entry.parentPath, entry.name))
		.map((file) => [posix(path.relative(directory, file)), readThrough(file)] as const)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
	return new Map(files)
}

const subdirectories = (directory: string): string[] =>
	readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort()

export function readCoreBundle(coreRoot: string): CoreBundle {
	const { name, version } = JSON.parse(
		readFileSync(path.join(coreRoot, 'package.json'), 'utf8'),
	) as { name: string; version: string }
	const skillsDir = path.join(coreRoot, SKILLS_DIR)
	const skills = subdirectories(skillsDir)
	const skillItems = SKILL_ROOTS.flatMap((root) =>
		skills.map((skill): CoreItem => {
			const source = filesUnder(path.join(skillsDir, skill))
			const stampFile = source.has('SKILL.md')
				? 'SKILL.md'
				: [...source.keys()].find((file) => file.endsWith('.md'))
			if (stampFile === undefined)
				throw new Error(`${SKILLS_DIR}/${skill} of the core has no Markdown file to stamp`)
			return {
				sitePath: `${root}/${skill}`,
				kind: 'directory',
				files: new Map(
					[...source].map(([file, text]) => [file, stamped(file, text, version)]),
				),
				stampFile,
			}
		}),
	)
	const agentItems = Object.entries(AGENT_ROOTS).flatMap(([host, root]) =>
		[...filesUnder(path.join(coreRoot, AGENTS_DIR, host))].map(([file, text]): CoreItem => ({
			sitePath: `${root}/${file}`,
			kind: 'file',
			files: new Map([['', stamped(file, text, version)]]),
			stampFile: '',
		})),
	)
	return {
		name,
		version,
		skills,
		agents: [...new Set(agentItems.map((item) => path.posix.parse(item.sitePath).name))],
		items: [...skillItems, ...agentItems],
		block: readFileSync(path.join(coreRoot, BLOCK_FILE), 'utf8'),
	}
}
