import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { z } from 'astro/zod'
import { parse } from 'yaml'

// reading and validating the YAML files of the site config, with every error prefixed by the file

export const readYaml = (root: string, filePath: string): unknown => {
	try {
		return parse(readFileSync(path.resolve(root, filePath), 'utf8'))
	} catch (error) {
		throw new Error(`${filePath}: ${(error as Error).message}`, { cause: error })
	}
}

type Issue = z.ZodError['issues'][number]

// a union branch that failed only on its own type or literal is not the one the value was meant for
const isOwnMismatch = (issue: Issue) =>
	issue.path.length === 0 && (issue.code === 'invalid_type' || issue.code === 'invalid_value')

// the full dotted path of each issue, e.g. `images.ladder.widthz: unrecognized key`; a union names
// the issues of the branches the value was meant for, so a key deep inside one keeps its path
const issueLines = (issues: readonly Issue[], base: readonly PropertyKey[]): string[] =>
	issues.flatMap((issue) => {
		const at = [...base, ...issue.path]
		if (issue.code === 'unrecognized_keys')
			return issue.keys.map(
				(key) => `${[...at, key].map(String).join('.')}: unrecognized key`,
			)
		if (issue.code === 'invalid_union') {
			const meant = issue.errors.filter((branch) => !branch.every(isOwnMismatch))
			if (meant.length > 0) return meant.flatMap((branch) => issueLines(branch, at))
		}
		return [`${at.length > 0 ? at.map(String).join('.') : '(root)'}: ${issue.message}`]
	})

export const validate = <T>(schema: z.ZodType<T>, value: unknown, filePath: string): T => {
	const result = schema.safeParse(value)
	if (!result.success)
		throw new Error(
			issueLines(result.error.issues, [])
				.map((line) => `${filePath}: ${line}`)
				.join('\n'),
			{ cause: result.error },
		)
	return result.data
}
