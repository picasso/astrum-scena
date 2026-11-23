import { describe, expect, it } from 'vitest'

import { siteRoot } from '../../config/site-root.ts'
import { loadImageConfig } from './build/config.ts'
import {
	buildImagePublicConfig,
	externalImageOrigin,
	imagePublicConfigSchema,
	IMAGES_PUBLIC_RELATIVE_PATH,
	imageUrlBase,
	loadImagePublicConfig,
	parseImagePublicConfig,
	serializeImagePublicConfig,
} from './public-config.ts'

const located = {
	schemaVersion: 1,
	copyright: '© Someone. All rights reserved.',
	credit: 'Someone',
	ladder: { widths: [200, 400, 800], formats: ['avif', 'webp'] },
}
const validConfig = { ...located, publicOrigin: 'https://media.example.com' }

const expectReject = (input: unknown) =>
	expect(imagePublicConfigSchema.safeParse(input).success).toBe(false)

describe('imagePublicConfigSchema', () => {
	it('accepts a well-formed ladder projection', () => {
		expect(imagePublicConfigSchema.safeParse(validConfig).success).toBe(true)
	})

	it('rejects invalid origin, incomplete ladder, old roles, and unknown keys', () => {
		expectReject({ ...validConfig, publicOrigin: 'https://media.example.com/' })
		expectReject({ ...validConfig, publicOrigin: 'http://media.example.com' })
		expectReject({ ...validConfig, copyright: '' })
		expectReject({ ...validConfig, credit: '' })
		expectReject({ ...validConfig, extra: 1 })
		expectReject({ ...validConfig, roles: {} })
		expectReject({ ...validConfig, ladder: { widths: [], formats: ['avif'] } })
		expectReject({ ...validConfig, ladder: { widths: [400], formats: ['jpg'] } })
		expectReject({ ...validConfig, ladder: { widths: [400], formats: ['avif'], extra: 1 } })
	})

	it('accepts a site path instead of an origin', () => {
		for (const publicPath of ['/media', '/media/photos', '/a.b/c_d~e-f'])
			expect(imagePublicConfigSchema.safeParse({ ...located, publicPath }).success).toBe(true)
	})

	it('requires exactly one of publicOrigin and publicPath, naming the field', () => {
		const both = imagePublicConfigSchema.safeParse({ ...validConfig, publicPath: '/media' })
		expect(both.error?.issues.map((issue) => issue.path)).toEqual([['publicPath']])
		const neither = imagePublicConfigSchema.safeParse(located)
		expect(neither.error?.issues.map((issue) => issue.path)).toEqual([['publicOrigin']])
	})

	it.each(['media', '/media/', '/a/../b', '/a/./b', '//host', '/', '', '/a b', 'https://x.test'])(
		'rejects the path %j',
		(publicPath) => {
			const result = imagePublicConfigSchema.safeParse({ ...located, publicPath })
			expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(['publicPath'])
		},
	)
})

describe('imageUrlBase and externalImageOrigin', () => {
	it('use the origin of an external host', () => {
		const config = { publicOrigin: 'https://media.example.com' }
		expect(imageUrlBase(config)).toBe('https://media.example.com')
		expect(externalImageOrigin(config)).toBe('https://media.example.com')
	})

	it('use the site path with no external origin', () => {
		const config = { publicPath: '/media' }
		expect(imageUrlBase(config)).toBe('/media')
		expect(externalImageOrigin(config)).toBeUndefined()
	})

	it('refuse a location with neither field', () => {
		expect(() => imageUrlBase({})).toThrow(/neither publicOrigin nor publicPath/)
	})
})

describe('buildImagePublicConfig', () => {
	it('projects the demo image config onto its tracked public config', () => {
		const projected = buildImagePublicConfig(loadImageConfig(siteRoot))
		expect(serializeImagePublicConfig(projected)).toBe(loadImagePublicConfig(siteRoot).raw)
	})

	it('carries publicPath and sorts the formats', () => {
		const config = loadImageConfig(siteRoot)
		const projected = buildImagePublicConfig({
			publicPath: '/media',
			formats: ['webp', 'avif'],
			rights: config.rights,
			ladder: config.ladder,
		})
		expect(projected.publicPath).toBe('/media')
		expect('publicOrigin' in projected).toBe(false)
		expect(projected.ladder.formats).toEqual(['avif', 'webp'])
	})
})

describe('serializeImagePublicConfig', () => {
	it('is canonical and round-trips', () => {
		const parsed = imagePublicConfigSchema.parse(validConfig)
		const serialized = serializeImagePublicConfig(parsed)
		expect(serialized.endsWith('}\n')).toBe(true)
		expect(serialized).toContain('\t')
		expect(serialized.indexOf('"copyright"')).toBeLessThan(serialized.indexOf('"credit"'))
		expect(serialized.indexOf('"credit"')).toBeLessThan(serialized.indexOf('"ladder"'))
		expect(parseImagePublicConfig(serialized)).toEqual(parsed)
	})
})

describe('parseImagePublicConfig', () => {
	it('rejects a file without schemaVersion or with another one, naming the file', () => {
		const { schemaVersion: version, ...unversioned } = validConfig
		expect(version).toBe(1)
		expect(() => parseImagePublicConfig(JSON.stringify(unversioned))).toThrow(
			`${IMAGES_PUBLIC_RELATIVE_PATH}: missing schemaVersion; supported: 1`,
		)
		expect(() =>
			parseImagePublicConfig(JSON.stringify({ ...validConfig, schemaVersion: 2 })),
		).toThrow(`${IMAGES_PUBLIC_RELATIVE_PATH}: schemaVersion 2 is not supported; supported: 1`)
	})
})

describe('loadImagePublicConfig', () => {
	it('loads a canonical tracked file', () => {
		const { config, raw } = loadImagePublicConfig(siteRoot)
		expect(serializeImagePublicConfig(config)).toBe(raw)
		expect(config.publicPath).toBe('/media')
	})
})
