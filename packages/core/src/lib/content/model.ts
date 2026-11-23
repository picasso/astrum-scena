import type { CourseData } from '../../modules/courses/schema.ts'
import type {
	AlbumData,
	ArticleData,
	Category,
	PageData,
	PhotoData,
	Place,
	Tag,
} from './schemas.ts'

export type ContentEntry<T> = {
	id: string
	data: T
}

export type ContentSnapshot = {
	albums: ContentEntry<AlbumData>[]
	photos: ContentEntry<PhotoData>[]
	articles: ContentEntry<ArticleData>[]
	pages: ContentEntry<PageData>[]
	// the courses module's collection, empty while the site does not enable it
	courses: ContentEntry<CourseData>[]
	categories: Category[]
	places: Place[]
	tags: Tag[]
}
