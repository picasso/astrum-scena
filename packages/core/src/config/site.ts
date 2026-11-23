import { loadSiteConfig } from './loader.ts'
import { siteRoot } from './site-root.ts'

export * from './site-schema.ts'

// fails the build on an invalid config
export const site = loadSiteConfig(siteRoot)
