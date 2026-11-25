import type { Locale } from '../../config/locale-schema.ts'
import { localizedLabel } from '../../config/localized-label.ts'
import { resolveLocalizedRoute } from '../../config/localized-route.ts'
import type { SiteConfig } from '../../config/site-schema.ts'

export function privacyControllerModel(
	controller: SiteConfig['privacy']['controller'],
	locale: Locale,
): { name: string; contactHref: string } {
	return {
		name: localizedLabel(controller.name, locale),
		contactHref: resolveLocalizedRoute(controller.contact.href, locale),
	}
}
