import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

import { SITE_CONFIG_PATH } from '../config/lock.ts'
import { checkColorLiterals } from './commands/check-color-literals.ts'
import { checkConfigLock } from './commands/check-config-lock.ts'
import { checkCoreVersion } from './commands/check-core-version.ts'
import { checkCssLayers } from './commands/check-css-layers.ts'
import { checkImageFiles } from './commands/check-image-files.ts'
import { checkLayoutTokens } from './commands/check-layout-tokens.ts'
import { checkPages } from './commands/check-pages.ts'
import { configResolve } from './commands/config-resolve.ts'
import { layoutTokens } from './commands/layout-tokens.ts'
import { checkContent } from './content/commands/check-content.ts'
import { checkFactcheck } from './content/commands/check-factcheck.ts'
import {
	factcheckDecide,
	factcheckExtract,
	factcheckMerge,
	factcheckResearched,
	factcheckReview,
} from './content/commands/factcheck.ts'
import {
	translationMarkerCheck,
	translationMarkerCompute,
	translationMarkerConfirm,
} from './content/commands/translation-marker.ts'
import { type CliContext, toLabel } from './context.ts'
import { checkImagesPolicy } from './images/commands/check-images-policy.ts'
import { checkImagesPublicConfig } from './images/commands/check-images-public-config.ts'
import { checkPlaceGpsBounds } from './images/commands/check-place-gps-bounds.ts'
import { imagesActivate } from './images/commands/images-activate.ts'
import { imagesBuild } from './images/commands/images-build.ts'
import { imagesCheckDerivatives } from './images/commands/images-check-derivatives.ts'
import { imagesCheckLive } from './images/commands/images-check-live.ts'
import { imagesColormode } from './images/commands/images-colormode.ts'
import { imagesLadderReport } from './images/commands/images-ladder-report.ts'
import { imagesPrune } from './images/commands/images-prune.ts'
import { imagesPublicInit } from './images/commands/images-public-init.ts'
import { imagesSync } from './images/commands/images-sync.ts'
import { checkSkills } from './install/commands/check-skills.ts'
import { install } from './install/commands/install.ts'
import {
	COMMANDS,
	type CommandSpec,
	type Gate,
	GATES,
	HELP_OPTION,
	type OptionForm,
	optionForm,
	optionName,
	ROOT_OPTION,
	usage,
} from './registry.ts'

// the dispatcher of the `astrum-scena` bin: it reads the command words and the options, resolves the
// site root once and hands it to the command. Exit codes: 0 done, 1 a command or gate failed, 2 the
// command line is wrong

type Runner = (context: CliContext) => number | Promise<number>

const GATE_RUNNERS: Record<Gate, Runner> = {
	'config-lock': checkConfigLock,
	'layout-tokens': checkLayoutTokens,
	'color-literals': checkColorLiterals,
	'css-layers': checkCssLayers,
	pages: checkPages,
	'image-files': checkImageFiles,
	'images-policy': checkImagesPolicy,
	'images-public-config': checkImagesPublicConfig,
	'place-gps-bounds': checkPlaceGpsBounds,
	content: checkContent,
	factcheck: checkFactcheck,
	skills: checkSkills,
	'core-version': checkCoreVersion,
}

// every gate, in order, even after one fails or throws
const checkAll: Runner = async (context) => {
	let code = 0
	for (const gate of GATES) {
		try {
			code = Math.max(code, await GATE_RUNNERS[gate](context))
		} catch (error) {
			context.err(`check ${gate} FAIL: ${(error as Error).message}`)
			code = Math.max(code, 1)
		}
	}
	return code
}

const RUNNERS: Record<string, Runner> = {
	'config resolve': configResolve,
	'layout-tokens': layoutTokens,
	install,
	check: checkAll,
	...Object.fromEntries(GATES.map((gate) => [`check ${gate}`, GATE_RUNNERS[gate]])),
	'images build': imagesBuild,
	'images activate': imagesActivate,
	'images colormode': imagesColormode,
	'images ladder-report': imagesLadderReport,
	'images public-init': imagesPublicInit,
	'images check-derivatives': imagesCheckDerivatives,
	'images sync': imagesSync,
	'images prune': imagesPrune,
	'images check-live': imagesCheckLive,
	'content translation-marker confirm': translationMarkerConfirm,
	'content translation-marker compute': translationMarkerCompute,
	'content translation-marker check': translationMarkerCheck,
	'content factcheck extract': factcheckExtract,
	'content factcheck merge': factcheckMerge,
	'content factcheck researched': factcheckResearched,
	'content factcheck decide': factcheckDecide,
	'content factcheck review': factcheckReview,
}

