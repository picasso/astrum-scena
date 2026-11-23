import astrumScena from '@picasso-ai/astrum-scena'
import { defineConfig } from 'astro/config'

// the origin, locales and everything else come from site.yaml
export default defineConfig({
	integrations: [astrumScena()],
})
