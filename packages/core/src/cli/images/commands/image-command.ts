import path from 'node:path'

import { KEBAB_CASE_PATTERN } from '../../../config/kebab-case.ts'
import { type CliContext, label, stringOption } from '../../context.ts'
import { endExifTool } from '../exiftool.ts'
import { describeError } from '../source-resolver.ts'

// what every image command shares: its failure line names files relative to the current directory,
// never by the site's absolute path, and the ExifTool child process ends with the command

export const RELEASE_OPTION = '--release'

export function siteRelative(context: CliContext, message: string): string {
	const rootLabel = label(context, context.root)
	const prefix = rootLabel === '.' ? '' : `${rootLabel}/`
	return message.replaceAll(context.root + path.sep, prefix).replaceAll(context.root, rootLabel)
}

export async function runImageCommand(
	context: CliContext,
	name: string,
	body: () => Promise<number>,
): Promise<number> {
	try {
		return await body()
	} catch (error) {
		context.err(`${name} FAIL: ${siteRelative(context, describeError(error))}`)
		return 1
	} finally {
		await endExifTool()
	}
}

export function assertReleaseId(id: string, option = RELEASE_OPTION): string {
	if (!KEBAB_CASE_PATTERN.test(id)) throw new Error(`${option} "${id}" must be a kebab-case id`)
	return id
}

export function releaseOption(context: CliContext): string | undefined {
	const id = stringOption(context, RELEASE_OPTION)
	return id === undefined ? undefined : assertReleaseId(id)
}
