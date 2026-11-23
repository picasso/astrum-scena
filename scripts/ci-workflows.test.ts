import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { R2_ENV_VARS } from '../packages/core/src/cli/images/r2-env.ts'
import { CONSUMER_ENV } from '../packages/core/src/consumer-env.ts'

type Step = {
	id?: string
	name?: string
	if?: string
	uses?: string
	run?: string
	env?: Record<string, string>
	with?: Record<string, unknown>
}
type Job = {
	if?: string
	needs?: string | string[]
	uses?: string
	with?: Record<string, unknown>
	secrets?: unknown
	permissions?: Record<string, string>
	concurrency?: Record<string, unknown>
	container?: { image: string }
	steps?: Step[]
}
type Workflow = {
	on: Record<string, unknown>
	jobs: Record<string, Job>
}

const WORKFLOWS = readdirSync(join('.github', 'workflows'))
	.filter((file) => /\.ya?ml$/.test(file))
	.sort()
const text = (file: string): string => readFileSync(join('.github', 'workflows', file), 'utf8')
const workflow = (file: string): Workflow => parse(text(file)) as Workflow
const site = workflow('site.yml')
const steps = (job: string): Step[] => site.jobs[job]!.steps!

const CLOUDFLARE_SECRETS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']
const PUBLIC_BUILD_ENV = Object.entries(CONSUMER_ENV)
	.filter(([name, kind]) => kind === 'public' && name.startsWith('PUBLIC_'))
	.map(([name]) => name)

const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/

const stepIndex = (job: string, match: (step: Step) => boolean): number => {
	const index = steps(job).findIndex(match)
	if (index < 0) throw new Error(`no such step in ${job}`)
	return index
}

