// the step of UPGRADING.md from `schemaVersion: 2` to 3 on a site.yaml object: the course settings
// move from the top-level sections into `modules.courses`, which enables the module. A section the
// site never wrote stays out, so the module takes the core's default for it
type Tree = Record<string, unknown>

const take = (tree: Tree | undefined, key: string): unknown => {
	if (!tree || !(key in tree)) return undefined
	const value = tree[key]
	delete tree[key]
	return value
}

export function withCoursesModule(site: Tree): Tree {
	const next = structuredClone(site)
	const courses = (take(next, 'courses') ?? {}) as Tree
	const moreDocs = take(next.moreDocs as Tree | undefined, 'course')
	const surface = take(next.surfaces as Tree | undefined, 'coursesIndex')
	const banner = take(
		(next.banners as Tree | undefined)?.surfaces as Tree | undefined,
		'coursesIndex',
	)
	next.schemaVersion = 3
	next.modules = {
		courses: {
			...courses,
			...(moreDocs === undefined ? {} : { moreDocs }),
			...(surface === undefined ? {} : { surface }),
			...(banner === undefined ? {} : { banner }),
		},
	}
	return next
}
