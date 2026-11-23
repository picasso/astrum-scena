import { type CliContext, label } from '../context.ts'
import { verifyImageFiles } from '../image-files.ts'

// the derivatives a site serves itself match its tracked release file for file, by size and sha256,
// with nothing extra
export function checkImageFiles(context: CliContext): number {
	const report = verifyImageFiles(context.root)
	if (report.kind === 'external') {
		context.out(`check image-files OK (images served from ${report.origin}; nothing to check)`)
		return 0
	}
	const directory = label(context, report.directory)
	const problems = [
		['missing', report.missing],
		['changed (size or sha256)', report.changed],
		['not in the release', report.extra],
	] as const
	if (report.stale || problems.some(([, keys]) => keys.length > 0)) {
		context.err(`check image-files FAILED (${directory}):`)
		if (report.stale)
			context.err(
				'  - stale release: the images section of the site config changed after the derivatives were cut',
			)
		for (const [name, keys] of problems)
			for (const key of keys) context.err(`  - ${name}: ${key}`)
		context.err(
			'Regenerate the derivatives and the release with the image pipeline that wrote them (the demo: pnpm demo:images).',
		)
		return 1
	}
	context.out('check image-files OK')
	context.out(`  path:  ${directory}`)
	context.out(`  files: ${report.checked}`)
	return 0
}
