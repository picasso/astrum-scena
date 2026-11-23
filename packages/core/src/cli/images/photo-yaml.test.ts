import { describe, expect, it } from 'vitest'

import { setPhotoColorMode } from './photo-yaml.ts'

const LABEL = 'src/content/photos/example.yaml'

const WITH_PUBLISHED_AT = `title:
    en: Example
    ru: Пример
status: published
placeId: coastland
capturedAt: '2011'
publishedAt: 2017-03-17
favorite: false
tags:
    - dusk
legacyId: wp:attachment:1
`

const WITHOUT_PUBLISHED_AT = `title:
    en: Example
    ru: Пример
status: draft
placeId: coastland
capturedAt: '2011'
favorite: false
tags: []
legacyId: wp:attachment:1
`

describe('setPhotoColorMode', () => {
	it('inserts colorMode in the schema key order', () => {
		expect(setPhotoColorMode(WITH_PUBLISHED_AT, 'color', LABEL)).toEqual({
			output: WITH_PUBLISHED_AT.replace(
				'publishedAt: 2017-03-17\n',
				'publishedAt: 2017-03-17\ncolorMode: color\n',
			),
			previous: undefined,
		})
		expect(setPhotoColorMode(WITHOUT_PUBLISHED_AT, 'black-and-white', LABEL).output).toBe(
			WITHOUT_PUBLISHED_AT.replace(
				"capturedAt: '2011'\n",
				"capturedAt: '2011'\ncolorMode: black-and-white\n",
			),
		)
	})

	it('keeps folded scalars and comments byte for byte', () => {
		const raw = `title:
    en: Example
    ru: Пример
description:
    en: >-
        A folded line that
        continues here.
# owner note about the status
status: published
publishedAt: 2017-03-17 # activation day
favorite: false
tags: []`
		expect(setPhotoColorMode(raw, 'color', LABEL).output).toBe(
			raw.replace('favorite: false', 'colorMode: color\nfavorite: false'),
		)
	})

	it('appends with a trailing newline when no later key follows', () => {
		expect(setPhotoColorMode('status: draft', 'color', LABEL).output).toBe(
			'status: draft\ncolorMode: color\n',
		)
	})

	it('never replaces an authored colorMode and reports it', () => {
		const raw = WITH_PUBLISHED_AT.replace('favorite:', 'colorMode: black-and-white\nfavorite:')
		expect(setPhotoColorMode(raw, 'color', LABEL)).toEqual({
			output: raw,
			previous: 'black-and-white',
		})
	})

	it('names the file on broken YAML or an invalid value', () => {
		expect(() => setPhotoColorMode('title: [unclosed\n', 'color', LABEL)).toThrow(LABEL)
		expect(() => setPhotoColorMode('colorMode: sepia\n', 'color', LABEL)).toThrow(
			`${LABEL}: invalid colorMode "sepia"`,
		)
	})
})
