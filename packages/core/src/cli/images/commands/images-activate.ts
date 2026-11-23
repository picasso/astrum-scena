import { RELEASE_DESCRIPTOR_RELATIVE_PATH } from '../../../lib/images/release.ts'
import { type CliContext, command, flagOption } from '../../context.ts'
import { activateRelease, recoverActivation } from '../activate.ts'
import { releaseOption, runImageCommand } from './image-command.ts'

// journaled activation: `--release <id>` switches the release descriptor to a checked cache release,
// `--recover` finishes or rolls back an interrupted activation. It writes only the descriptor: a site
// that serves its images itself copies the derivatives with its own pipeline, and nothing here
// commits, pushes or deploys

const NAME = 'images activate'

export function imagesActivate(context: CliContext): Promise<number> {
	return runImageCommand(context, NAME, async () => {
		const recoverHint = command(context, `${NAME} --recover`)
		if (flagOption(context, '--recover')) {
			const { action } = await recoverActivation(context.root)
			context.out(`${NAME} --recover OK (${action})`)
			return 0
		}
		const releaseId = releaseOption(context)
		if (releaseId === undefined)
			throw new Error('--release <id> names the release to activate (or pass --recover)')
		try {
			const { token } = await activateRelease(context.root, releaseId)
			context.out(`${NAME} OK`)
			context.out(`  release:    ${releaseId}`)
			context.out(`  token:      ${token}`)
			context.out(`  descriptor: ${RELEASE_DESCRIPTOR_RELATIVE_PATH} (active; not committed)`)
			return 0
		} catch (error) {
			throw new Error(
				`${(error as Error).message}. If an activation was interrupted, run: ${recoverHint}`,
				{ cause: error },
			)
		}
	})
}
