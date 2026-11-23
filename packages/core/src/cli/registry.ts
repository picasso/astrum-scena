// the commands of the `astrum-scena` bin, a public API of the core: the API snapshot lists each with
// its options (`pnpm api:snapshot`), so removing one is a breaking change. Every command works on one
// site, whose root `--root` names (the current directory by default).

export const BIN = 'astrum-scena'

export const ROOT_OPTION = '--root <dir>'
export const HELP_OPTION = '--help'

export const GATES = [
	'config-lock',
	'layout-tokens',
	'color-literals',
	'css-layers',
	'pages',
	'image-files',
	'images-policy',
	'images-public-config',
	'place-gps-bounds',
	'content',
	'factcheck',
	'skills',
	'core-version',
] as const
export type Gate = (typeof GATES)[number]

// the writer of files the site's owner edits by hand
export const OWNER = 'owner'

// the one contract each gate holds and who writes the files it pins: a command of the bin or the
// owner. A gate checks nothing another gate checks; the registry test keeps the contracts distinct
// and every writer a command or the owner
export const CONTRACTS: Record<Gate, { contract: string; writer: string }> = {
	'config-lock': {
		contract: 'site.lock.yaml is what resolving site.yaml over the core defaults makes',
		writer: 'config resolve',
	},
	'layout-tokens': {
		contract: 'the layout CSS tokens are what `layout` of the site config makes',
		writer: 'layout-tokens',
	},
	'color-literals': {
		contract: 'no CSS outside the theme file carries a color literal',
		writer: OWNER,
	},
	'css-layers': {
		contract: 'every CSS rule sits in a cascade layer and every chunk declares the order first',
		writer: OWNER,
	},
	pages: {
		contract: 'no test file sits under a pages directory of the core, a module or the site',
		writer: OWNER,
	},
	'image-files': {
		contract: 'the derivatives the site serves match its tracked release file for file',
		writer: 'images build',
	},
	'images-policy': {
		contract:
			'the release descriptor holds its schema, bytes, config digest, policy and width ladder',
		writer: 'images activate',
	},
	'images-public-config': {
		contract: 'the tracked public images config is the projection of the images section',
		writer: 'images public-init',
	},
	'place-gps-bounds': {
		contract: 'the place zones parse and name only existing places',
		writer: OWNER,
	},
	content: {
		contract: 'the content parses against its schemas and holds together',
		writer: OWNER,
	},
	factcheck: {
		contract: 'the fact-check ledger holds together and the review packet is its projection',
		writer: 'content factcheck review',
	},
	skills: {
		contract: "the core's skills and agents in the site are the copies of the installed core",
		writer: 'install',
	},
	'core-version': {
		contract:
			"the site's workflows run site.yml of the installed core, which CI installs from the lockfile",
		writer: OWNER,
	},
}

// an option is `--name` (a flag), `--name <value>` or `--name <value>…` (given any number of times);
// one name takes the same form in every command
export type CommandSpec = { name: string; summary: string; options: readonly string[] }

const SITE_OPTIONS = [ROOT_OPTION]

const MASTERS_OPTION = '--masters <dir>'
const ARCHIVE_OPTION = '--archive <dir>'
const RELEASE_OPTION = '--release <id>'

export const IMAGE_COMMANDS: readonly CommandSpec[] = [
	{
		name: 'images build',
		summary: 'cut the derivatives of the photos into a release under .cache/images/releases',
		options: [
			...SITE_OPTIONS,
			MASTERS_OPTION,
			ARCHIVE_OPTION,
			RELEASE_OPTION,
			'--photos <ids>',
		],
	},
	{
		name: 'images activate',
		summary:
			'switch the release descriptor to a checked release, or --recover an interrupted one',
		options: [...SITE_OPTIONS, RELEASE_OPTION, '--recover'],
	},
	{
		name: 'images colormode',
		summary: 'write the colorMode detected from each master into its photo',
		options: [...SITE_OPTIONS, MASTERS_OPTION, ARCHIVE_OPTION],
	},
	{
		name: 'images ladder-report',
		summary: 'report the width ladder of a release, its size and its pixel replay',
		options: [...SITE_OPTIONS, RELEASE_OPTION, '--compare <id>', '--pixels'],
	},
	{
		name: 'images public-init',
		summary: 'write src/generated/images-public.json from the images section of the config',
		options: SITE_OPTIONS,
	},
	{
		name: 'images check-derivatives',
		summary: 'check the files of a release against its manifest, rights and privacy',
		options: [...SITE_OPTIONS, RELEASE_OPTION],
	},
	{
		name: 'images sync',
		summary: 'publish a checked release to the bucket and record it in the publication ledger',
		options: [...SITE_OPTIONS, RELEASE_OPTION, '--dry-run'],
	},
	{
		name: 'images prune',
		summary: 'report the bucket objects no manifest references; deletes nothing',
		options: [...SITE_OPTIONS, RELEASE_OPTION],
	},
	{
		name: 'images check-live',
		summary:
			'check the bucket and the public origin against the release descriptor or a release',
		options: [...SITE_OPTIONS, RELEASE_OPTION],
	},
]

