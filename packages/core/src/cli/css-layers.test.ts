import { describe, expect, it } from 'vitest'

import { findCssLayerViolations, globalCss, layersCss } from './css-layers.ts'
import type { SourceFile } from './trees.ts'

// labels relative to one base, as the CLI gives them
const CORE = '../core/src'
const SITE = 'site'
const LAYERS_CSS = layersCss(CORE)
const GLOBAL_CSS = globalCss(CORE)
const CARD = `${CORE}/components/card.css`
const PROSE = `${CORE}/styles/prose.css`

const ORDER = '@layer properties, theme, base, vendor, components, utilities;\n'
const GLOBAL = `@import './layers.css';
@import 'tailwindcss';
@import '/src/theme/theme.css';
@import '/src/generated/layout-tokens.css' layer(theme);
@import './prose.css' layer(components);

@layer base {
	body { margin: 0; }
}
`
const THEME = `/* header */
@custom-variant light (&:where([data-theme='light'], [data-theme='light'] *));
@layer theme { :root { --x: 1px; } }
@theme {
	--color-accent: var(--x);
}
`
const COMPONENT = `/* a header comment */
@import '../styles/layers.css';

@layer components {
	.card { display: block; }
}
`
const ENTRY = `an entry stylesheet must start with @import of ${LAYERS_CSS}`
const TOKENS = `${GLOBAL_CSS}:1: must @import '/src/generated/layout-tokens.css' layer(theme) with no other condition`

// a minimal valid tree of the core and the site; each case overrides or adds files
const tree = (overrides: Record<string, string> = {}, site = SITE): SourceFile[] =>
	Object.entries({
		[LAYERS_CSS]: `/* order */\n${ORDER}`,
		[GLOBAL_CSS]: GLOBAL,
		[`${site}/src/theme/theme.css`]: THEME,
		[`${site}/src/generated/layout-tokens.css`]: ':root {\n\t--container-prose: 680px;\n}\n',
		[PROSE]: '.prose h2 {\n\tmargin: 0;\n}\n',
		[CARD]: COMPONENT,
		[`${CORE}/components/card.astro`]:
			'---\nimport \'./card.css\'\n---\n<div class="card" />\n',
		[`${CORE}/layouts/html-shell.astro`]: "---\nimport '../styles/global.css'\n---\n<slot />\n",
		...overrides,
	}).map(([file, source]) => ({ file, source }))

const messages = (files: SourceFile[], site = SITE) =>
	findCssLayerViolations(files, { coreSrc: CORE, siteRoot: site }).map(
		({ file, line, message }) => `${file}:${line}: ${message}`,
	)

