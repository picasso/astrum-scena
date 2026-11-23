import { describe, expect, it } from 'vitest'

import {
	diffMdxStructure,
	type MdxStructuralNode,
	MdxStructureParseError,
	parseMdxStructure,
	stripFrontmatter,
	structuralIdentity,
} from './mdx-structure.ts'

const FRONTMATTER = `---
translationKey: about
locale: ru
title: Об авторе
---
`

describe('parseMdxStructure', () => {
	it('extracts top-level JSX block components with their attributes, ignoring prose and headings', () => {
		const source = `${FRONTMATTER}
## Про Фотографа

<WrapAround imageId="demo-portrait" position="right" width={80} />

Обычный абзац, который не влияет на структуру.

<Gallery imageSetId="about-intro" layout="rect" randomCount={3} />
`
		const skeleton = parseMdxStructure(source)
		expect(skeleton.map(structuralIdentity)).toEqual([
			'component:WrapAround',
			'component:Gallery',
		])
		const wrap = skeleton[0]!
		const gallery = skeleton[1]!
		expect(wrap.kind).toBe('component')
		expect(wrap.jsxType).toBe('flow')
		expect(wrap.attributes).toEqual({
			imageId: 'demo-portrait',
			position: 'right',
			width: '{80}',
		})
		expect(gallery.attributes.randomCount).toBe('{3}')
		expect(wrap.children).toEqual([])
	})

	it('strips frontmatter before parsing', () => {
		expect(stripFrontmatter(`${FRONTMATTER}\nbody`).trim()).toBe('body')
		// a document that is only frontmatter + prose has no structural inserts.
		expect(parseMdxStructure(`${FRONTMATTER}\nПросто текст без вставок.`)).toEqual([])
	})

	it('captures container directives and the block components nested in their body', () => {
		const source = `Intro paragraph.

:::callout{tone="accent" icon="home"}
Body text of the callout.

<Gallery imageSetId="inside" layout="square" />
:::
`
		const skeleton = parseMdxStructure(source)
		expect(skeleton).toHaveLength(1)
		const callout = skeleton[0]!
		expect(callout.kind).toBe('directive')
		expect(callout.directiveType).toBe('container')
		expect(callout.name).toBe('callout')
		expect(callout.attributes).toEqual({ tone: 'accent', icon: 'home' })
		expect(structuralIdentity(callout)).toBe('directive:container:callout')
		expect(callout.children.map(structuralIdentity)).toEqual(['component:Gallery'])
	})

	it('captures inline components and text directives inside a paragraph', () => {
		const source = `A line with an inline <Badge kind="new" /> and a :abbr[HTML]{title="x"} directive.`
		const skeleton = parseMdxStructure(source)
		const kinds = skeleton.map((n) => `${n.kind}:${n.jsxType ?? n.directiveType}:${n.name}`)
		expect(kinds).toContain('component:text:Badge')
		expect(kinds).toContain('directive:text:abbr')
	})

	it('treats a JSX fragment as transparent, keeping its children at the outer level', () => {
		const source = `<>
<Gallery imageSetId="a" />
</>
`
		const skeleton = parseMdxStructure(source)
		expect(skeleton.map(structuralIdentity)).toEqual(['component:Gallery'])
	})

	it('throws a typed error on invalid MDX', () => {
		expect(() => parseMdxStructure('<Gallery unclosed')).toThrow(MdxStructureParseError)
	})

	it('reports a node line in the original document, past the stripped frontmatter', () => {
		const source = `---\ntranslationKey: about\nlocale: ru\n---\n\n<Gallery imageSetId="a" />\n`
		const [g] = parseMdxStructure(source)
		// frontmatter occupies lines 1–4, a blank line 5, the Gallery on line 6.
		expect(g?.line).toBe(6)
	})

	it('excludes an errata :::note directive from the structural skeleton', () => {
		const source = `${FRONTMATTER}
Обычная проза.

:::callout
Выделение.
:::

:::note{claim="prod-a:aaaaaaaa"}
Что-то устарело.
:::
`
		// the callout stays structural; the note directive is invisible to structural parity
		expect(parseMdxStructure(source).map(structuralIdentity)).toEqual([
			'directive:container:callout',
		])
	})

	it('gives an empty structural diff for a RU body with :::note vs an EN body without it', () => {
		const ru = `${FRONTMATTER}
Проза.

:::note{claim="prod-a:aaaaaaaa"}
Устарело.
:::
`
		const en = `---\ntranslationKey: about\nlocale: en\ntitle: About\n---\nProse.\n`
		expect(diffMdxStructure(parseMdxStructure(ru), parseMdxStructure(en)).inParity).toBe(true)
	})
})

const wrap = (attrs: Record<string, string | boolean> = {}): MdxStructuralNode => ({
	kind: 'component',
	name: 'WrapAround',
	jsxType: 'flow',
	attributes: attrs,
	line: 0,
	column: 0,
	children: [],
})

const gallery = (children: MdxStructuralNode[] = []): MdxStructuralNode => ({
	kind: 'component',
	name: 'Gallery',
	jsxType: 'flow',
	attributes: {},
	line: 0,
	column: 0,
	children,
})

