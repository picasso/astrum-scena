import path from 'node:path'

import { type CliContext, command, label } from '../../context.ts'
import { readCoreBundle } from '../bundle.ts'
import { inspect, type ItemState, siteItems } from '../site-items.ts'

// the core's skills and agents in the site are the copies of the installed core: once any of them, or
// a site file under one of their names, is present, every one must equal the core's copy with its
// version stamp. A site without any passes, so the gate holds before the first install
export function checkSkills(context: CliContext): number {
	const bundle = readCoreBundle(context.coreRoot)
	const items = siteItems(context.root, bundle).map((item) => ({ item, state: inspect(item) }))
	if (items.every(({ state }) => state.state === 'missing')) {
		context.out('check skills OK (no core skills installed)')
		return 0
	}
	const core = `${bundle.name} ${bundle.version}`
	const problem = (state: ItemState): string | undefined => {
		switch (state.state) {
			case 'current':
				return undefined
			case 'missing':
				return 'missing'
			case 'foreign':
				return `not the copy of ${core}: a site skill or agent may not take a name of the core`
			case 'stale':
				return state.version === bundle.version
					? `differs from the copy of ${core}`
					: `installed by ${bundle.name} ${state.version}, the installed core is ${bundle.version}`
		}
	}
	const problems = items.flatMap(({ item, state }) => {
		const detail = problem(state)
		return detail === undefined
			? []
			: [`${label(context, path.join(context.root, item.sitePath))}: ${detail}`]
	})
	if (problems.length > 0) {
		context.err(`check skills FAIL: the core's skills and agents in the site are not ${core}:`)
		for (const line of problems) context.err(`  ${line}`)
		context.err(`Reinstall them: ${command(context, 'install')}`)
		return 1
	}
	context.out(
		`check skills OK (${bundle.skills.length} skills, ${bundle.agents.length} agents of ${core})`,
	)
	return 0
}
