import { readFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'astro/zod'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import { SITE_LOCK_PATH } from '../../../config/lock.ts'
import { RIGHTS_PATH } from '../../../config/rights.ts'
import { siteRoot } from '../../../config/site-root.ts'
import { siteSchema } from '../../../config/site-schema.ts'
import { loadReleaseDescriptor } from '../release.ts'
import {
	computeConfigDigest,
	deriveImageRights,
	IMAGE_DIGEST_EXCLUDED_FIELDS,
	IMAGE_DIGEST_PROJECTION,
	type ImageConfig,
	imageConfigSchema,
	loadImageConfig,
	REQUIRED_DENIED_FIELDS,
} from './config.ts'

type RawConfig = Record<string, unknown>

const readSiteFile = (file: string) =>
	parseYaml(readFileSync(path.join(siteRoot, file), 'utf8')) as Record<string, unknown>

const demoLock = () => readSiteFile(SITE_LOCK_PATH).site as { origin: string; images: RawConfig }

// the demo's `images` section as locked: its own data and the core's defaults, every field written
const raw = (): RawConfig => demoLock().images

// the section alone, its rights derived from the demo's origin as the root of siteSchema derives them
const effective = (input: unknown): ImageConfig => {
	const config = imageConfigSchema.parse(input)
	return { ...config, rights: deriveImageRights(config.rights, demoLock().origin) }
}

const digestOf = (input: unknown) => computeConfigDigest(effective(input))

const mutate = (change: (config: RawConfig) => void): RawConfig => {
	const config = raw()
	change(config)
	return config
}

const issuesOf = (input: unknown) => imageConfigSchema.safeParse(input).error?.issues ?? []

// every object level reversed, so only the canonical serialization can keep the digest
const reverseKeys = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(reverseKeys)
	if (value === null || typeof value !== 'object') return value
	return Object.fromEntries(
		Object.entries(value)
			.reverse()
			.map(([key, item]) => [key, reverseKeys(item)]),
	)
}

describe('imageConfigSchema', () => {
	it('loads the demo config from the site root', () => {
		const config = loadImageConfig(siteRoot)
		expect(config.publicPath).toBe('/media')
	})

	// the section has no version of its own: the schemaVersion of site.yaml covers it
	it('rejects a schemaVersion inside the section and the removed role shape', () => {
		expect(issuesOf({ ...raw(), schemaVersion: 2 })).not.toEqual([])
		expect(issuesOf({ ...raw(), roles: {} })).not.toEqual([])
	})

	it('requires ordered unique widths and a reachable watermark threshold', () => {
		const watermark = (config: RawConfig) => config.watermark as RawConfig
		expect(issuesOf(mutate((config) => (config.ladder = { widths: [400, 200] })))).not.toEqual(
			[],
		)
		expect(issuesOf(mutate((config) => (watermark(config).aboveWidth = 9999)))).not.toEqual([])
	})

	it('requires the privacy denylist and a single referenced watermark asset', () => {
		expect(issuesOf(mutate((config) => (config.privacy = { deniedFields: [] })))).not.toEqual(
			[],
		)
		expect(
			issuesOf(mutate((config) => ((config.watermark as RawConfig).assets = []))),
		).not.toEqual([])
	})

	it('rejects a watermark that would be invisible or labelled as unmarked', () => {
		const profile = (change: Record<string, unknown>) =>
			mutate((config) => {
				const watermark = config.watermark as RawConfig
				watermark.profile = { ...(watermark.profile as RawConfig), ...change }
			})
		for (const opacity of [0, 0.001, -0.5])
			expect(issuesOf(profile({ opacity })).map((issue) => issue.path)).toEqual([
				['watermark', 'profile', 'opacity'],
			])
		expect(issuesOf(profile({ opacity: 0.01 }))).toEqual([])
		expect(issuesOf(profile({ id: 'none' })).map((issue) => issue.message)).toEqual([
			'watermark profile id "none" is reserved for unmarked derivatives',
		])
	})

	it('takes publicOrigin instead of publicPath', () => {
		const config = imageConfigSchema.parse(
			mutate((config) => {
				delete config.publicPath
				config.publicOrigin = 'https://media.example.com'
			}),
		)
		expect(config.publicOrigin).toBe('https://media.example.com')
		expect(config.publicPath).toBeUndefined()
	})

	it('takes at most one of publicOrigin and publicPath, the default path without either', () => {
		const both = issuesOf({
			...raw(),
			publicPath: '/media',
			publicOrigin: 'https://media.example.com',
		})
		expect(both.map((issue) => issue.path)).toEqual([['publicPath']])
		expect(both[0]?.message).toMatch(/mutually exclusive/)
		const neither = imageConfigSchema.parse(raw())
		expect(neither.publicPath).toBe('/media')
		expect(neither.publicOrigin).toBeUndefined()
	})

	it('merges a partial ladder into the defaults and replaces a written list whole', () => {
		const config = imageConfigSchema.parse(
			mutate((config) => (config.ladder = { native: { maxLongSide: 2400 } })),
		)
		expect(config.ladder.native).toEqual({ enabled: true, maxLongSide: 2400 })
		expect(config.ladder.widths).toEqual([200, 400, 800, 1200, 1600])
		const privacy = imageConfigSchema.parse(
			mutate((config) => (config.privacy = { deniedFields: [...REQUIRED_DENIED_FIELDS] })),
		).privacy
		expect(privacy.deniedFields).toEqual([...REQUIRED_DENIED_FIELDS])
	})
})