describe('findCssLayerViolations', () => {
	it('passes a tree whose rules all sit in layers', () => {
		expect(messages(tree())).toEqual([])
	})

	it('flags a top-level rule in a component stylesheet with its file and line', () => {
		const css = `${COMPONENT}\n.x { color: red }\n`
		expect(messages(tree({ [CARD]: css }))).toEqual([`${CARD}:8: .x outside @layer`])
	})

	it('flags top-level at-rules that hold rules', () => {
		const css = `${COMPONENT}@media (min-width: 1px) {\n\t.y { display: none; }\n}\n@keyframes spin {}\n`
		expect(messages(tree({ [CARD]: css }))).toEqual([
			`${CARD}:7: @media outside @layer`,
			`${CARD}:10: @keyframes outside @layer`,
		])
	})

	it('exempts a file imported only under layer(), like prose.css', () => {
		expect(messages(tree({ [PROSE]: '.prose { margin: 0; }\n' }))).toEqual([])
	})

	it('checks a layer()-imported file once code imports it directly', () => {
		const files = tree({
			[`${CORE}/components/prose-user.astro`]: "---\nimport '../styles/prose.css'\n---\n",
		})
		expect(messages(files)).toEqual([
			`${PROSE}:1: ${ENTRY}`,
			`${PROSE}:1: .prose h2 outside @layer`,
		])
	})

	it('sees code imports through dynamic import()', () => {
		expect(
			messages(
				tree({
					[`${CORE}/ui/lazy.ts`]:
						"export const load = () => import('../styles/prose.css')\n",
				}),
			),
		).toEqual([`${PROSE}:1: ${ENTRY}`, `${PROSE}:1: .prose h2 outside @layer`])
	})

	it('allows a top-level Tailwind @theme and a leading comment before the import', () => {
		expect(messages(tree())).toEqual([])
		expect(THEME).toMatch(/^@theme \{/m)
		expect(COMPONENT.startsWith('/*')).toBe(true)
	})

	it('flags an entry stylesheet whose first statement is not the layers.css import', () => {
		const css =
			"@import './other.css';\n@import '../styles/layers.css';\n@layer components {}\n"
		expect(messages(tree({ [CARD]: css }))).toContain(`${CARD}:1: ${ENTRY}`)
		const conditional = COMPONENT.replace(
			"'../styles/layers.css';",
			"'../styles/layers.css' print;",
		)
		expect(messages(tree({ [CARD]: conditional }))).toEqual([`${CARD}:2: ${ENTRY}`])
		expect(messages(tree({ [CARD]: '@layer components {\n\t.card {}\n}\n' }))).toEqual([
			`${CARD}:1: ${ENTRY}`,
		])
	})

	it('treats a stylesheet nobody imports as an entry', () => {
		const orphan = `${CORE}/components/orphan.css`
		expect(messages(tree({ [orphan]: '@layer components {}\n' }))).toEqual([
			`${orphan}:1: ${ENTRY}`,
		])
	})

	it('does not require the order import of a file reached only by a plain CSS @import', () => {
		const shared = `${CORE}/components/shared.css`
		const variant = `@import '../styles/layers.css';\n@import './shared.css';\n@layer components {}\n`
		expect(
			messages(tree({ [shared]: '@layer components {\n\t.shared {}\n}\n', [CARD]: variant })),
		).toEqual([])
		expect(messages(tree({ [shared]: '.shared {}\n', [CARD]: variant }))).toEqual([
			`${shared}:1: .shared outside @layer`,
		])
	})

	it('flags a package imported without layer(), except the self-layering tailwindcss', () => {
		const css =
			"@import '../styles/layers.css';\n@import 'swiper/css';\n@import 'photoswipe/style.css' layer(vendor);\n"
		expect(messages(tree({ [CARD]: css }))).toEqual([
			`${CARD}:2: @import 'swiper/css' brings in CSS outside a layer: add layer(<name>)`,
		])
	})

	it('flags an import without layer() of a file outside the checked trees', () => {
		const css =
			"@import '../styles/layers.css';\n@import '/public/extra.css';\n@import '../../../x.css';\n@import '/src/extra.pcss';\n"
		expect(messages(tree({ [CARD]: css }))).toEqual([
			`${CARD}:2: @import '/public/extra.css' brings in CSS outside a layer: add layer(<name>)`,
			`${CARD}:3: @import '../../../x.css' brings in CSS outside a layer: add layer(<name>)`,
			`${CARD}:4: @import '/src/extra.pcss' brings in CSS outside a layer: add layer(<name>)`,
		])
	})

	it('flags an inline <style> in an .astro file outside a layer, at its line in the file', () => {
		const astro = `---
// a comment that mentions <style> in prose
import './card.css'
---
<div />
<style is:global>
	@import '../styles/layers.css';

	.x { color: red; }
</style>
`
		const file = `${CORE}/components/card.astro`
		expect(messages(tree({ [file]: astro }))).toEqual([`${file}:9: .x outside @layer`])
	})

	it('flags an inline <style> without the order import and passes a layered one', () => {
		const file = `${CORE}/components/x.astro`
		const bare = '<style>\n\t@layer components { .x {} }\n</style>\n'
		expect(messages(tree({ [file]: bare }))).toEqual([`${file}:2: ${ENTRY}`])
		const layered =
			"<style is:global>\n\t@import '../styles/layers.css';\n\t@layer components { .x {} }\n</style>\n"
		expect(messages(tree({ [file]: layered }))).toEqual([])
	})

	it('flags global.css without the layout tokens imported into layer(theme)', () => {
		const tokens = "@import '/src/generated/layout-tokens.css' layer(theme);"
		const withoutLayer = GLOBAL.replace(
			tokens,
			"@import '/src/generated/layout-tokens.css' layer(base);",
		)
		expect(messages(tree({ [GLOBAL_CSS]: withoutLayer }))).toEqual([TOKENS])
		for (const condition of ['layer(theme) print', 'layer(theme) supports(display: grid)']) {
			const conditional = GLOBAL.replace(
				tokens,
				`@import '/src/generated/layout-tokens.css' ${condition};`,
			)
			expect(messages(tree({ [GLOBAL_CSS]: conditional })), condition).toEqual([TOKENS])
		}
		expect(messages(tree({ [GLOBAL_CSS]: GLOBAL.replace(`${tokens}\n`, '') }))).toContain(
			TOKENS,
		)
	})

	it('resolves a leading `/` import from the given site root, not from the core', () => {
		expect(messages(tree({}, 'sites/other'), 'sites/other')).toEqual([])
		// read with `site` as the root, the other site's theme is imported by nobody, so it is an entry
		expect(messages(tree({}, 'sites/other'))).toContain(
			`sites/other/src/theme/theme.css:2: ${ENTRY}`,
		)
		const relative = GLOBAL.replace(
			"'/src/generated/layout-tokens.css'",
			"'../generated/layout-tokens.css'",
		)
		expect(messages(tree({ [GLOBAL_CSS]: relative }))).toContain(TOKENS)
	})

	it("checks the site's theme file for rules outside a layer", () => {
		const theme = `${SITE}/src/theme/theme.css`
		expect(messages(tree({ [theme]: `${THEME}.x { color: red; }\n` }))).toEqual([
			`${theme}:7: .x outside @layer`,
		])
	})

	it('keeps layers.css to the single order statement', () => {
		const message = `${LAYERS_CSS}:1: ${LAYERS_CSS} must hold the single @layer order statement and nothing else`
		expect(messages(tree({ [LAYERS_CSS]: `${ORDER}.x {}\n` }))).toEqual([message])
		expect(messages(tree({ [LAYERS_CSS]: '@layer;\n' }))).toEqual([message])
	})

	it('reports a parse error instead of passing silently', () => {
		expect(messages(tree({ [CARD]: '@layer components {\n\t.x {\n' }))).toHaveLength(1)
	})
})
