import { computeConfigDigest, loadImageConfig } from '../../../lib/images/build/config.ts'
import type { Manifest } from '../../../lib/images/manifest.ts'
import {
	loadManifestFile,
	loadReleaseDescriptor,
	releaseDescriptorPath,
	releaseDirPath,
	releaseManifestPath,
	serializeReleaseDescriptor,
} from '../../../lib/images/release.ts'
import { type CliContext, command, label } from '../../context.ts'
import { listActivationJournals } from '../activate.ts'
import { bucketOrigin, openBucket } from '../bucket.ts'
import { checkLive } from '../live-check.ts'
import { decideLiveGate } from '../live-gate.ts'
import { checkPublicDomain, type FetchLike } from '../public-domain-check.ts'
import { validateCandidateRelease } from '../validate-candidate.ts'
import { releaseOption, runImageCommand } from './image-command.ts'

// the authoritative check against the bucket and the public origin. Without `--release` it checks
// the release descriptor policy first, so an inactive descriptor with an empty manifest passes
// without reading a secret or opening the bucket; with `--release <id>` it checks a cache release
// before activation and the descriptor is not read

const NAME = 'images check-live'

async function verifyRemote(context: CliContext, manifest: Manifest): Promise<number> {
	const publicOrigin = bucketOrigin(loadImageConfig(context.root))
	// read-only on top of the scoped credentials of CI
	const client = await openBucket(context, { readOnly: true })
	const live = await checkLive({ manifest, client })
	if (!live.ok) {
		context.err(`${NAME} FAILED: bucket verification (${live.errors.length}/${live.total}):`)
		for (const error of live.errors) context.err(`  - ${error}`)
		return 1
	}
	const fetchImpl: FetchLike = context.fetch ?? fetch
	const domain = await checkPublicDomain({ manifest, publicOrigin, fetchImpl })
	if (!domain.ok) {
		context.err(
			`${NAME} FAILED: public origin verification (${domain.errors.length}/${domain.total}):`,
		)
		for (const error of domain.errors) context.err(`  - ${error}`)
		return 1
	}
	context.out(`${NAME} OK`)
	context.out(`  bucket:        ${live.verified}/${live.total} verified`)
	context.out(`  public origin: ${domain.verified}/${domain.total} verified`)
	context.out(`  origin:        ${publicOrigin}`)
	return 0
}

async function checkCandidate(
	context: CliContext,
	releaseId: string,
	digest: string,
): Promise<number> {
	const { manifest } = loadManifestFile(
		releaseManifestPath(releaseDirPath(context.root, releaseId)),
	)
	validateCandidateRelease(manifest)
	if (manifest.configDigest !== digest)
		throw new Error(
			`release manifest.configDigest ${manifest.configDigest} != config digest ${digest}`,
		)
	context.out(`${NAME}: candidate release ${releaseId}`)
	return verifyRemote(context, manifest)
}

async function checkDescriptor(context: CliContext, digest: string): Promise<number> {
	// an unfinished activation may mean a mixed descriptor, which is not trusted until recovery
	if ((await listActivationJournals(context.root)).length > 0)
		throw new Error(
			`unfinished activation journal found. Run: ${command(context, 'images activate --recover')}`,
		)
	const descriptorLabel = label(context, releaseDescriptorPath(context.root))
	const { descriptor, raw } = loadReleaseDescriptor(context.root)
	if (serializeReleaseDescriptor(descriptor) !== raw)
		throw new Error(
			`release descriptor (${descriptorLabel}) is not canonical (hand-edited or non-canonical ` +
				`bytes). Restore it from Git or rewrite it: ${command(context, 'images activate --release <id>')}`,
		)
	const decision = decideLiveGate(descriptor.active, descriptor.manifest, digest)
	if (decision.kind === 'fail') throw new Error(decision.reason)
	if (decision.kind === 'pass-inactive-empty') {
		context.out(`${NAME} OK`)
		context.out('  inactive descriptor with an empty manifest; the bucket is not contacted')
		return 0
	}
	context.out(`${NAME}: the active release descriptor`)
	return verifyRemote(context, descriptor.manifest)
}

export function imagesCheckLive(context: CliContext): Promise<number> {
	return runImageCommand(context, NAME, async () => {
		const digest = computeConfigDigest(loadImageConfig(context.root))
		const releaseId = releaseOption(context)
		return releaseId === undefined
			? checkDescriptor(context, digest)
			: checkCandidate(context, releaseId, digest)
	})
}
