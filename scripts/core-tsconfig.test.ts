import path from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const CORE_ROOT = path.join(import.meta.dirname, '..', 'packages', 'core')

const messages = (diagnostics: readonly ts.Diagnostic[]) =>
	diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))

function parsedOptions(file: string): ts.CompilerOptions {
	const errors: ts.Diagnostic[] = []
	const parsed = ts.getParsedCommandLineOfConfigFile(path.join(CORE_ROOT, file), undefined, {
		...ts.sys,
		onUnRecoverableConfigFileDiagnostic: (diagnostic) => errors.push(diagnostic),
	})
	expect(messages(errors)).toEqual([])
	if (!parsed) throw new Error(`cannot parse ${file}`)
	expect(messages(parsed.errors)).toEqual([])
	return parsed.options
}

describe('core tsconfig', () => {
	it.each(['tsconfig.json', 'tsconfig.build.json'])(
		'%s checks indexed access, extends included',
		(file) => {
			const options = parsedOptions(file)
			expect(options.noUncheckedIndexedAccess).toBe(true)
			expect(options.strictNullChecks ?? options.strict).toBe(true)
		},
	)
})
