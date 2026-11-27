import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { dimensionIconIssues, lucideIconsDir, lucideIconSvg } from './lucide-icons.ts'

const label = { en: 'Events' }
const scratch: string[] = []
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { force: true, recursive: true })
})

describe('lucide icons', () => {
	it("resolves the icons of the core's lucide-static", () => {
		expect(existsSync(path.join(lucideIconsDir(), 'calendar-days.svg'))).toBe(true)
	})

	it('names each dimension whose icon the package lacks, by its site.yaml path', () => {
		expect(
			dimensionIconIssues({
				events: { label, icon: 'calendar-days' },
				people: { label },
				places: { label, icon: 'calendr' },
			}),
		).toEqual([
			{
				path: ['content', 'taxonomy', 'dimensions', 'places', 'icon'],
				message:
					'"calendr" is not a Lucide icon of lucide-static (https://lucide.dev/icons)',
			},
		])
	})

	it("gives the package's SVG on one line with its licence comment", () => {
		const svg = lucideIconSvg(lucideIconsDir(), 'calendar-days')
		expect(svg).toMatch(
			/^<!-- @license lucide-static v[\d.]+ - ISC --> <svg[^>]*class="lucide lucide-calendar-days"[^>]*>/,
		)
		expect(svg).toMatch(/<\/svg>$/)
		expect(svg).not.toContain('\n')
		expect(() => lucideIconSvg(lucideIconsDir(), 'calendr')).toThrow(
			'"calendr" is not a Lucide icon',
		)
	})

	it('refuses a file that is not an SVG document', () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'lucide-icons-'))
		scratch.push(dir)
		writeFileSync(path.join(dir, 'broken.svg'), '<script>alert(1)</script>')
		expect(() => lucideIconSvg(dir, 'broken')).toThrow('not an SVG document')
	})
})
