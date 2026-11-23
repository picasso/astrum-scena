import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CORE_ROOT } from '../../core-root.ts'

// the S3 client is an optional peer of the core: a site without it runs every command and gate but
// the bucket ones, so no module outside them loads it
const S3_PACKAGE = '@aws-sdk/client-s3'
const S3_MODULES = new Set(['cli/images/s3-client.ts'])

describe(`${S3_PACKAGE}`, () => {
	it('is an optional peer, not a dependency', () => {
		const manifest = JSON.parse(readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8')) as {
			dependencies?: Record<string, string>
			peerDependencies?: Record<string, string>
			peerDependenciesMeta?: Record<string, { optional?: boolean }>
		}
		expect(manifest.dependencies?.[S3_PACKAGE]).toBeUndefined()
		expect(manifest.peerDependencies?.[S3_PACKAGE]).toBeDefined()
		expect(manifest.peerDependenciesMeta?.[S3_PACKAGE]?.optional).toBe(true)
	})

	it('is named by no module of the core outside the bucket commands', () => {
		const src = path.join(CORE_ROOT, 'src')
		const importers = readdirSync(src, { recursive: true, encoding: 'utf8' })
			.map((file) => file.split(path.sep).join('/'))
			.filter((file) => /\.(?:tsx?|astro|m?js)$/.test(file) && !/\.test\.tsx?$/.test(file))
			.filter((file) => !S3_MODULES.has(file))
			.filter((file) => readFileSync(path.join(src, file), 'utf8').includes(S3_PACKAGE))
		expect(importers).toEqual([])
	})
})