// runs a `run:` script of the workflow with bash, as the runner does
function runScript(script: string, env: Record<string, string>) {
	const dir = mkdtempSync(join(tmpdir(), 'ci-workflows-'))
	const files = { GITHUB_ENV: join(dir, 'env'), GITHUB_OUTPUT: join(dir, 'output') }
	for (const file of Object.values(files)) writeFileSync(file, '')
	try {
		const result = spawnSync('bash', ['-e', '-c', script], {
			encoding: 'utf8',
			env: { PATH: process.env.PATH ?? '', ...files, ...env },
		})
		return {
			status: result.status,
			stdout: result.stdout,
			githubEnv: readFileSync(files.GITHUB_ENV, 'utf8'),
			output: readFileSync(files.GITHUB_OUTPUT, 'utf8'),
		}
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

describe('every workflow', () => {
	it.each(WORKFLOWS)('%s passes no secrets: inherit', (file) => {
		expect(text(file)).not.toMatch(/\binherit\b/)
	})

	it.each(WORKFLOWS)('%s pins every external action to a commit SHA with its version', (file) => {
		const refs = [...text(file).matchAll(/^\s*(?:-\s+)?uses:\s*(\S.*)$/gm)].map((m) => m[1]!)
		expect(refs.length).toBeGreaterThan(0)
		for (const ref of refs.filter((ref) => !ref.startsWith('./')))
			expect(ref, `${file}: ${ref}`).toMatch(PINNED)
	})

	it.each(WORKFLOWS)('%s pins every container image by digest', (file) => {
		for (const job of Object.values(workflow(file).jobs))
			if (job.container) expect(job.container.image).toMatch(/@sha256:[0-9a-f]{64}$/)
	})

	it.each(WORKFLOWS)('%s runs no command that writes to the bucket', (file) => {
		expect(text(file)).not.toMatch(/images\s+(sync|prune|activate)\b/)
	})
})

describe('site.yml', () => {
	const call = site.on.workflow_call as {
		inputs: Record<string, unknown>
		secrets: Record<string, { required: boolean }>
	}

	it('is only a reusable workflow', () => {
		expect(Object.keys(site.on)).toEqual(['workflow_call'])
		expect(Object.keys(call.inputs).sort()).toEqual(
			['deploy', 'live-checks', 'node-version-file', 'public-env', 'site-artifact'].sort(),
		)
	})

	it('declares each secret by name, none required, and reads no other', () => {
		const declared = [...CLOUDFLARE_SECRETS, ...R2_ENV_VARS]
		expect(Object.keys(call.secrets).sort()).toEqual([...declared].sort())
		for (const secret of Object.values(call.secrets)) expect(secret.required).toBe(false)
		const read = [...text('site.yml').matchAll(/(?<![.\w])secrets\.(\w+)/g)].map((m) => m[1]!)
		expect(new Set(read)).toEqual(new Set(declared))
	})

	it('runs the gates and the build without a secret', () => {
		expect(JSON.stringify(site.jobs.gates)).not.toMatch(/secrets\./)
		const runs = steps('gates').map((step) => step.run ?? '')
		expect(runs).toContain('pnpm install --frozen-lockfile')
		expect(runs).toContain('pnpm exec astrum-scena check')
		expect(runs).toContain('pnpm exec astro build')
	})

	it('reads the public build variables before the install and the build', () => {
		const check = stepIndex('gates', (step) => step.env?.PUBLIC_ENV !== undefined)
		expect(check).toBe(0)
		expect(steps('gates')[check]!.env!.PUBLIC_ENV_NAMES!.split(' ')).toEqual(PUBLIC_BUILD_ENV)
	})

	describe('the public-env check', () => {
		const step = steps('gates')[0]!
		const check = (publicEnv: string) =>
			runScript(step.run!, { ...step.env, PUBLIC_ENV: publicEnv } as Record<string, string>)
		const name = PUBLIC_BUILD_ENV[0]!

		it('passes the core names to the build environment', () => {
			const result = check(`${name}=key-1\n\n`)
			expect(result.status).toBe(0)
			expect(result.githubEnv).toBe(`${name}=key-1\n`)
			expect(check('').githubEnv).toBe('')
		})

		it('fails on a name the core does not read and lists the allowed ones', () => {
			const result = check('FOO=1')
			expect(result.status).toBe(1)
			expect(result.stdout).toContain(
				`::error::public-env: FOO is not a public build variable of the core; allowed: ${PUBLIC_BUILD_ENV.join(' ')}`,
			)
			expect(result.githubEnv).toBe('')
			expect(check(name).status).toBe(1)
		})

		it('fails on an empty value', () => {
			const result = check(`${name}=`)
			expect(result.status).toBe(1)
			expect(result.stdout).toContain(`::error::public-env: ${name} has an empty value`)
		})
	})

	it.each([
		['live', R2_ENV_VARS],
		['deploy', CLOUDFLARE_SECRETS],
	] as const)('%s skips its work with a notice without a secret', (job, secrets) => {
		const [gate, ...rest] = steps(job)
		expect(gate!.id).toBe('secrets')
		expect(Object.keys(gate!.env!).sort()).toEqual([...secrets].sort())
		const missing = runScript(gate!.run!, {})
		expect(missing.status).toBe(0)
		expect(missing.stdout).toBe(`::notice::${job}: skipped — ${secrets[0]} is not available\n`)
		expect(missing.output).toBe('available=false\n')
		const present = runScript(
			gate!.run!,
			Object.fromEntries(secrets.map((name) => [name, 'x'])),
		)
		expect(present.output).toBe('available=true\n')
		for (const step of rest)
			expect(step.if, step.name ?? step.uses).toMatch(/^steps\.|^always\(\)/)
	})

	it('checks the bucket only with the read-only check-live', () => {
		const runs = steps('live')
			.map((step) => step.run ?? '')
			.filter((run) => run.includes('astrum-scena'))
		expect(runs).toEqual(['pnpm exec astrum-scena images check-live'])
	})

	describe('deploy', () => {
		const deploy = site.jobs.deploy!

		it('runs only on a push to main with deploy: true', () => {
			for (const condition of [
				'inputs.deploy',
				"github.event_name == 'push'",
				"github.ref == 'refs/heads/main'",
				"needs.gates.result == 'success'",
			])
				expect(deploy.if).toContain(condition)
		})

		it('queues in production-deploy and is never cancelled', () => {
			expect(deploy.concurrency).toEqual({
				group: 'production-deploy',
				queue: 'max',
				'cancel-in-progress': false,
			})
		})

		it('checks freshness before it registers a deployment or runs Wrangler', () => {
			const freshness = stepIndex('deploy', (step) => step.id === 'freshness')
			const script = String(steps('deploy')[freshness]!.with!.script)
			expect(script).toContain("branch: 'main'")
			expect(script).toContain('data.commit.sha === context.sha')
			expect(script).toContain('throw new Error')
			const register = stepIndex('deploy', (step) =>
				String(step.with?.script ?? '').includes('createDeployment'),
			)
			const wrangler = stepIndex(
				'deploy',
				(step) => step.uses?.startsWith('cloudflare/wrangler-action@') ?? false,
			)
			expect(freshness).toBeLessThan(register)
			expect(freshness).toBeLessThan(wrangler)
			for (const step of steps('deploy').slice(freshness + 1, wrangler + 1))
				expect(step.if, step.name ?? step.uses).toBe(
					"steps.freshness.outputs.current == 'true'",
				)
			const download = stepIndex('deploy', (step) => step.with?.name === 'dist')
			expect(download).toBeLessThan(freshness)
		})

		const scriptOf = (id: string): string =>
			String(steps('deploy').find((step) => step.id === id)!.with!.script)

		// runs a github-script body as the action does: an async function of its globals
		async function runGithubScript(
			script: string,
			github: unknown,
			env: Record<string, string> = {},
		) {
			const outputs: Record<string, unknown> = {}
			const notices: string[] = []
			const core = {
				setOutput: (name: string, value: unknown) => (outputs[name] = value),
				notice: (message: string) => notices.push(message),
			}
			const context = {
				sha: 'a'.repeat(40),
				repo: { owner: 'owner', repo: 'repo' },
				serverUrl: 'https://github.example',
				runId: 7,
			}
			const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
				...args: string[]
			) => (...values: unknown[]) => Promise<unknown>
			await new AsyncFunction('github', 'context', 'core', 'process', script)(
				github,
				context,
				core,
				{ env },
			)
			return { outputs, notices }
		}

		const branchApi = (sha: string | undefined) => ({
			rest: { repos: { getBranch: async () => ({ data: { commit: sha ? { sha } : {} } }) } },
		})

		it('the freshness check passes only the head of main and fails without its SHA', async () => {
			const script = scriptOf('freshness')
			const current = await runGithubScript(script, branchApi('a'.repeat(40)))
			expect(current.outputs).toEqual({ current: 'true' })
			expect(current.notices).toEqual([])
			const stale = await runGithubScript(script, branchApi('b'.repeat(40)))
			expect(stale.outputs).toEqual({ current: 'false' })
			expect(stale.notices).toHaveLength(1)
			expect(stale.notices[0]).toContain('b'.repeat(40))
			await expect(runGithubScript(script, branchApi(undefined))).rejects.toThrow(
				'Cannot verify the current main SHA',
			)
		})

		it('the deployment status follows the job status of the registered deployment', async () => {
			const finish = steps('deploy').find((step) => step.name === 'Finish GitHub deployment')!
			const script = String(finish.with!.script)
			for (const [status, state] of [
				['success', 'success'],
				['failure', 'failure'],
				['cancelled', 'failure'],
			]) {
				const sent: Record<string, unknown>[] = []
				const github = {
					rest: {
						repos: {
							createDeploymentStatus: async (params: Record<string, unknown>) => {
								sent.push(params)
							},
						},
					},
				}
				await runGithubScript(script, github, { JOB_STATUS: status!, DEPLOY_ID: '42' })
				expect(sent).toHaveLength(1)
				expect(sent[0]).toMatchObject({ deployment_id: 42, state })
			}
		})

		it("ships the dist of the gates job with the Wrangler of the site's lockfile", () => {
			const download = steps('deploy').find((step) => step.with?.name === 'dist')
			expect(download?.uses).toMatch(/^actions\/download-artifact@/)
			const upload = steps('gates').find((step) => step.with?.name === 'dist')
			expect(upload?.uses).toMatch(/^actions\/upload-artifact@/)
			const runs = steps('deploy').map((step) => step.run ?? '')
			expect(runs.some((run) => run.includes('pnpm exec wrangler --version'))).toBe(true)
			expect(JSON.stringify(steps('deploy'))).not.toContain('wranglerVersion')
		})
	})
})

describe('ci.yml', () => {
	it('builds the demo through site.yml from the portable site artifact', () => {
		const ci = workflow('ci.yml')
		const demo = Object.values(ci.jobs).find(
			(job) => job.uses === './.github/workflows/site.yml',
		)
		expect(demo?.with?.['site-artifact']).toBeTruthy()
		expect(demo?.with?.deploy).toBe(false)
		expect(demo?.secrets).toBeUndefined()
		const producer = ci.jobs[String(demo?.needs)]!
		const upload = producer.steps!.find(
			(step) => step.with?.name === demo?.with?.['site-artifact'],
		)
		expect(upload?.uses).toMatch(/^actions\/upload-artifact@/)
		expect(producer.steps!.some((step) => step.run?.startsWith('pnpm demo:packed --out'))).toBe(
			true,
		)
	})
})
