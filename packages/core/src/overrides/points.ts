import { readdirSync } from 'node:fs'
import path from 'node:path'

import type { Locale } from '../config/locale-schema.ts'

// the named replacement points: a site puts `src/overrides/<point>.astro` in its root and the
// core renders that component in place of its own visual part, while the element around it, its
// links, classes and scripts stay the core's

export type LogoReplacementProps = {
	// the header's logo slot, or the banner corner that shows the logo below the menu breakpoint
	placement: 'header' | 'banner'
	lang: Locale
	// the localized `identity.title`; the core's link around the mark already carries it as its name
	title: string
}

export type FooterCopyrightReplacementProps = {
	lang: Locale
	// `identity.copyright.since` and the year of the build
	since: number
	year: number
	// the localized `identity.copyright.holder`
	holder: string
	// the `home.copyright.rights` text of the locale
	rights: string
}

export type ReplacementPointProps = {
	logo: LogoReplacementProps
	'footer-copyright': FooterCopyrightReplacementProps
}

export type ReplacementPoint = keyof ReplacementPointProps

// a Record, so a point added to the props map cannot be left out of the list
const POINTS: Record<ReplacementPoint, true> = { logo: true, 'footer-copyright': true }

export const REPLACEMENT_POINTS = (Object.keys(POINTS) as ReplacementPoint[]).sort()

export const OVERRIDES_DIR = 'src/overrides'

const isPoint = (name: string): name is ReplacementPoint => Object.hasOwn(POINTS, name)

export type OverrideEntry = { name: string; isFile: boolean }

// one problem per entry of the site's overrides directory that does not replace a known point; a
// hidden entry (`.DS_Store`) is the file system's, not the site's
export function replacementProblems(entries: readonly OverrideEntry[]): string[] {
	return entries.flatMap(({ name, isFile }) => {
		if (name.startsWith('.')) return []
		const file = `${OVERRIDES_DIR}/${name}`
		if (!isFile || !name.endsWith('.astro'))
			return [`${file}: only .astro components replace a point`]
		const point = name.slice(0, -'.astro'.length)
		return isPoint(point)
			? []
			: [
					`${file}: unknown replacement point "${point}"; known: ${REPLACEMENT_POINTS.join(', ')}`,
				]
	})
}

// the absolute file of each point the site replaces; a site without the directory replaces none
export function siteReplacements(siteRoot: string): Map<ReplacementPoint, string> {
	const dir = path.join(siteRoot, OVERRIDES_DIR)
	let entries: OverrideEntry[]
	try {
		entries = readdirSync(dir, { withFileTypes: true }).map((entry) => ({
			name: entry.name,
			isFile: entry.isFile(),
		}))
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map()
		throw error
	}
	entries.sort((a, b) => a.name.localeCompare(b.name))
	const problems = replacementProblems(entries)
	if (problems.length > 0)
		throw new Error(
			`replacement points (${OVERRIDES_DIR}/<point>.astro):\n  ${problems.join('\n  ')}`,
		)
	return new Map(
		entries
			.filter(({ name }) => !name.startsWith('.'))
			.map(({ name }) => [
				name.slice(0, -'.astro'.length) as ReplacementPoint,
				path.join(dir, name),
			]),
	)
}
