import { describe, expect, it } from 'vitest'

import { normalizeDescription, photoDescription, selectDescription } from './description.ts'

describe('SEO description', () => {
	it('prefers authored description, then document excerpt, then localized default', () => {
		expect(
			selectDescription('Default', { description: '<p>Album   story</p>', excerpt: 'Other' }),
		).toBe('Album story')
		expect(selectDescription('Default', { excerpt: 'Document excerpt' })).toBe(
			'Document excerpt',
		)
		expect(selectDescription('Default', { body: '# Heading\n\nFirst paragraph.' })).toBe(
			'First paragraph.',
		)
		expect(selectDescription('Default', {})).toBe('Default')
		expect(selectDescription('Default', { description: '  ', excerpt: 'Excerpt' })).toBe(
			'Excerpt',
		)
		expect(selectDescription('Default', { description: '<p></p>', excerpt: 'Excerpt' })).toBe(
			'Excerpt',
		)
		expect(
			selectDescription('Default', {
				body: '{/* internal */}\n<WrapAround imageId="photo" />\n:::note{title="Aside"}\nA real opening sentence.\n:::',
			}),
		).toBe('A real opening sentence.')
	})

	it('normalizes whitespace and bounds long descriptions', () => {
		const description = normalizeDescription('word '.repeat(80))
		expect(description.length).toBeLessThanOrEqual(161)
		expect(description).toMatch(/…$/)
	})

	it('uses photo context when no authored description exists', () => {
		expect(
			photoDescription({ title: 'Fog', caption: 'Tuscany, 2024', albumTitle: 'Sunrises' }),
		).toBe('Fog · Tuscany, 2024 · Sunrises')
		expect(
			photoDescription({ title: 'Fog', description: 'Authored', albumTitle: 'Sunrises' }),
		).toBe('Authored')
	})
})
