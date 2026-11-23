import { ExifTool, type Tags, type WriteTags } from 'exiftool-vendored'

// a thin adapter over exiftool-vendored; the metadata logic lives in metadata.ts. One child process
// serves a command and `endExifTool` releases it

let instance: ExifTool | null = null

const exifTool = (): ExifTool => (instance ??= new ExifTool())

// every tag; allowlist filtering and redaction are the caller's job
export function readTags(filePath: string): Promise<Tags> {
	return exifTool().read(filePath)
}

// keys carry their family-1 group (`XMP-photoshop:Credit`), so rights can be proven to sit in the
// exact namespace, and denied tags can be found by base name in any group
export async function readNamespacedTags(filePath: string): Promise<Record<string, unknown>> {
	return (await exifTool().readRaw(filePath, { readArgs: ['-G1', '-s', '-a'] })) as Record<
		string,
		unknown
	>
}

// `-overwrite_original` leaves no `_original` sidecar; `Group:Tag` keys reach the CLI as they are
export async function writeTags(
	filePath: string,
	tags: WriteTags | Record<string, string | number | boolean>,
): Promise<void> {
	await exifTool().write(filePath, tags as WriteTags, { writeArgs: ['-overwrite_original'] })
}

// after use, or the child process keeps the command alive
export async function endExifTool(): Promise<void> {
	if (!instance) return
	const current = instance
	instance = null
	await current.end()
}

export async function withExifTool<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn()
	} finally {
		await endExifTool()
	}
}