const callout = (children: MdxStructuralNode[] = []): MdxStructuralNode => ({
	kind: 'directive',
	name: 'callout',
	directiveType: 'container',
	attributes: {},
	line: 0,
	column: 0,
	children,
})

describe('diffMdxStructure', () => {
	it('reports parity for identical skeletons (the manually synced About case)', () => {
		const a = [wrap(), gallery(), gallery()]
		const b = [wrap(), gallery(), gallery()]
		const diff = diffMdxStructure(a, b)
		expect(diff.inParity).toBe(true)
		expect(diff.entries).toEqual([])
	})

	it('ignores attribute/prop differences on aligned inserts (divergence is authorial)', () => {
		const diff = diffMdxStructure(
			[wrap({ width: '{80}' })],
			[wrap({ width: '{60}', position: 'left' })],
		)
		expect(diff.inParity).toBe(true)
	})

	it('flags an insert present in A but missing in B as a-only', () => {
		const diff = diffMdxStructure([wrap(), gallery()], [wrap()])
		expect(diff.entries).toHaveLength(1)
		expect(diff.entries[0]!.type).toBe('a-only')
		expect(structuralIdentity(diff.entries[0]!.a as MdxStructuralNode)).toBe(
			'component:Gallery',
		)
	})

	it('flags an insert present in B but missing in A as b-only', () => {
		const diff = diffMdxStructure([wrap()], [wrap(), gallery()])
		expect(diff.entries).toHaveLength(1)
		expect(diff.entries[0]!.type).toBe('b-only')
	})

	it('detects a reorder when the same inserts appear in a different order', () => {
		const diff = diffMdxStructure([wrap(), gallery()], [gallery(), wrap()])
		const types = diff.entries.map((e) => e.type)
		expect(types).toContain('reorder')
		expect(types).not.toContain('mismatch')
	})

	it('reports a mismatch when different inserts contend for the same slot', () => {
		const diff = diffMdxStructure([wrap()], [gallery()])
		expect(diff.entries).toHaveLength(1)
		expect(diff.entries[0]!.type).toBe('mismatch')
		expect(diff.entries[0]!.a && structuralIdentity(diff.entries[0]!.a)).toBe(
			'component:WrapAround',
		)
		expect(diff.entries[0]!.b && structuralIdentity(diff.entries[0]!.b)).toBe(
			'component:Gallery',
		)
	})

	it('recurses into aligned parents and reports nested drift with a path', () => {
		const a = [callout([gallery(), wrap()])]
		const b = [callout([gallery()])]
		const diff = diffMdxStructure(a, b)
		expect(diff.entries).toHaveLength(1)
		expect(diff.entries[0]!.type).toBe('a-only')
		expect(diff.entries[0]!.path).toEqual(['directive:container:callout'])
		expect(structuralIdentity(diff.entries[0]!.a as MdxStructuralNode)).toBe(
			'component:WrapAround',
		)
	})

	it('recurses into a reordered parent to report drift nested inside a moved insert', () => {
		// the callout moved (reorder) AND its body differs (Gallery vs WrapAround) — both must surface.
		const a = [callout([gallery()]), wrap()]
		const b = [wrap(), callout([wrap()])]
		const diff = diffMdxStructure(a, b)
		const types = diff.entries.map((e) => e.type)
		expect(types).toContain('reorder')
		const nested = diff.entries.find((e) => e.path.includes('directive:container:callout'))
		expect(nested?.type).toBe('mismatch')
	})

	it('surfaces an ambiguous same-identity sibling swap as owner-reviewed mismatches, not a guessed reorder', () => {
		// two same-identity callouts with differing bodies, swapped: aligning them is ambiguous (swap vs
		// two substitutions), so the library stays conservative — it reports mismatches for the owner
		// rather than auto-detecting a reorder it might get wrong.
		const a = [callout([gallery()]), callout([wrap()])]
		const b = [callout([wrap()]), callout([gallery()])]
		const diff = diffMdxStructure(a, b)
		const types = diff.entries.map((e) => e.type)
		expect(types).toContain('mismatch')
		expect(types).not.toContain('reorder')
	})

	it('detects an unambiguous distinct-identity reorder with a single entry (no duplicate moves)', () => {
		const diff = diffMdxStructure([wrap(), gallery()], [gallery(), wrap()])
		const reorders = diff.entries.filter((e) => e.type === 'reorder')
		expect(reorders).toHaveLength(1)
		expect(diff.entries.every((e) => e.type === 'reorder')).toBe(true)
	})

	it('does not offer a reorder when the moved identity is repeated at the level (ambiguous)', () => {
		// `callout` occurs twice in each locale, so a leftover unaligned callout is NOT an unmistakable
		// move — never pair it as a reorder even though one callout pair aligns.
		const a = [callout([gallery()]), wrap(), callout([wrap()])]
		const b = [wrap(), callout([wrap()]), callout([])]
		const diff = diffMdxStructure(a, b)
		expect(diff.entries.map((e) => e.type)).not.toContain('reorder')
	})
})
