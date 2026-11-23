import { z } from 'astro/zod'

// the only declaration of the sha256 format; content, image and migration schemas import it
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

export const sha256HexSchema = z
	.string()
	.regex(SHA256_HEX_PATTERN, 'Expected lowercase 64-hex sha256')