// the demo descriptor was cut from `config/images.yaml` with `version: 2`, before the image config
// became the `images` section of site.yaml (a copy of that file is the fixture of the upgrade)
describe('the upgrade from config/images.yaml', () => {
	const legacy = path.join(
		import.meta.dirname,
		'../../../config/__fixtures__/three-file-site/config/images.yaml',
	)

	it('keeps the configDigest of the old file, so no derivative is re-encoded', () => {
		const { schemaVersion, ...section } = parseYaml(readFileSync(legacy, 'utf8')) as RawConfig
		const { configDigest } = loadReleaseDescriptor(siteRoot).descriptor

		expect(schemaVersion).toBe(2)
		expect(digestOf(section)).toBe(configDigest)
		expect(computeConfigDigest(loadImageConfig(siteRoot))).toBe(configDigest)
	})
})

type JsonSchemaNode = {
	type?: string
	properties?: Record<string, JsonSchemaNode>
	items?: JsonSchemaNode
	anyOf?: JsonSchemaNode[]
}

// the dotted path of every leaf a site can write, `[]` for an array element
const schemaLeafPaths = (node: JsonSchemaNode, prefix = ''): string[] => {
	if (node.anyOf) return node.anyOf.flatMap((option) => schemaLeafPaths(option, prefix))
	if (node.properties)
		return Object.entries(node.properties).flatMap(([key, child]) =>
			schemaLeafPaths(child, prefix === '' ? key : `${prefix}.${key}`),
		)
	if (node.type === 'array' && node.items && (node.items.properties || node.items.anyOf))
		return schemaLeafPaths(node.items, `${prefix}[]`)
	return [prefix]
}

// the config path each projection leaf takes its value from; a constant takes none
const projectionSourcePaths = (node: unknown, prefix = ''): string[] => {
	const join = (key: string) => (prefix === '' ? key : `${prefix}.${key}`)
	return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) => {
		if (child === true) return [join(key)]
		if (typeof child === 'number') return []
		if (Array.isArray(child)) return projectionSourcePaths(child[0], `${join(key)}[]`)
		return projectionSourcePaths(child, join(key))
	})
}

