import { rename, writeFile } from 'node:fs/promises'

// the content commands write files as the site's own prettier would, and the factcheck gate compares
// the review packet with one formatted so. Prettier is an optional peer of the core, imported only by
// those commands, so a site without it runs every other command

export const PRETTIER_PACKAGE = 'prettier'

export type PrettierModule = typeof import('prettier')

export type PrettierImport = () => Promise<PrettierModule>

const isMissingPackage = (error: unknown): boolean =>
	(error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' &&
	(error as Error).message.includes(`'${PRETTIER_PACKAGE}'`)

export async function loadPrettier(
	importModule: PrettierImport = () => import('prettier'),
): Promise<PrettierModule> {
	try {
		return await importModule()
	} catch (error) {
		if (!isMissingPackage(error)) throw error
		throw new Error(
			`the content commands that write or compare formatted files need ${PRETTIER_PACKAGE}, an optional peer of the core; ` +
				`install it in the site: pnpm add -D ${PRETTIER_PACKAGE}`,
			{ cause: error },
		)
	}
}

// formatted with the prettier config that applies to the file
export async function formatFor(
	prettier: PrettierModule,
	filePath: string,
	content: string,
): Promise<string> {
	const config = await prettier.resolveConfig(filePath)
	return prettier.format(content, { ...config, filepath: filePath })
}

// written beside the file, then renamed over it, so a failure never leaves a half-written file
export async function replaceFile(filePath: string, content: string): Promise<void> {
	const temporaryPath = `${filePath}.tmp`
	await writeFile(temporaryPath, content, 'utf8')
	await rename(temporaryPath, filePath)
}
