import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CORE_ROOT } from '../../../core-root.ts'

describe('wrap-around spacing tokens', () => {
	it('keeps text gaps on the legacy expressive scale', () => {
		const css = readFileSync(path.join(CORE_ROOT, 'src/styles/blocks/wrap-around.css'), 'utf8')
		const expected = {
			none: '0',
			tiny: '0.5em',
			small: '1em',
			medium: '1.5em',
			large: '2em',
		}

		for (const [name, value] of Object.entries(expected)) {
			expect(css).toContain(`--wrap-text-gap-${name}: ${value};`)
		}
	})
})
