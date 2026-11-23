import { readFile, rename, writeFile } from 'node:fs/promises'

import { loadImageConfig } from '../../../lib/images/build/config.ts'
import { type CliContext, label } from '../../context.ts'
import { type ColorMode, detectColorMode } from '../colormode.ts'
import { contentPhotoIds, readContentPhoto } from '../content-photos.ts'
import { resolveExternalRoots } from '../external-roots.ts'
import { loadMastersRegistry } from '../masters.ts'
import { setPhotoColorMode } from '../photo-yaml.ts'
import { masterRequestFromSource, resolveMaster } from '../source-resolver.ts'
import { runImageCommand } from './image-command.ts'

// detects the colorMode of each photo from its master (ADR-0010) and writes it into the photo's YAML
// when the photo has none. Every master is detected before any file is written, so a missing master
// writes nothing

const NAME = 'images colormode'

async function writeAtomic(filePath: string, content: string): Promise<void> {
	const temporaryPath = `${filePath}.tmp`
	await writeFile(temporaryPath, content, 'utf8')
	await rename(temporaryPath, filePath)
}

export function imagesColormode(context: CliContext): Promise<number> {
	return runImageCommand(context, NAME, async () => {
		const { root } = context
		const roots = resolveExternalRoots(context)
		const config = loadImageConfig(root)
		const registry = await loadMastersRegistry(root)

		const photos = contentPhotoIds(root).map((id) => readContentPhoto(root, id))
		const requests = photos.map((photo) => masterRequestFromSource(photo.id, photo.data))
		const detected: ColorMode[] = []
		for (const request of requests) {
			const master = await resolveMaster(request, { ...roots, registry, config })
			detected.push(await detectColorMode(await readFile(master.masterPath)))
		}

		// every file is checked before the first one is written
		const updates = photos.map((photo, index) => ({
			photo,
			mode: detected[index]!,
			...setPhotoColorMode(photo.raw, detected[index]!, label(context, photo.filePath)),
		}))
		const added: string[] = []
		const diverging: string[] = []
		for (const { photo, mode, output, previous } of updates) {
			if (previous === undefined) {
				await writeAtomic(photo.filePath, output)
				added.push(`${photo.id} (${mode})`)
			} else if (previous !== mode) {
				diverging.push(`${photo.id}: kept ${previous}, detected ${mode}`)
			}
		}

		context.out(`${NAME} OK`)
		context.out(`  photos:    ${photos.length}`)
		context.out(`  added:     ${added.length > 0 ? added.join(', ') : 'none'}`)
		context.out(`  unchanged: ${photos.length - added.length}`)
		if (diverging.length > 0) {
			context.out('  warning: colorMode differs from detection (authored override kept):')
			for (const line of diverging) context.out(`    ${line}`)
			context.out('  To re-detect after a master change, delete the field and rerun.')
		}
		return 0
	})
}
