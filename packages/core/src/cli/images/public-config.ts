import type { ImageConfig } from '../../lib/images/build/config.ts'
import {
	buildImagePublicConfig,
	type ImagePublicConfig,
	parseImagePublicConfig,
	serializeImagePublicConfig,
} from '../../lib/images/public-config.ts'

export type PublicConfigVerdict = { ok: true } | { ok: false; reason: string }

// the tracked public config is the canonical projection of the current `images` section, byte for
// byte; private fields are absent by construction and the strict schema rejects them if added
export function verifyPublicConfig(raw: string, config: ImageConfig): PublicConfigVerdict {
	let parsed: ImagePublicConfig
	try {
		parsed = parseImagePublicConfig(raw)
	} catch (error) {
		return { ok: false, reason: `invalid public config: ${(error as Error).message}` }
	}
	if (serializeImagePublicConfig(parsed) !== raw)
		return {
			ok: false,
			reason: 'public config is not canonical (hand-edited or non-canonical bytes)',
		}
	if (serializeImagePublicConfig(buildImagePublicConfig(config)) !== raw)
		return {
			ok: false,
			reason: 'public config is stale vs the images section of the site config',
		}
	return { ok: true }
}
