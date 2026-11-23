import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { loadImageConfig } from '../../../lib/images/build/config.ts'
import {
	buildImagePublicConfig,
	IMAGES_PUBLIC_RELATIVE_PATH,
	serializeImagePublicConfig,
} from '../../../lib/images/public-config.ts'
import { type CliContext, label } from '../../context.ts'
import { runImageCommand } from './image-command.ts'

// a pure projection of the `images` section of the config, not release state, so rewriting it is
// safe at any time and reproduces the same bytes

const NAME = 'images public-init'

export function imagesPublicInit(context: CliContext): Promise<number> {
	return runImageCommand(context, NAME, async () => {
		const publicConfig = buildImagePublicConfig(loadImageConfig(context.root))
		const output = path.join(context.root, IMAGES_PUBLIC_RELATIVE_PATH)
		mkdirSync(path.dirname(output), { recursive: true })
		const tempPath = `${output}.tmp`
		writeFileSync(tempPath, serializeImagePublicConfig(publicConfig), 'utf8')
		renameSync(tempPath, output)
		context.out(`${NAME} OK`)
		context.out(`  path:   ${label(context, output)}`)
		context.out(`  images: ${publicConfig.publicOrigin ?? publicConfig.publicPath}`)
		return 0
	})
}
