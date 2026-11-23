// an svg named by the config, looked up in an eager `import.meta.glob` of one asset folder (`dir` is the
// glob's key prefix); a missing file fails the build with the icon name and the config key that named it
export function requireIcon(
	icons: Readonly<Record<string, string>>,
	dir: string,
	name: string,
	keyPath: string,
): string {
	const svg = icons[`${dir}${name}.svg`]
	if (svg === undefined)
		throw new Error(`${keyPath}: icon "${name}" not found (expected ${dir}${name}.svg)`)
	return svg
}
