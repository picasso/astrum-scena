import { existsSync } from 'node:fs'
import path from 'node:path'

import { loadSeoConfig } from './loader.ts'
import { seoSchema } from './seo-schema.ts'
import { siteRoot } from './site-root.ts'

export { seoSchema }

export const seo = loadSeoConfig(siteRoot)
if (seo.socialImage && !existsSync(path.join(siteRoot, 'public', seo.socialImage.slice(1)))) {
	throw new Error(`SEO social image does not exist in public/: ${seo.socialImage}`)
}
