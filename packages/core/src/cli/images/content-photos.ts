import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { parse as parseYaml } from 'yaml'

import { COLLECTION_SOURCES } from '../../config/collection-sources.ts'

// the photo records the image commands read as YAML, past the content collection: each command
// needs only a few fields (the master identity, the placeId) of the records it works on

// the extensions of the collection's loader (`DATA_ENTRY_PATTERN`); an id has one file
const PHOTO_EXTENSIONS = ['.yaml', '.yml'] as const

export const photosDir = (root: string): string =>
	path.resolve(root, COLLECTION_SOURCES.photos.base)

// the file of a photo, undefined when it has none; a photo written twice is an error
export function photoFile(root: string, photoId: string): string | undefined {
	const files = PHOTO_EXTENSIONS.map((extension) =>
		path.join(photosDir(root), `${photoId}${extension}`),
	).filter((file) => existsSync(file))
	if (files.length > 1)
		throw new Error(`content photo "${photoId}" has both a .yaml and a .yml file`)
	return files[0]
}

export const hasPhotoFile = (root: string, photoId: string): boolean =>
	photoFile(root, photoId) !== undefined

export type ContentPhoto = {
	id: string
	filePath: string
	raw: string
	data: unknown
}

export function readContentPhoto(root: string, photoId: string): ContentPhoto {
	const filePath = photoFile(root, photoId)
	if (filePath === undefined) throw new Error(`content photo "${photoId}" not found`)
	const raw = readFileSync(filePath, 'utf8')
	let data: unknown
	try {
		data = parseYaml(raw)
	} catch (error) {
		throw new Error(`content photo "${path.basename(filePath)}": ${(error as Error).message}`)
	}
	return { id: photoId, filePath, raw, data }
}

export function contentPhotoIds(root: string): string[] {
	const dir = photosDir(root)
	if (!existsSync(dir)) return []
	const ids = readdirSync(dir).flatMap((name) => {
		const extension = PHOTO_EXTENSIONS.find((candidate) => name.endsWith(candidate))
		return extension ? [name.slice(0, -extension.length)] : []
	})
	const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
	if (duplicate !== undefined)
		throw new Error(`content photo "${duplicate}" has both a .yaml and a .yml file`)
	return ids.sort()
}

export function photoPlaceId(photo: ContentPhoto): string | undefined {
	const data = photo.data
	if (data === null || typeof data !== 'object') return undefined
	const placeId = (data as Record<string, unknown>).placeId
	return typeof placeId === 'string' ? placeId : undefined
}
