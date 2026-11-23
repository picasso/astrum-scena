import type { SiteConfig } from '../../config/site-schema.ts'
import { COURSES_MODULE_ID } from './manifest.ts'
import type { CoursesConfig } from './schema.ts'

// `modules.courses` of the lock; the module's routes exist only while it is enabled, so a caller
// without it is a core bug, not a site error
export function coursesConfig(site: Pick<SiteConfig, 'modules'>): CoursesConfig {
	const config = site.modules[COURSES_MODULE_ID]
	if (!config) throw new Error(`module "${COURSES_MODULE_ID}" is not enabled`)
	return config
}
