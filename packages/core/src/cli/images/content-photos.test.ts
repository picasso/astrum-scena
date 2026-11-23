import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { contentPhotoIds, hasPhotoFile, photosDir, readContentPhoto } from './content-photos.ts'

const scratch = mkdtempSync(path.join(tmpdir(), 'astrum-scena-content-photos-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const site = (name: string): string => {
	const root = path.join(scratch, name)
	mkdirSync(photosDir(root), { recursive: true })
	return root
}

describe('content photos', () => {
	it('lists, finds and reads a photo written as .yaml or .yml', () => {
		const root = site('both-extensions')
		writeFileSync(path.join(photosDir(root), 'a-photo.yaml'), 'placeId: one\n')
		writeFileSync(path.join(photosDir(root), 'b-photo.yml'), 'placeId: two\n')
		writeFileSync(path.join(photosDir(root), 'notes.txt'), 'x\n')
		expect(contentPhotoIds(root)).toEqual(['a-photo', 'b-photo'])
		expect(hasPhotoFile(root, 'b-photo')).toBe(true)
		expect(hasPhotoFile(root, 'c-photo')).toBe(false)
		expect(readContentPhoto(root, 'b-photo').data).toEqual({ placeId: 'two' })
		expect(() => readContentPhoto(root, 'c-photo')).toThrow('content photo "c-photo" not found')
	})

	it('rejects a photo written in both extensions', () => {
		const root = site('duplicate')
		writeFileSync(path.join(photosDir(root), 'a-photo.yaml'), 'placeId: one\n')
		writeFileSync(path.join(photosDir(root), 'a-photo.yml'), 'placeId: one\n')
		const message = 'content photo "a-photo" has both a .yaml and a .yml file'
		expect(() => contentPhotoIds(root)).toThrow(message)
		expect(() => readContentPhoto(root, 'a-photo')).toThrow(message)
	})
})
