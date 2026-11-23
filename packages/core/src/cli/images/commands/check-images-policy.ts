import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { computeConfigDigest, loadImageConfig } from '../../../lib/images/build/config.ts'
import { canonicalStringifyPretty } from '../../../lib/images/canonical.ts'
import { evaluatePolicy } from '../../../lib/images/policy.ts'
import { loadReleaseDescriptor, releaseDescriptorPath } from '../../../lib/images/release.ts'
import { type CliContext, command, label } from '../../context.ts'
import { JOURNAL_PREFIX } from '../activate.ts'
import { imagesCacheDir } from '../cache-path.ts'
import { validateLadderManifest } from '../ladder-policy.ts'

// the release descriptor is the only tracked source of truth of a site's images, so its schema, its
// canonical bytes, its configDigest against the current config (active or not), the policy and the
// width ladder are all checked here

const activationInProgress = (root: string): boolean =>
	existsSync(imagesCacheDir(root)) &&
	readdirSync(imagesCacheDir(root)).some((name) => name.startsWith(JOURNAL_PREFIX))

export function checkImagesPolicy(context: CliContext): number {
	const descriptorLabel = label(context, releaseDescriptorPath(context.root))
	const activate = command(context, 'images activate --release <id>')
	const fail = (message: string): number => {
		context.err(`check images-policy FAIL: ${message}`)
		return 1
	}
	// an unfinished activation may mean a mixed state, so recovery comes before any check
	if (activationInProgress(context.root))
		return fail(
			`unfinished activation journal found (${path.posix.join(label(context, imagesCacheDir(context.root)), `${JOURNAL_PREFIX}*`)}). ` +
				`Run: ${command(context, 'images activate --recover')}`,
		)

	let loaded
	try {
		loaded = loadReleaseDescriptor(context.root)
	} catch (error) {
		return fail(
			`release descriptor invalid or missing (${descriptorLabel}) — ${(error as Error).message}`,
		)
	}
	const { descriptor, raw } = loaded
	// re-serializing reproduces the file byte for byte, which rejects hand edits
	if (canonicalStringifyPretty(descriptor) !== raw)
		return fail(
			`release descriptor (${descriptorLabel}) is not canonical (hand-edited or non-canonical bytes). ` +
				`Restore it from Git or rewrite it: ${activate}`,
		)

	const config = loadImageConfig(context.root)
	const digest = computeConfigDigest(config)
	if (descriptor.configDigest !== digest)
		return fail(
			`descriptor configDigest does not match the images section of the site config: expected ${digest}, ` +
				`the descriptor has ${descriptor.configDigest}. Build a release under the current config ` +
				`(${command(context, 'images build')}) and activate it: ${activate}`,
		)

	const evaluation = evaluatePolicy(descriptor.active, descriptor.manifest)
	if (!evaluation.ok) return fail(evaluation.reason)
	const errors = validateLadderManifest(descriptor.manifest, config)
	if (errors.length > 0) return fail(`ladder policy invalid: ${errors.join('; ')}`)

	context.out('check images-policy OK')
	context.out(`  path:   ${descriptorLabel}`)
	context.out(`  active: ${descriptor.active}`)
	context.out(`  photos: ${Object.keys(descriptor.manifest.photos).length}`)
	return 0
}
