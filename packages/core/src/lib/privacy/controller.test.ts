import { describe, expect, it } from 'vitest'

import { privacySchema } from '../../config/privacy.ts'
import { privacyControllerModel } from './controller.ts'

const { controller } = privacySchema.parse({
	controller: {
		name: { en: 'Example Person', ru: 'Пример Человека' },
		contact: { kind: 'internal', href: '/{lang}/contacts/' },
	},
})

describe('privacyControllerModel', () => {
	it('renders locale-specific identity and contact route from a fixture', () => {
		expect(privacyControllerModel(controller, 'en')).toEqual({
			name: 'Example Person',
			contactHref: '/en/contacts/',
		})
		expect(privacyControllerModel(controller, 'ru')).toEqual({
			name: 'Пример Человека',
			contactHref: '/ru/contacts/',
		})
	})
})
