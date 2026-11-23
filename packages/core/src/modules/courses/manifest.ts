import path from 'node:path'

import { LOCALIZED_DOCUMENT_PATTERN } from '../../config/collection-sources.ts'
import { CORE_SRC } from '../../integration-parts.ts'
import { defineModule, type ModuleManifest } from '../manifest.ts'
import en from './en.json' with { type: 'json' }
import ru from './ru.json' with { type: 'json' }
import { courseSchema, coursesConfigSchema } from './schema.ts'

export const COURSES_MODULE_ID = 'courses'
export const COURSES_COLLECTION = 'courses'
export const COURSES_SEGMENT = 'courses'
export const COURSES_INDEX_SURFACE = 'coursesIndex'

// the reference module: courses with an archive or open status, their index and pages
export const coursesModule: ModuleManifest<typeof COURSES_MODULE_ID, typeof coursesConfigSchema> =
	defineModule({
		id: COURSES_MODULE_ID,
		collections: {
			[COURSES_COLLECTION]: {
				source: { base: './src/content/courses', pattern: LOCALIZED_DOCUMENT_PATTERN },
				schema: courseSchema,
				versions: [1],
			},
		},
		pagesDir: path.join(CORE_SRC, 'modules', 'courses', 'pages'),
		segments: [COURSES_SEGMENT],
		config: coursesConfigSchema,
		i18n: { namespace: 'courses', dictionaries: { en, ru } },
		mdx: [],
		directives: [],
		tokens: ['--status-badge-courses'],
		menu: [COURSES_SEGMENT],
		dependsOn: [],
		moreDocsKinds: ['course'],
		surfaceBanners: (config) => ({ [COURSES_INDEX_SURFACE]: config.banner }),
	})

export type CoursesUIKey = keyof typeof en
