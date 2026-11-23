import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { type CliContext, label } from '../../context.ts'
import { AGENTS_FILE, renderBlock, withBlock } from '../agents-md.ts'
import { readCoreBundle } from '../bundle.ts'
import { planConfigs } from '../configs.ts'
import { inspect, siteItems, writeItem } from '../site-items.ts'

// installs the core's skills and agents with its version stamp, the managed block of AGENTS.md and the
// configs that extend its presets. Everything is checked before the first write: a site file under a
// name of the core stops the run with nothing written. A file already equal to the core's copy is not
// rewritten, so a second run changes nothing
export function install(context: CliContext): number {
	const bundle = readCoreBundle(context.coreRoot)
	const items = siteItems(context.root, bundle).map((item) => ({ item, state: inspect(item) }))
	const foreign = items.filter(({ state }) => state.state === 'foreign')
	if (foreign.length > 0) {
		context.err(
			`install FAIL: the names of the core's skills and agents are reserved (${[...bundle.skills, ...bundle.agents].join(', ')}), and the site has its own:`,
		)
		for (const { item } of foreign)
			context.err(`  ${label(context, path.join(context.root, item.sitePath))}`)
		context.err('Rename or remove them, then run the install again.')
		return 1
	}
	const agentsFile = path.join(context.root, AGENTS_FILE)
	const currentAgents = existsSync(agentsFile) ? readFileSync(agentsFile, 'utf8') : undefined
	const nextAgents = withBlock(currentAgents, renderBlock(bundle.block, bundle.version))
	const configs = planConfigs(context.root, bundle.name)

	const written: string[] = []
	for (const { item, state } of items) {
		if (state.state === 'current') continue
		writeItem(item)
		written.push(item.sitePath)
	}
	if (nextAgents !== currentAgents) {
		writeFileSync(agentsFile, nextAgents)
		written.push(AGENTS_FILE)
	}
	for (const plan of configs) {
		if (plan.action === 'write') {
			writeFileSync(path.join(context.root, plan.config.file), plan.content)
			written.push(plan.config.file)
		} else
			for (const file of plan.foreign)
				context.err(
					`install WARN: ${label(context, path.join(context.root, file))} does not extend the core's ${plan.config.tool} preset ${bundle.name}/${plan.config.entry}; it is kept as it is`,
				)
	}
	for (const file of written)
		context.out(`  wrote ${label(context, path.join(context.root, file))}`)
	context.out(
		`install OK (${bundle.name} ${bundle.version}: ${bundle.skills.length} skills, ${bundle.agents.length} agents; ${written.length} written, ${items.length + 1 + configs.length - written.length} unchanged)`,
	)
	return 0
}