const KEY_OPTION = '--key <key>'
const DATE_OPTION = '--date <yyyy-mm-dd>'

export const CONTENT_COMMANDS: readonly CommandSpec[] = [
	{
		name: 'content translation-marker confirm',
		summary:
			'plan, or with --write insert, the translatedFromDigest marker of the selected translations',
		options: [...SITE_OPTIONS, '--document <collection>/<key>…', '--all', '--write'],
	},
	{
		name: 'content translation-marker compute',
		summary: 'print the digest of the reference-locale body of one document',
		options: [...SITE_OPTIONS, KEY_OPTION],
	},
	{
		name: 'content translation-marker check',
		summary: 'report each translation as current or needs-review; advisory, always exits 0',
		options: SITE_OPTIONS,
	},
	{
		name: 'content factcheck extract',
		summary:
			'seed the fact-check ledger with every document and body URL; --check only reports gaps',
		options: [...SITE_OPTIONS, '--check'],
	},
	{
		name: 'content factcheck merge',
		summary: "merge a researcher's JSON array of findings into one document of the ledger",
		options: [...SITE_OPTIONS, KEY_OPTION, '--findings <file>', DATE_OPTION],
	},
	{
		name: 'content factcheck researched',
		summary: 'stamp a document of the ledger as researched against its current text',
		options: [...SITE_OPTIONS, KEY_OPTION, DATE_OPTION],
	},
	{
		name: 'content factcheck decide',
		summary: "record the owner's decisions on findings of one document of the ledger",
		options: [...SITE_OPTIONS, KEY_OPTION, '--set <id=status>…'],
	},
	{
		name: 'content factcheck review',
		summary: 'write the review packet data/factcheck/review.md from the ledger',
		options: SITE_OPTIONS,
	},
]

export const COMMANDS: readonly CommandSpec[] = [
	{
		name: 'config resolve',
		summary: 'write site.lock.yaml from the site config and the core defaults',
		options: SITE_OPTIONS,
	},
	{
		name: 'layout-tokens',
		summary: 'write the layout CSS tokens from `layout` of the site config',
		options: SITE_OPTIONS,
	},
	{
		name: 'install',
		summary:
			"install the core's skills and agents, the AGENTS.md block and the configs of its presets",
		options: SITE_OPTIONS,
	},
	{ name: 'check', summary: 'run every gate of the site files', options: SITE_OPTIONS },
	...GATES.map((gate) => ({
		name: `check ${gate}`,
		summary: `run the ${gate} gate`,
		options: SITE_OPTIONS,
	})),
	...IMAGE_COMMANDS,
	...CONTENT_COMMANDS,
]

export const optionName = (option: string): string => option.split(' ')[0]!

export type OptionForm = 'flag' | 'value' | 'repeated'

export const optionForm = (option: string): OptionForm =>
	!option.includes(' ') ? 'flag' : option.endsWith('…') ? 'repeated' : 'value'

// the snapshot form: the bin with each command, and each command with each of its options
export const cliSurface = (): string[] =>
	[
		`${BIN} ${HELP_OPTION}`,
		...COMMANDS.flatMap(({ name, options }) => [
			`${BIN} ${name}`,
			...options.map((option) => `${BIN} ${name} ${option}`),
		]),
	].sort()

const COLUMN = 28

const ownOptions = (options: readonly string[]): string =>
	options.filter((option) => option !== ROOT_OPTION).join(' ') || '(none)'

export const usage = (): string =>
	[
		`usage: ${BIN} <command> [${ROOT_OPTION}] [options]`,
		'',
		'commands:',
		...COMMANDS.map(({ name, summary }) => `  ${name.padEnd(COLUMN)} ${summary}`),
		'',
		'options:',
		`  ${ROOT_OPTION.padEnd(COLUMN)} the site root (default: the current directory)`,
		`  ${HELP_OPTION.padEnd(COLUMN)} show this help`,
		'',
		'options of the images commands:',
		...IMAGE_COMMANDS.map(
			({ name, options }) => `  ${name.padEnd(COLUMN)} ${ownOptions(options)}`,
		),
		'',
		'options of the content commands (… may be given more than once):',
		...CONTENT_COMMANDS.map(
			({ name, options }) => `  ${name.padEnd(COLUMN)} ${ownOptions(options)}`,
		),
	].join('\n')
