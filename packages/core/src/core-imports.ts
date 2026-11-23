import { readFileSync } from 'node:fs'
import path from 'node:path'

import { CORE_ROOT } from './core-root.ts'

// the one rule for what a site may import from the core: the entry points of the core's package.json
// `exports`. The ESLint preset and the MDX check both build from it, so there is no second list.

export type CoreManifest = { name: string; exports: Record<string, unknown> }

export function installedManifest(): CoreManifest {
	return JSON.parse(readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8')) as CoreManifest
}

// `.` is the package itself, `./x` the specifier `<name>/x`; a `null` target blocks its subpath
export const declaredSpecifiers = (manifest: CoreManifest): string[] =>
	Object.entries(manifest.exports)
		.filter(([key, target]) => (key === '.' || key.startsWith('./')) && target !== null)
		.map(([key]) => (key === '.' ? manifest.name : `${manifest.name}/${key.slice(2)}`))

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export type CoreImportRule = {
	// matches a whole specifier that is not declared
	undeclared: string
	// matches a piece of a computed specifier that may lead into the package
	piece: string
	message: string
}

// the regexes are case-sensitive: a specifier is matched against `exports` keys exactly
export function coreImportRule(manifest: CoreManifest = installedManifest()): CoreImportRule {
	const name = escaped(manifest.name)
	const subpaths = declaredSpecifiers(manifest)
		.filter((specifier) => specifier !== manifest.name)
		.map((specifier) => escaped(specifier.slice(manifest.name.length + 1)))
	const declared = subpaths.length > 0 ? `(?!(${subpaths.join('|')})$)` : ''
	// a path into node_modules bypasses `exports` whatever follows the package directory
	const throughNodeModules = `(^|/)node_modules/${name}(/|$)`
	return {
		undeclared: `^${name}/${declared}|${throughNodeModules}`,
		// a piece cannot prove the whole specifier is declared, so the bare name counts too
		piece: `^${name}(/|$)|${throughNodeModules}`,
		message: `Import ${manifest.name} only through its package.json "exports": ${declaredSpecifiers(manifest).join(', ')}. Internal paths change without notice in any core release.`,
	}
}