export type CliEnv = Omit<CliContext, 'root' | 'options'>

export type CliOptions = CliContext['options']

export type ParsedArgs = {
	command: string
	root?: string
	help: boolean
	options: CliOptions
	// options no command takes, read as flags since their form is unknown
	unknown: string[]
}

// every option of every command, by name: its form
export const OPTION_FORMS: ReadonlyMap<string, OptionForm> = new Map(
	COMMANDS.flatMap(({ options }) => options).map((option) => [
		optionName(option),
		optionForm(option),
	]),
)

const ROOT_NAME = optionName(ROOT_OPTION)

const optionValue = (name: string, value: string | undefined): string => {
	if (value === undefined || value === '' || value.startsWith('-'))
		throw new Error(name === ROOT_NAME ? '--root needs a directory' : `${name} needs a value`)
	return value
}

// `--root <dir>`, `--help` and the options of the commands may stand anywhere; the other words name
// the command. Whether the command takes an option is checked by `runCli`
export function parseArgs(argv: readonly string[]): ParsedArgs {
	const words: string[] = []
	const options: Record<string, string | true | string[]> = {}
	const unknown: string[] = []
	let help = false
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]!
		if (arg === HELP_OPTION) {
			help = true
			continue
		}
		if (!arg.startsWith('-')) {
			words.push(arg)
			continue
		}
		const equals = arg.indexOf('=')
		const name = equals === -1 ? arg : arg.slice(0, equals)
		const form = OPTION_FORMS.get(name)
		if (form === undefined) {
			unknown.push(name)
			continue
		}
		if (form === 'flag') {
			if (equals !== -1) throw new Error(`${name} takes no value`)
			options[name] = true
			continue
		}
		const value = optionValue(name, equals === -1 ? argv[++index] : arg.slice(equals + 1))
		if (form === 'value') options[name] = value
		else options[name] = [...((options[name] as string[] | undefined) ?? []), value]
	}
	const { [ROOT_NAME]: root, ...rest } = options
	return {
		command: words.join(' '),
		...(root === undefined ? {} : { root: root as string }),
		help,
		options: rest,
		unknown,
	}
}

const isDirectory = (directory: string): boolean =>
	statSync(directory, { throwIfNoEntry: false })?.isDirectory() ?? false

// the command the words name, or the longest one they start with when the value of an unknown option
// took a word's place
const commandOf = (command: string): CommandSpec | undefined =>
	COMMANDS.filter(({ name }) => command === name || command.startsWith(`${name} `)).sort(
		(a, b) => b.name.length - a.name.length,
	)[0]

// the first option given that the command does not take
function foreignOption(args: ParsedArgs, spec: CommandSpec | undefined): string | undefined {
	if (args.unknown.length > 0) return args.unknown[0]
	if (!spec) return undefined
	const own = new Set(spec.options.map(optionName))
	return Object.keys(args.options).find((name) => !own.has(name))
}

export async function runCli(argv: readonly string[], env: CliEnv): Promise<number> {
	let args: ParsedArgs
	try {
		args = parseArgs(argv)
	} catch (error) {
		env.err((error as Error).message)
		env.err(usage())
		return 2
	}
	if (args.help) {
		env.out(usage())
		return 0
	}
	const spec = commandOf(args.command)
	const foreign = foreignOption(args, spec)
	if (foreign !== undefined) {
		env.err(`unknown option: ${foreign}`)
		env.err(spec ? `options of ${spec.name}: ${spec.options.join(', ')}` : usage())
		return 2
	}
	const runner = Object.hasOwn(RUNNERS, args.command) ? RUNNERS[args.command] : undefined
	if (args.command === '' || !runner) {
		env.err(args.command === '' ? 'no command given' : `unknown command: ${args.command}`)
		env.err(usage())
		return 2
	}
	const root = path.resolve(env.cwd, args.root ?? '.')
	const config = path.join(root, SITE_CONFIG_PATH)
	if (!isDirectory(root) || !existsSync(config)) {
		env.err(`${toLabel(env.cwd, config)}: missing; --root must name a site root`)
		return 2
	}
	try {
		return await runner({ ...env, root, options: args.options })
	} catch (error) {
		env.err(`${args.command} FAIL: ${(error as Error).message}`)
		return 1
	}
}
