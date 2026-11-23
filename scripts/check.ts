import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// the site gates run the core's bin, which typecheck builds into dist/ first
export const CHECK_GROUPS = [
	['typecheck', 'check:site', 'test'],
	['format:check', 'lint:md'],
	['check:identity', 'check:local-paths'],
	[
		'lint',
		'check:code-comments',
		'check:taxonomy-readers',
		'check:api-snapshot',
		'check:upgrading',
		'check:notices',
	],
] as const

export async function runGroups(
	groups: readonly (readonly string[])[],
	run: (command: string) => Promise<void>,
	concurrency = 2,
): Promise<boolean> {
	if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid concurrency')
	let next = 0
	let passed = true
	await Promise.all(
		Array.from({ length: Math.min(concurrency, groups.length) }, async () => {
			while (next < groups.length) {
				const group = groups[next++]!
				try {
					for (const command of group) await run(command)
				} catch (error) {
					console.error(error instanceof Error ? error.message : error)
					passed = false
				}
			}
		}),
	)
	return passed
}

async function main(): Promise<void> {
	const groups = new Set<number>()
	let stopping = false
	let cleanup: Promise<void> | undefined
	const signalGroups = (signal: NodeJS.Signals) => {
		for (const id of groups) {
			try {
				process.kill(-id, signal)
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
			}
		}
	}
	const onSignal = (signal: NodeJS.Signals) => {
		if (stopping) return
		stopping = true
		process.exitCode = signal === 'SIGINT' ? 130 : 143
		// retain group IDs until forced cleanup, even if their leaders exit first.
		cleanup = new Promise((resolve) => {
			setTimeout(() => {
				signalGroups('SIGKILL')
				resolve()
			}, 5000)
		})
		signalGroups(signal)
	}
	const onInterrupt = () => onSignal('SIGINT')
	const onTerminate = () => onSignal('SIGTERM')
	process.on('SIGINT', onInterrupt)
	process.on('SIGTERM', onTerminate)
	try {
		const passed = await runGroups(CHECK_GROUPS, (command) => {
			if (stopping) return Promise.reject(new Error('Checks cancelled'))
			return new Promise<void>((resolve, reject) => {
				const child = spawn('pnpm', [command], { stdio: 'inherit', detached: true })
				if (child.pid) groups.add(child.pid)
				child.once('error', reject)
				child.once('close', (code, signal) => {
					if (!stopping && child.pid) groups.delete(child.pid)
					if (code === 0) resolve()
					else reject(new Error(`${command} failed (${signal ?? code})`))
				})
			})
		})
		if (!passed && !process.exitCode) process.exitCode = 1
	} finally {
		await cleanup
		process.off('SIGINT', onInterrupt)
		process.off('SIGTERM', onTerminate)
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
