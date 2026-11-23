import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { localizedLabel } from '../config/localized-label.ts'
import { site } from '../config/site.ts'
import { useTranslations } from '../i18n/ui'
import { footerPromoContext } from '../lib/portfolio/footer-promo-build.ts'
import SiteFooter from './site-footer.astro'
import Replacement from './test-fixtures/footer-copyright-replacement.astro'

// the demo replaces no footer point, so the replacement comes from the fixture through the module
const state = vi.hoisted(() => ({ overrides: {} as Record<string, unknown> }))
vi.mock('virtual:astrum-scena/overrides', () => ({ overrides: state.overrides }))

let container: AstroContainer
beforeAll(async () => {
	container = await AstroContainer.create()
})
afterEach(() => {
	delete state.overrides['footer-copyright']
})

const copyrightLine = async (): Promise<string> => {
	const html = await container.renderToString(SiteFooter, {
		props: { lang: 'en', promo: footerPromoContext('test:footer-copyright') },
	})
	return (/<p class="site-footer__copyright"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '').trim()
}

const { since, holder } = site.identity.copyright
const year = new Date().getFullYear()
const rights = useTranslations('en')('home.copyright.rights')

describe('the footer-copyright point', () => {
	it('keeps the default line without a replacement', async () => {
		expect(await copyrightLine()).toBe(
			`<span>Copyright © ${since}-${year} ${localizedLabel(holder, 'en')}.</span> <span>${rights}</span>`,
		)
	})

	it("renders the site's component inside the core's copyright element", async () => {
		state.overrides['footer-copyright'] = Replacement
		const line = await copyrightLine()
		expect(line).toContain('data-replacement="footer-copyright"')
		expect(line).toContain(`en: ${since}–${year} ${localizedLabel(holder, 'en')} / ${rights}`)
		expect(line).not.toContain('Copyright ©')
	})
})
