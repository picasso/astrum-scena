import { type PhotoActionRouteInput, resolvePhotoActionHref } from '../photo-route.ts'

export type WrapPhotoRouteInput = Omit<PhotoActionRouteInput, 'block'>

export function resolveWrapPhotoHref(input: WrapPhotoRouteInput): string {
	return resolvePhotoActionHref({ ...input, block: 'WrapAround' })
}
