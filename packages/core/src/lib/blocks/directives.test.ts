import { describe, expect, it } from 'vitest'

import { parseCalloutAttributes } from './callout/schema.ts'
import {
	DIRECTIVE_ATTRIBUTES,
	type DirectiveAttributeSpec,
	type DirectiveName,
	DIRECTIVES,
} from './directives.ts'
import { parseLinksAttributes } from './links/schema.ts'
import { parseNoteAttributes } from './note/schema.ts'

type Parse = (attributes: Record<string, string>) => unknown

// the least a directive needs to parse, so each case varies one attribute
const PARSERS: Record<DirectiveName, { parse: Parse; base: Record<string, string> }> = {
	[DIRECTIVES.callout]: { parse: parseCalloutAttributes, base: {} },
	[DIRECTIVES.links]: { parse: parseLinksAttributes, base: {} },
	[DIRECTIVES.note]: { parse: parseNoteAttributes, base: { claim: 'finding:0123abcd' } },
}

const specs = DIRECTIVE_ATTRIBUTES as Record<DirectiveName, DirectiveAttributeSpec>

describe('the declared directive attributes are the ones each parser accepts', () => {
	for (const [directive, attributes] of Object.entries(specs)) {
		const { parse, base } = PARSERS[directive as DirectiveName]

		it(`${directive}: accepts every declared value and nothing else`, () => {
			for (const [name, { values }] of Object.entries(attributes)) {
				for (const value of values ?? [])
					expect(() => parse({ ...base, [name]: value })).not.toThrow()
				if (values) expect(() => parse({ ...base, [name]: 'zz-undeclared' })).toThrow(name)
			}
			expect(() => parse({ ...base, undeclared: '' })).toThrow(
				'unknown parameter "undeclared"',
			)
		})

		it(`${directive}: accepts every optional attribute omitted`, () => {
			const required = Object.entries(attributes)
				.filter(([, { required }]) => required)
				.map(([name]) => name)
			expect(Object.keys(base).sort()).toEqual(required.sort())
			expect(() => parse(base)).not.toThrow()
		})

		it(`${directive}: fails without a required attribute`, () => {
			for (const [name, { required }] of Object.entries(attributes)) {
				if (!required) continue
				const rest = { ...base }
				delete rest[name]
				expect(() => parse(rest)).toThrow(name)
			}
		})
	}
})