describe('computeConfigDigest', () => {
	it('is independent of YAML key order at every level', () => {
		expect(digestOf(reverseKeys(raw()))).toBe(digestOf(raw()))
	})

	it('is the same whether a default is written or omitted', () => {
		expect(digestOf(mutate((config) => (config.archive = { ignoreDirs: [] })))).toBe(
			digestOf(mutate((config) => delete config.archive)),
		)
		const written = imageConfigSchema.parse(raw())
		expect(digestOf(written)).toBe(digestOf(raw()))
	})

	// a field the schema gains later reaches the digest only through a new projection
	it('ignores a property outside the projection', () => {
		const config = effective(raw())
		const extended = {
			...config,
			futureField: 'value',
			ladder: { ...config.ladder, futureField: 1 },
			watermark: {
				...config.watermark,
				assets: config.watermark.assets.map((asset) => ({ ...asset, futureField: true })),
			},
		}
		expect(computeConfigDigest(extended)).toBe(computeConfigDigest(config))
	})

	it('changes when a projected field changes', () => {
		const quality = mutate(
			(config) =>
				(config.ladder = {
					quality: [
						{ upTo: 800, avif: 51, webp: 72 },
						{ avif: 55, webp: 78 },
					],
				}),
		)
		const widths = mutate((config) => (config.ladder = { widths: [200, 400, 800, 1200] }))
		expect(digestOf(quality)).not.toBe(digestOf(raw()))
		expect(digestOf(widths)).not.toBe(digestOf(raw()))
	})

	it('assigns every field of the schema to the projection or the exclusions', () => {
		const projected = projectionSourcePaths(IMAGE_DIGEST_PROJECTION)
		expect(IMAGE_DIGEST_EXCLUDED_FIELDS.filter((field) => projected.includes(field))).toEqual(
			[],
		)
		const assigned = new Set([...projected, ...IMAGE_DIGEST_EXCLUDED_FIELDS])
		const schemaPaths = schemaLeafPaths(
			z.toJSONSchema(imageConfigSchema, {
				io: 'input',
				unrepresentable: 'any',
			}) as JsonSchemaNode,
		)
		expect(schemaPaths.filter((field) => !assigned.has(field))).toEqual([])
		expect([...assigned].filter((field) => !schemaPaths.includes(field))).toEqual([])
	})
})

// the demo leaves both rights fields to the core, which derives them from `origin`; its locked site
// without them is a site.yaml of the same effective config
describe('rights derived from origin', () => {
	const site = () => {
		const { site } = readSiteFile(SITE_LOCK_PATH) as { site: Record<string, unknown> }
		const { rights } = site.images as { rights: Record<string, unknown> }
		delete rights.source
		delete rights.webStatement
		return site
	}
	const imagesOf = (input: unknown) => siteSchema.parse(input).images
	const rightsOf = (input: Record<string, unknown>) =>
		(input.images as { rights: Record<string, unknown> }).rights

	it("derives source and webStatement from the demo's origin, its configDigest unchanged", () => {
		const { configDigest } = loadReleaseDescriptor(siteRoot).descriptor
		const images = imagesOf(site())

		expect(images.rights.source).toBe(new URL(demoLock().origin).host)
		expect(images.rights.webStatement).toBe(new URL(RIGHTS_PATH, demoLock().origin).href)
		expect(computeConfigDigest(images)).toBe(configDigest)
	})

	it('keeps the digest when the written values equal the derived ones', () => {
		const written = site()
		Object.assign(rightsOf(written), {
			source: new URL(demoLock().origin).host,
			webStatement: new URL(RIGHTS_PATH, demoLock().origin).href,
		})

		expect(computeConfigDigest(imagesOf(written))).toBe(computeConfigDigest(imagesOf(site())))
	})

	it('follows a new origin, so the digest changes with the domain', () => {
		const moved = { ...site(), origin: 'https://moved.example.org' }
		const { rights } = imagesOf(moved)

		expect(rights.source).toBe('moved.example.org')
		expect(rights.webStatement).toBe('https://moved.example.org/rights/')
		expect(computeConfigDigest(imagesOf(moved))).not.toBe(computeConfigDigest(imagesOf(site())))
	})

	// a site that moves its domain may keep the old URL in the XMP instead of re-encoding
	it('lets a written value override the derivation', () => {
		const moved = { ...site(), origin: 'https://moved.example.org' }
		Object.assign(rightsOf(moved), {
			source: new URL(demoLock().origin).host,
			webStatement: new URL(RIGHTS_PATH, demoLock().origin).href,
		})

		expect(imagesOf(moved).rights).toEqual(imagesOf(site()).rights)
		expect(computeConfigDigest(imagesOf(moved))).toBe(computeConfigDigest(imagesOf(site())))
	})
})
