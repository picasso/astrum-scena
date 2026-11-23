import { loadSiteSection } from '../../../config/loader.ts'
import {
	assertValidRepositoryContent,
	lockedModules,
	moduleTargetErrors,
} from '../../../lib/content/files.ts'
import { disabledModuleContentErrors } from '../../../modules/registry.ts'
import type { CliContext } from '../../context.ts'

// the content of the site parses against its schemas and holds together: references, locales, legal
// texts and markup, and nothing belongs to a module the lock leaves disabled, which the build rejects
export async function checkContent(context: CliContext): Promise<number> {
	const { locales, referenceLocale } = loadSiteSection(context.root, 'content')
	const modules = lockedModules(context.root)
	let snapshot
	try {
		const moduleErrors = [
			...disabledModuleContentErrors(
				context.root,
				modules.map((module) => module.id),
			),
			...(await moduleTargetErrors(context.root, modules)),
		]
		if (moduleErrors.length > 0) throw new Error(moduleErrors.join('\n'))
		snapshot = await assertValidRepositoryContent(
			context.root,
			referenceLocale,
			locales,
			modules,
		)
	} catch (error) {
		context.err(`check content FAIL: ${(error as Error).message}`)
		return 1
	}
	const counts = [
		`${snapshot.albums.length} albums`,
		`${snapshot.photos.length} photos`,
		`${snapshot.articles.length} articles`,
		`${snapshot.pages.length} pages`,
		`${snapshot.courses.length} courses`,
	]
	context.out(`check content OK (${counts.join(', ')})`)
	return 0
}
